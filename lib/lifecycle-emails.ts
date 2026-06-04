/**
 * Lifecycle Email Sequences — drip marketing automation.
 *
 * 1. Trial ending warning (3 days before expiry)
 * 2. Re-activation nudge (7 days of inactivity)
 *
 * All emails include List-Unsubscribe and honor the "unsubscribed" contact tag.
 * Phase B — Growth / שיווק מאסיבי
 */

import { sendTransactionalEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { PRODUCTION_SITE_URL } from "@/lib/core/site-url";
import { createHmac } from "crypto";
import { env } from "@/lib/env";

const log = createLogger("lifecycle-emails");

function buildUnsubToken(email: string): string {
  const secret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET ?? "fallback";
  return createHmac("sha256", secret)
    .update(`unsubscribe:${email.toLowerCase()}`)
    .digest("hex");
}

function unsubscribeUrl(email: string): string {
  const token = buildUnsubToken(email);
  return `${PRODUCTION_SITE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

async function isUnsubscribed(email: string): Promise<boolean> {
  const contact = await prisma.contact.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: "insensitive" } },
    select: { tags: true },
  });
  return contact?.tags.includes("unsubscribed") ?? false;
}

// ── 1. Trial Ending Warning ───────────────────────────────────────────────────

export async function sendTrialEndingWarning(
  email: string,
  name: string | null,
  daysLeft: number,
): Promise<void> {
  if (await isUnsubscribed(email)) return;
  const firstName = name?.split(" ")[0] ?? "שלום";
  const unsub = unsubscribeUrl(email);

  const result = await sendTransactionalEmail(
    email,
    `⏰ ${firstName}, נשארו לך ${daysLeft} ימים בתקופת הניסיון`,
    `<div dir="rtl" style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>⏰ תקופת הניסיון שלך מסתיימת בקרוב</h2>
      <p>${firstName}, נשארו לך <strong>${daysLeft} ימים</strong> בתקופת הניסיון החינמית.</p>
      <p>שדרג עכשיו ושמור על כל הנתונים, הפרויקטים, ויומני העבודה שלך.</p>
      <a href="${PRODUCTION_SITE_URL}/app/settings?tab=billing"
         style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
        שדרג מנוי →
      </a>
      <p style="font-size:11px;color:#888;margin-top:32px">
        <a href="${unsub}" style="color:#888">הסרה מרשימת תפוצה</a>
      </p>
    </div>`,
  );

  if (!result.ok) {
    log.warn("lifecycle_trial_ending_failed", { error: result.error });
  } else {
    log.info("lifecycle_trial_ending_sent", { daysLeft });
  }
}

// ── 2. Re-activation Nudge ────────────────────────────────────────────────────

export async function sendReactivationNudge(
  email: string,
  name: string | null,
  daysSinceLogin: number,
): Promise<void> {
  if (await isUnsubscribed(email)) return;
  const firstName = name?.split(" ")[0] ?? "שלום";
  const unsub = unsubscribeUrl(email);

  const result = await sendTransactionalEmail(
    email,
    `${firstName}, חסרת לנו! 👷 מה חדש ב-BSD-YBM`,
    `<div dir="rtl" style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>👷 חזרת? יש הרבה חדש!</h2>
      <p>${firstName}, לא ראינו אותך ${daysSinceLogin} ימים.</p>
      <p>בינתיים הוספנו:</p>
      <ul>
        <li>🎤 יומן עבודה קולי — הקלט ביומן בלחיצה אחת</li>
        <li>📊 גנט מלא עם היררכיה ו-drag-to-update</li>
        <li>🤖 פענוח גרמושקה עם תצוגה מקדימה לפני שמירה</li>
      </ul>
      <a href="${PRODUCTION_SITE_URL}"
         style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
        חזור לעבודה →
      </a>
      <p style="font-size:11px;color:#888;margin-top:32px">
        <a href="${unsub}" style="color:#888">הסרה מרשימת תפוצה</a>
      </p>
    </div>`,
  );

  if (!result.ok) {
    log.warn("lifecycle_reactivation_failed", { error: result.error });
  } else {
    log.info("lifecycle_reactivation_sent", { daysSinceLogin });
  }
}

// ── Cron runner ───────────────────────────────────────────────────────────────

export async function runLifecycleCampaigns(): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  const now = new Date();

  // Trial ending: FREE tier, ~3 days before expiry
  const trialEndingSoon = await prisma.organization.findMany({
    where: {
      subscriptionTier: "FREE",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: {
        gte: new Date(now.getTime() + 2 * 86400000),
        lte: new Date(now.getTime() + 4 * 86400000),
      },
    },
    select: {
      users: { select: { email: true, name: true }, take: 1, where: { role: "ORG_ADMIN" } },
      trialEndsAt: true,
    },
    take: 500,
  });

  for (const org of trialEndingSoon) {
    const admin = org.users[0];
    if (!admin || !org.trialEndsAt) continue;
    const daysLeft = Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86400000);
    try {
      await sendTrialEndingWarning(admin.email, admin.name, daysLeft);
      sent++;
    } catch {
      skipped++;
    }
  }

  // Re-activation: users who haven't logged in for ~7 days
  const inactiveUsers = await prisma.user.findMany({
    where: {
      lastLoginAt: { lte: new Date(now.getTime() - 7 * 86400000) },
      accountStatus: "ACTIVE",
    },
    select: { email: true, name: true, lastLoginAt: true },
    take: 200,
  });

  for (const user of inactiveUsers) {
    const daysSince = user.lastLoginAt
      ? Math.floor((now.getTime() - user.lastLoginAt.getTime()) / 86400000)
      : 7;
    try {
      await sendReactivationNudge(user.email, user.name, daysSince);
      sent++;
    } catch {
      skipped++;
    }
  }

  return { sent, skipped };
}
