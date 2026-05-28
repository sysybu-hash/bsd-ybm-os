import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isMailTransportConfigured } from "@/lib/mail-config";
import { sendDigestSummaryEmail } from "@/lib/mail";
import {
  EMAIL_DIGEST_CATEGORY,
  type DigestLineItem,
  type EmailDigestCategory,
} from "@/lib/email-digest-types";

export { EMAIL_DIGEST_CATEGORY, type DigestLineItem, type EmailDigestCategory };

const log = createLogger("email-digest");

/** ממתין לפחות דקה לפני שליחת סיכום (לאפשר איגוד בזמן קצר) */
const DIGEST_MIN_WAIT_MS = 60_000;

/** מעל מספר זה — שליחת סיכום מיידית */
const DIGEST_MAX_ITEMS = 10;

const CATEGORY_SUBJECT: Record<EmailDigestCategory, (count: number) => string> = {
  [EMAIL_DIGEST_CATEGORY.NOTIFICATION]: (n) =>
    n === 1 ? "BSD-YBM — התראה מהמערכת" : `BSD-YBM — סיכום ${n} התראות`,
  [EMAIL_DIGEST_CATEGORY.ADMIN_PENDING_REGISTRATION]: (n) =>
    n === 1
      ? "BSD-YBM-OS — הרשמה ממתינה לאישור"
      : `BSD-YBM-OS — ${n} הרשמות ממתינות לאישור`,
  [EMAIL_DIGEST_CATEGORY.ADMIN_ALERT]: (n) =>
    n === 1 ? "BSD-YBM-OS — עדכון מנהל" : `BSD-YBM-OS — סיכום ${n} עדכונים`,
};

export function buildDigestPreviewLines(items: DigestLineItem[]): string[] {
  return items.map((item, index) => {
    const title = item.title.trim();
    const body = item.body.trim();
    if (body && body !== title) {
      return `${index + 1}. ${title} — ${body}`;
    }
    return `${index + 1}. ${title}`;
  });
}

function shouldFlushByAge(items: DigestLineItem[]): boolean {
  if (items.length < 2) return false;
  const oldest = items[0]!.createdAt.getTime();
  return Date.now() - oldest >= DIGEST_MIN_WAIT_MS;
}

async function loadPendingItems(
  recipient: string,
  category: EmailDigestCategory,
): Promise<DigestLineItem[]> {
  const rows = await prisma.emailDigestItem.findMany({
    where: { recipient, category },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { title: true, body: true, createdAt: true },
  });
  return rows.map((r) => ({
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
  }));
}

export async function flushDigestBucket(
  recipient: string,
  category: EmailDigestCategory,
): Promise<{ sent: boolean; count: number }> {
  if (!isMailTransportConfigured()) {
    return { sent: false, count: 0 };
  }

  const normalized = recipient.trim().toLowerCase();
  const rows = await prisma.emailDigestItem.findMany({
    where: { recipient: normalized, category },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (rows.length === 0) {
    return { sent: false, count: 0 };
  }

  const items: DigestLineItem[] = rows.map((r) => ({
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
  }));

  const subject = CATEGORY_SUBJECT[category](items.length);
  const result = await sendDigestSummaryEmail(normalized, {
    subject,
    items,
    category,
  });

  if (!result.ok) {
    log.warn("flushDigestBucket send failed", {
      recipient: normalized,
      category,
      error: result.error,
      count: items.length,
    });
    return { sent: false, count: items.length };
  }

  await prisma.emailDigestItem.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });

  return { sent: true, count: items.length };
}

/**
 * מוסיף שורה לתור ומאגד למייל אחד כשיש מספיק פריטים או אחרי חלון המתנה.
 */
export async function enqueueDigestEmail(params: {
  recipient: string;
  category: EmailDigestCategory;
  title: string;
  body: string;
}): Promise<void> {
  if (!isMailTransportConfigured()) return;

  const recipient = params.recipient.trim().toLowerCase();
  if (!recipient.includes("@")) return;

  const title = params.title.trim();
  const body = params.body.trim();
  if (!title) return;

  try {
    await prisma.emailDigestItem.create({
      data: {
        recipient,
        category: params.category,
        title,
        body: body || title,
      },
    });

    const pending = await loadPendingItems(recipient, params.category);
    if (pending.length >= DIGEST_MAX_ITEMS || shouldFlushByAge(pending)) {
      await flushDigestBucket(recipient, params.category);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("enqueueDigestEmail failed", { recipient, category: params.category, error: msg });
  }
}

/** שליחת סיכומים לכל הנמענים שיש להם פריטים ממתינים (cron) */
export async function flushAllEmailDigests(): Promise<{
  buckets: number;
  sent: number;
  items: number;
}> {
  if (!isMailTransportConfigured()) {
    return { buckets: 0, sent: 0, items: 0 };
  }

  const groups = await prisma.emailDigestItem.groupBy({
    by: ["recipient", "category"],
    _count: { id: true },
  });

  let sent = 0;
  let items = 0;

  for (const g of groups) {
    const category = g.category as EmailDigestCategory;
    if (!Object.values(EMAIL_DIGEST_CATEGORY).includes(category)) {
      continue;
    }
    const result = await flushDigestBucket(g.recipient, category);
    if (result.sent) {
      sent += 1;
      items += result.count;
    }
  }

  return { buckets: groups.length, sent, items };
}

/** מייל מנהל — כל כתובת ב-ADMIN_EMAILS מקבלת תור נפרד */
export async function enqueueDigestEmailToMany(
  recipients: string[],
  category: EmailDigestCategory,
  title: string,
  body: string,
): Promise<void> {
  const unique = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  await Promise.all(
    unique.map((recipient) => enqueueDigestEmail({ recipient, category, title, body })),
  );
}
