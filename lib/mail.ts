import { Resend } from "resend";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "@/lib/env";
import { osAdminEmails } from "@/lib/is-admin";
import { createLogger } from "@/lib/logger";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import {
  EMAIL_DIGEST_CATEGORY,
  type DigestLineItem,
} from "@/lib/email-digest-types";
import type { SiteFeedbackInput } from "@/lib/validation/schemas/site-feedback";
import {
  getMailFrom,
  getMailReplyTo,
  isMailTransportConfigured,
  isResendConfigured,
  isSmtpConfigured,
} from "@/lib/mail-config";

function mailSiteUrl(): string {
  return getCanonicalSiteUrl().replace(/\/$/, "");
}
const TAGLINE = "BSD-YBM-OS - השדרה שמחברת בין כולם";
const log = createLogger("mail");

function createSmtpTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const secure = env.SMTP_SECURE === true || port === 465;
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  return nodemailer.createTransport({
    host: env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapBrandedHtml(innerBody: string): string {
  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:#020617;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:28px 16px;">
    <tr>
      <td align="center">
        <div style="max-width:560px;margin:0 auto;background:#0f172a;border-radius:20px;padding:36px 28px;border:1px solid #1e293b;box-shadow:0 25px 50px -12px rgba(0,0,0,0.45);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f8fafc;line-height:1.65;">
          <div style="width:48px;height:48px;border-radius:14px;background:#2563eb;margin:0 auto 20px;"></div>
          ${innerBody}
          <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #334155;color:#64748b;font-size:11px;text-align:center;letter-spacing:0.02em;">
            ${TAGLINE}
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createResend(): Resend | null {
  if (!isResendConfigured()) return null;
  return new Resend(env.RESEND_API_KEY!.trim());
}

async function sendViaResend(to: string | string[], subject: string, html: string): Promise<boolean> {
  const resend = createResend();
  if (!resend) return false;
  const list = Array.isArray(to) ? to : [to];
  const replyTo = getMailReplyTo();
  const { error } = await resend.emails.send({
    from: getMailFrom(),
    to: list,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    log.error("Resend send failed", { error: error.message });
    return false;
  }
  return true;
}

async function sendViaSmtp(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  const transporter = createSmtpTransporter();

  const list = Array.isArray(to) ? to : [to];
  const replyTo = getMailReplyTo();
  await transporter.sendMail({
    from: getMailFrom(),
    to: list.join(", "),
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  return true;
}

export { isMailTransportConfigured, getMailFrom, getMailReplyTo } from "@/lib/mail-config";

/** שליחה פנימית — קודם Resend, אחרת SMTP */
export async function sendTransactionalEmail(
  to: string | string[],
  subject: string,
  htmlBodyInner: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isMailTransportConfigured()) {
    return {
      ok: false,
      error:
        "שירות המייל לא מוגדר. הוסיפו RESEND_API_KEY או SMTP_HOST + SMTP_USER + SMTP_PASS ב־Vercel / .env.local",
    };
  }

  const html = wrapBrandedHtml(htmlBodyInner);
  try {
    if (await sendViaResend(to, subject, html)) {
      return { ok: true };
    }
    if (await sendViaSmtp(to, subject, html)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "שליחת המייל נכשלה — בדקו את מפתח Resend או הגדרות SMTP ואימות הדומיין bsd-ybm.co.il",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("sendTransactionalEmail failed", { error: msg });
    return { ok: false, error: msg };
  }
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

/** שליחה עם קבצים מצורפים */
export async function sendTransactionalEmailWithAttachments(
  to: string | string[],
  subject: string,
  htmlBodyInner: string,
  attachments: EmailAttachment[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isMailTransportConfigured()) {
    return {
      ok: false,
      error: "שירות המייל לא מוגדר (RESEND_API_KEY או SMTP)",
    };
  }

  const html = wrapBrandedHtml(htmlBodyInner);
  const list = Array.isArray(to) ? to : [to];
  const mapped = attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType ?? "application/octet-stream",
  }));
  const replyTo = getMailReplyTo();

  try {
    const resend = createResend();
    if (resend) {
      const { error } = await resend.emails.send({
        from: getMailFrom(),
        to: list,
        subject,
        html,
        attachments: mapped.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) {
        log.error("Resend attachments failed", { error: error.message });
        return { ok: false, error: error.message ?? "שליחת מייל נכשלה (Resend)" };
      }
      return { ok: true };
    }

    if (isSmtpConfigured()) {
      const transporter = createSmtpTransporter();
      await transporter.sendMail({
        from: getMailFrom(),
        to: list.join(", "),
        subject,
        html,
        attachments: mapped,
        ...(replyTo ? { replyTo } : {}),
      });
      return { ok: true };
    }

    return { ok: false, error: "חסר RESEND_API_KEY או SMTP להודעה עם קובץ מצורף" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("sendTransactionalEmailWithAttachments failed", { error: msg });
    return { ok: false, error: msg };
  }
}

/** מייל בדיקה — לוודא שהמערכת שולחת בפועל */
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

export async function sendPayPalSubscriptionConfirmationEmail(
  toEmail: string,
  params: { planLabel: string; amountIls: string; orgName: string },
): Promise<void> {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">תשלום התקבל</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:16px;text-align:center;">
      המנוי עבור <strong>${escapeHtml(params.orgName)}</strong> הופעל.
    </p>
    <p style="margin:0;color:#34d399;font-size:20px;font-weight:800;text-align:center;">₪${escapeHtml(params.amountIls)}</p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM-OS — אישור תשלום מנוי",
    inner,
  );
  if (!r.ok) {
    log.warn("sendPayPalSubscriptionConfirmationEmail failed", { error: r.error });
  }
}

export async function sendSubscriptionJoinInviteEmail(
  toEmail: string,
  params: { headline: string; bodyText: string; ctaLabel?: string; ctaPath?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctaLabel = params.ctaLabel?.trim() || "כניסה ל-BSD-YBM";
  const path = params.ctaPath?.trim().startsWith("/") ? params.ctaPath.trim() : "/login";
  const ctaHref = `${mailSiteUrl()}${path}`;
  const bodySafe = escapeHtml(params.bodyText).replace(/\n/g, "<br/>");
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">${escapeHtml(params.headline)}</h1>
    <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.75;text-align:center;">
      ${bodySafe}
    </p>
    <p style="text-align:center;margin:0;">
      <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        ${escapeHtml(ctaLabel)}
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM-OS — הזמנה להצטרפות",
    inner,
  );
}

export async function sendOrganizationTeamInviteEmail(
  toEmail: string,
  params: {
    orgName: string;
    registerUrl: string;
    roleLabel: string;
    expiresNote?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = params.expiresNote?.trim()
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">${escapeHtml(params.expiresNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">הוזמנתם לצוות</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;">
      ארגון: <strong>${escapeHtml(params.orgName)}</strong> · תפקיד: <strong>${escapeHtml(params.roleLabel)}</strong>
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        השלמת הרשמה
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנה לצוות (${params.orgName})`,
    inner,
  );
}

export async function sendSubscriptionTierInvitationEmail(
  toEmail: string,
  params: { tierLabel: string; registerUrl: string; expiresNote?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = params.expiresNote?.trim()
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">${escapeHtml(params.expiresNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">הוזמנתם ל-BSD-YBM</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;">
      רמת מנוי: <strong>${escapeHtml(params.tierLabel)}</strong>
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;">
        השלמת הרשמה
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנת מנוי (${params.tierLabel})`,
    inner,
  );
}

/** התראה חשובה מהמערכת (גשר מ־InAppNotification) */
export async function sendNotificationEmail(
  toEmail: string,
  title: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const safeTitle = escapeHtml(title.trim());
  const safeBody = escapeHtml(body.trim()).replace(/\n/g, "<br/>");
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">${safeTitle}</h1>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.65;">
      ${safeBody}
    </p>
    <p style="text-align:center;margin:0;">
      <a href="${escapeHtml(mailSiteUrl())}/app" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;">
        פתיחה במערכת
      </a>
    </p>`;
  return sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM — ${title.trim().slice(0, 80)}`,
    inner,
  );
}

/** מנהלי פלטפורמה: הרשמה חדשה ממתינה לאישור (מיידי; איגוד רק ב־enqueueAdminPendingRegistrationsDigest) */
export async function sendNewRegistrationPendingAdminEmail(params: {
  userEmail: string;
  userName: string | null;
  organizationName: string;
}): Promise<void> {
  const admins = osAdminEmails();
  const who = params.userName?.trim()
    ? `${escapeHtml(params.userName.trim())} (${escapeHtml(params.userEmail)})`
    : escapeHtml(params.userEmail);
  const inner = `
    <h1 style="margin:0 0 12px;font-size:18px;font-weight:800;color:#f8fafc;text-align:center;">הרשמה חדשה ממתינה לאישור</h1>
    <p style="margin:0 0 8px;color:#cbd5e1;font-size:14px;text-align:center;">
      משתמש: <strong style="color:#fff;">${who}</strong>
    </p>
    <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
      ארגון: <strong style="color:#e2e8f0;">${escapeHtml(params.organizationName)}</strong><br/>
      סטטוס: <strong style="color:#fde68a;">ממתין לאישור מנהל</strong>
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-align:center;">
      לאחר האישור — המשתמש יקבל מייל עם קישור כניסה למערכת.
    </p>
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(mailSiteUrl())}/admin" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;">
        אישור במסוף הניהול
      </a>
    </p>`;
  const r = await sendTransactionalEmail(admins, "BSD-YBM-OS — הרשמה ממתינה לאישור", inner);
  if (!r.ok) {
    log.warn("sendNewRegistrationPendingAdminEmail failed", { error: r.error });
  }
}

/** איגוד מספר הרשמות ממתינות למייל סיכום אחד (קריאה ידנית או ממקור עתידי) */
export async function enqueueAdminPendingRegistrationsDigest(params: {
  userEmail: string;
  userName: string | null;
  organizationName: string;
}): Promise<void> {
  const { enqueueDigestEmailToMany } = await import("@/lib/email-digest");
  const admins = osAdminEmails();
  const who = params.userName?.trim()
    ? `${params.userName.trim()} (${params.userEmail})`
    : params.userEmail;
  await enqueueDigestEmailToMany(
    admins,
    EMAIL_DIGEST_CATEGORY.ADMIN_PENDING_REGISTRATION,
    "הרשמה ממתינה לאישור",
    `משתמש: ${who} · ארגון: ${params.organizationName}`,
  );
}

/** מייל סיכום — מספר התראות/עדכונים במייל אחד */
export async function sendDigestSummaryEmail(
  toEmail: string,
  params: {
    subject: string;
    items: DigestLineItem[];
    category: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = params.items.length;
  const adminCta =
    params.category === EMAIL_DIGEST_CATEGORY.ADMIN_PENDING_REGISTRATION
      ? `${mailSiteUrl()}/admin`
      : `${mailSiteUrl()}/app`;

  const listHtml = params.items
    .map((item) => {
      const title = escapeHtml(item.title.trim());
      const body = escapeHtml(item.body.trim());
      const bodyBlock =
        body && body !== title
          ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:13px;line-height:1.55;">${body}</p>`
          : "";
      return `<li style="margin-bottom:14px;color:#e2e8f0;font-size:14px;line-height:1.5;">
        <strong style="color:#f8fafc;">${title}</strong>${bodyBlock}
      </li>`;
    })
    .join("");

  const headline =
    count === 1
      ? "עדכון מהמערכת"
      : `סיכום ${count} עדכונים`;

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;text-align:center;line-height:1.6;">
      כדי לא להציף את תיבת הדואר, עדכונים רבים נשלחים במייל סיכום אחד.
    </p>
    <ul style="margin:0;padding:0 1.25rem 0 0;list-style:decimal;text-align:right;">
      ${listHtml}
    </ul>
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(adminCta)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;">
        פתיחה במערכת
      </a>
    </p>`;

  return sendTransactionalEmail(toEmail.trim().toLowerCase(), params.subject, inner);
}

/** פרטי כניסה למשתמש שנוצר ידנית על ידי סופר-אדמין */
export async function sendProvisionCredentialsEmail(
  to: string,
  displayName: string | null,
  plainPassword: string,
  orgName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loginUrl = `${mailSiteUrl()}/login`;
  const greeting = displayName?.trim() ? `שלום ${escapeHtml(displayName.trim())},` : "שלום,";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">פרטי כניסה ל־BSD-YBM</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;text-align:center;">
      נפתח לך חשבון בארגון <strong style="color:#e2e8f0;">${escapeHtml(orgName)}</strong>
    </p>
    <table role="presentation" style="margin:20px auto 0;border-collapse:collapse;font-size:14px;color:#e2e8f0;">
      <tr><td style="padding:6px 12px;color:#94a3b8;">אימייל</td><td style="padding:6px 12px;font-weight:700;">${escapeHtml(to.trim().toLowerCase())}</td></tr>
      <tr><td style="padding:6px 12px;color:#94a3b8;">סיסמה זמנית</td><td style="padding:6px 12px;font-family:ui-monospace,monospace;font-weight:700;letter-spacing:0.05em;">${escapeHtml(plainPassword)}</td></tr>
    </table>
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;text-align:center;">מומלץ לשנות סיסמה לאחר הכניסה הראשונה.</p>
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        כניסה למערכת
      </a>
    </p>`;
  return sendTransactionalEmail(
    to.trim().toLowerCase(),
    "פרטי כניסה ל־BSD-YBM",
    inner,
  );
}

/** משוב מהאתר / מהמערכת — נשלח לכל מנהלי הפלטפורמה */
export async function sendSiteFeedbackEmail(
  input: SiteFeedbackInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admins = osAdminEmails();
  if (admins.length === 0) {
    return { ok: false, error: "no_admin_recipients" };
  }

  const phoneBlock = input.phone
    ? `<p style="margin:0 0 8px;color:#cbd5e1;font-size:14px;"><strong>טלפון:</strong> ${escapeHtml(input.phone)}</p>`
    : "";
  const pageBlock = input.pageUrl
    ? `<p style="margin:0 0 8px;color:#94a3b8;font-size:13px;word-break:break-all;"><strong>עמוד:</strong> ${escapeHtml(input.pageUrl)}</p>`
    : "";
  const ctxLabel =
    input.context === "marketing"
      ? "דף שיווקי"
      : input.context === "app"
        ? "מערכת"
        : "כללי";

  const inner = `
    <h1 style="margin:0 0 12px;font-size:18px;font-weight:800;color:#f8fafc;text-align:center;">משוב חדש — BSD-YBM</h1>
    <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;text-align:center;">מקור: ${escapeHtml(ctxLabel)}</p>
    <p style="margin:0 0 8px;color:#cbd5e1;font-size:14px;"><strong>שם:</strong> ${escapeHtml(input.name)}</p>
    <p style="margin:0 0 8px;color:#cbd5e1;font-size:14px;"><strong>אימייל:</strong> ${escapeHtml(input.email)}</p>
    ${phoneBlock}
    ${pageBlock}
    <div style="margin:16px 0 0;padding:14px 16px;background:#1e293b;border-radius:10px;border:1px solid #334155;">
      <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
    </div>
    <p style="margin:20px 0 0;color:#64748b;font-size:12px;text-align:center;">${escapeHtml(TAGLINE)}</p>`;

  const subject = `משוב מהאתר — ${input.name.trim().slice(0, 40)}`;
  const r = await sendTransactionalEmail(admins, subject, inner);
  if (!r.ok) {
    log.warn("sendSiteFeedbackEmail failed", { error: r.error });
  }
  return r;
}
