import { osAdminEmails } from "@/lib/is-admin";
import { createLogger } from "@/lib/logger";
import { EMAIL_DIGEST_CATEGORY } from "@/lib/email-digest-types";
import { getMailFrom } from "@/lib/mail-config";
import { sendTransactionalEmail, escapeHtml, mailSiteUrl } from "@/lib/mail-core";

const log = createLogger("mail-campaigns-auth");

export async function sendTestEmail(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">בדיקת מייל BSD-YBM</h1>
    <p style="margin:0;color:#94a3b8;font-size:14px;text-align:center;">
      אם קיבלתם הודעה זו, שליחת המייל מהמערכת פעילה.
    </p>
    <p style="margin:16px 0 0;color:#64748b;font-size:12px;text-align:center;">
      שולח: ${escapeHtml(getMailFrom())}
    </p>`;
  return sendTransactionalEmail(to.trim().toLowerCase(), "BSD-YBM — בדיקת מייל", inner);
}

export async function sendWelcomeEmail(toEmail: string, name: string | null): Promise<void> {
  const greeting = name?.trim() ? `שלום ${name.trim()},` : "שלום,";
  const inner = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">ברוכים הבאים ל־BSD-YBM-OS</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;text-align:center;">
      הבקשה להצטרפות נקלטה. לאחר אישור מנהל המערכת תקבלו גישה מלאה לניהול הארגון.
    </p>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="${mailSiteUrl()}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        מעבר לדף הכניסה
      </a>
    </p>`;
  const r = await sendTransactionalEmail(toEmail.trim().toLowerCase(), "ברוכים הבאים ל־BSD-YBM", inner);
  if (!r.ok) {
    log.warn("sendWelcomeEmail failed", { error: r.error });
  }
}

