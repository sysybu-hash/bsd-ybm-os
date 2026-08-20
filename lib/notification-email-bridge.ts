import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isMailTransportConfigured } from "@/lib/mail-config";
import {
  EMAIL_DIGEST_CATEGORY,
  enqueueDigestEmail,
} from "@/lib/email-digest";

const log = createLogger("notification-email");

/** כותרות/מילות מפתח שמצדיקות שליחת מייל (בנוסף להתראה באפליקציה) */
const EMAIL_TITLE_PATTERNS: RegExp[] = [
  /^משימות באיחור/,
  /^משימות להיום/,
  /נחתם/,
  /קפיצת מחיר/,
  /הצעת מחיר ממתינה/,
  /^חשבונית חדשה נסרקה/,
  /^השלמת מחיר נדרשת/,
];

export function shouldEmailForNotificationTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return EMAIL_TITLE_PATTERNS.some((re) => re.test(t));
}

/** מייל התראה למשתמש בודד — לא חוסם את יצירת ההתראה באפליקציה */
export async function maybeEmailUserNotification(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!isMailTransportConfigured() || !shouldEmailForNotificationTitle(title)) {
    return;
  }

  try {
    const { canEnqueueNotificationEmails } = await import("@/lib/mail/platform-mail-settings");
    if (!(await canEnqueueNotificationEmails())) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, accountStatus: true, organizationId: true },
    });
    if (!user) return;
    const email = user.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (user.accountStatus !== "ACTIVE") return;

    if (user.organizationId) {
      const { orgAllowsNotificationEmails } = await import("@/lib/mail/org-mail-settings");
      if (!(await orgAllowsNotificationEmails(user.organizationId))) return;
    }

    await enqueueDigestEmail({
      recipient: email,
      category: EMAIL_DIGEST_CATEGORY.NOTIFICATION,
      title,
      body,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("maybeEmailUserNotification failed", { userId, error: msg });
  }
}

/** מייל התראה למנהלי ארגון — לתזכורות ארגוניות (משימות וכו') */
export async function maybeEmailOrgAdminsNotification(
  organizationId: string,
  title: string,
  body: string,
): Promise<void> {
  if (!isMailTransportConfigured() || !shouldEmailForNotificationTitle(title)) {
    return;
  }

  try {
    const { canEnqueueNotificationEmails } = await import("@/lib/mail/platform-mail-settings");
    if (!(await canEnqueueNotificationEmails())) return;

    const { orgAllowsNotificationEmails } = await import("@/lib/mail/org-mail-settings");
    if (!(await orgAllowsNotificationEmails(organizationId))) return;

    const admins = await prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ["ORG_ADMIN", "SUPER_ADMIN"] },
        accountStatus: "ACTIVE",
      },
      select: { email: true },
    });

    const emails = [
      ...new Set(
        admins
          .map((a) => a.email?.trim().toLowerCase())
          .filter((e): e is string => !!e && e.includes("@")),
      ),
    ];
    if (emails.length === 0) return;

    await Promise.all(
      emails.map((email) =>
        enqueueDigestEmail({
          recipient: email,
          category: EMAIL_DIGEST_CATEGORY.NOTIFICATION,
          title,
          body,
        }),
      ),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("maybeEmailOrgAdminsNotification failed", { organizationId, error: msg });
  }
}
