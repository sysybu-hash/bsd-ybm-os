import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { isMailTransportConfigured } from "@/lib/mail-config";
import { sendNotificationEmail } from "@/lib/mail";

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, accountStatus: true },
    });
    if (!user) return;
    const email = user.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (user.accountStatus !== "ACTIVE") return;

    const result = await sendNotificationEmail(email, title, body);
    if (!result.ok) {
      log.warn("user notification email failed", { userId, error: result.error });
    }
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

    const results = await Promise.all(
      emails.map((email) => sendNotificationEmail(email, title, body)),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      log.warn("org admin notification email partial failure", {
        organizationId,
        failed: failed.length,
        total: emails.length,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("maybeEmailOrgAdminsNotification failed", { organizationId, error: msg });
  }
}