export async function sendRegistrationWelcomeEmail(
  toEmail: string,
  name: string | null,
  params: {
    tierLabelHe: string;
    tierKey: string;
    accountActive: boolean;
    extraNote?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const greeting = name?.trim() ? `שלום ${name.trim()},` : "שלום,";
  const statusLine = params.accountActive
    ? "החשבון שלך פעיל — ניתן להתחבר עם האימייל והסיסמה שבחרתם, או עם Google באותו אימייל."
    : "ההרשמה התקבלה. החשבון ממתין לאישור מנהל המערכת — תקבלו מייל נוסף עם קישור כניסה מיד לאחר האישור.";
  const extra = params.extraNote?.trim()
    ? `<p style="margin:12px 0 0;color:#94a3b8;font-size:13px;text-align:center;line-height:1.6;">${escapeHtml(params.extraNote)}</p>`
    : "";
  const subject = params.accountActive
    ? "ברוכים הבאים ל־BSD-YBM-OS — הרשמה הושלמה"
    : "BSD-YBM-OS — ההרשמה התקבלה, ממתינה לאישור";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#f8fafc;text-align:center;">ברוכים הבאים ל־BSD-YBM</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 12px;color:#e2e8f0;font-size:15px;text-align:center;line-height:1.75;">
      רמת מנוי: <strong style="color:#fde68a;">${escapeHtml(params.tierLabelHe)}</strong>
    </p>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
      ${escapeHtml(statusLine)}
    </p>
    ${extra}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${mailSiteUrl()}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        כניסה למערכת
      </a>
    </p>`;
  return sendTransactionalEmail(toEmail.trim().toLowerCase(), subject, inner);
}

export async function sendRegistrationCredentialsEmail(
  toEmail: string,
  name: string | null,
  plainPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const greeting = name?.trim() ? `שלום ${escapeHtml(name.trim())},` : "שלום,";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">פרטי הכניסה שלכם</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
      נוצרה עבורכם סיסמה זמנית להתחברות ראשונה. מומלץ לשנות אותה לאחר הכניסה בהגדרות.
    </p>
    <p style="margin:16px auto;max-width:320px;padding:14px 18px;background:#0f172a;border:1px solid #334155;border-radius:12px;font-family:monospace;font-size:15px;color:#f8fafc;text-align:center;letter-spacing:0.04em;">
      ${escapeHtml(plainPassword)}
    </p>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="${mailSiteUrl()}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        כניסה למערכת
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM — פרטי התחברות",
    inner,
  );
}

export async function sendPasswordResetEmail(
  toEmail: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${mailSiteUrl()}/login?reset=${encodeURIComponent(token)}`;
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">איפוס סיסמה</h1>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
      התקבלה בקשה לאיפוס סיסמה. הקישור תקף לשעה אחת.
    </p>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        בחירת סיסמה חדשה
      </a>
    </p>`;
  return sendTransactionalEmail(toEmail.trim().toLowerCase(), "איפוס סיסמה — BSD-YBM", inner);
}

export type AccountActiveEmailOptions = {
  /** הרשמה/יצירה ישירה עם חשבון פעיל, לעומת אישור מנהל לאחר המתנה */
  variant?: "admin_approved" | "registration_active";
  /** סיסמה זמנית (מוצגת במייל) */
  temporaryPassword?: string;
  /** רמת מנוי — בהרשמה ציבורית */
  tierLabelHe?: string;
  /** שם ארגון — ביצירה ידנית על ידי מנהל */
  organizationName?: string;
};

export async function sendAccessApprovedEmail(
  toEmail: string,
  name: string | null,
  options?: AccountActiveEmailOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = mailSiteUrl();
  const loginUrl = `${base}/login`;
  const greeting = name?.trim() ? `שלום ${escapeHtml(name.trim())},` : "שלום,";
  const variant = options?.variant ?? "admin_approved";
  const isRegistration = variant === "registration_active";

  const headline = isRegistration
    ? "ההרשמה הושלמה — החשבון פעיל"
    : "החשבון אושר — ברוכים הבאים";
  const intro = isRegistration
    ? "ההרשמה שלכם ל־BSD-YBM-OS הושלמה. החשבון פעיל וניתן להתחבר למערכת."
    : "מנהל המערכת אישר את ההרשמה שלכם. מעכשיו ניתן להתחבר ל־BSD-YBM-OS ולנהל את הארגון.";

  const tierBlock = options?.tierLabelHe?.trim()
    ? `<p style="margin:0 0 12px;color:#e2e8f0;font-size:15px;text-align:center;">רמת מנוי: <strong style="color:#fde68a;">${escapeHtml(options.tierLabelHe.trim())}</strong></p>`
    : "";

  const orgBlock = options?.organizationName?.trim()
    ? `<p style="margin:0 0 12px;color:#94a3b8;font-size:14px;text-align:center;">ארגון: <strong style="color:#e2e8f0;">${escapeHtml(options.organizationName.trim())}</strong></p>`
    : "";

  const tempPassword = options?.temporaryPassword?.trim();
  const passwordBlock = tempPassword
    ? `<p style="margin:16px 0 8px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
        סיסמה זמנית להתחברות ראשונה:
      </p>
      <p style="margin:0 auto 16px;max-width:320px;padding:14px 18px;background:#0f172a;border:1px solid #334155;border-radius:12px;font-family:monospace;font-size:15px;color:#f8fafc;text-align:center;letter-spacing:0.04em;">
        ${escapeHtml(tempPassword)}
      </p>`
    : "";

  const loginStep = tempPassword
    ? "התחברו עם האימייל שבו נרשמתם והסיסמה למעלה, או עם Google באותו אימייל."
    : "התחברו עם האימייל שבו נרשמתם והסיסמה שבחרתם, או עם Google באותו אימייל.";

  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">${headline}</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 16px;color:#e2e8f0;font-size:15px;text-align:center;line-height:1.75;">
      ${intro}
    </p>
    ${tierBlock}
    ${orgBlock}
    ${passwordBlock}
    <ol style="margin:0 auto 20px;max-width:400px;padding:0 1.25rem 0 0;color:#94a3b8;font-size:14px;line-height:1.7;text-align:right;">
      <li style="margin-bottom:8px;">לחצו על «כניסה למערכת» למטה (או פתחו: <a href="${escapeHtml(loginUrl)}" style="color:#60a5fa;">${escapeHtml(loginUrl)}</a>)</li>
      <li style="margin-bottom:8px;">${loginStep}</li>
      <li>לאחר הכניסה — עדכנו סיסמה בהגדרות אם קיבלתם סיסמה זמנית.</li>
    </ol>
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        כניסה למערכת
      </a>
    </p>`;

  const subject = isRegistration
    ? "BSD-YBM-OS — ההרשמה הושלמה, ניתן להתחבר"
    : "BSD-YBM-OS — החשבון אושר, ניתן להתחבר";

  const r = await sendTransactionalEmail(toEmail.trim().toLowerCase(), subject, inner);
  if (!r.ok) {
    log.warn("sendAccessApprovedEmail failed", { error: r.error });
  }
  return r;
}

export async function sendAccessApprovedAdminNotify(
  approvedUserEmail: string,
  approvedUserName: string | null,
): Promise<void> {
  const { enqueueDigestEmailToMany } = await import("@/lib/email-digest");
  const admins = osAdminEmails();
  const who = approvedUserName?.trim()
    ? `${approvedUserName.trim()} (${approvedUserEmail})`
    : approvedUserEmail;

  await enqueueDigestEmailToMany(
    admins,
    EMAIL_DIGEST_CATEGORY.ADMIN_ALERT,
    "אושרה הרשמה",
    `אושרה גישה למערכת עבור: ${who}`,
  );
}
