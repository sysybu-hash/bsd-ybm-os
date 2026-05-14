import { Resend } from "resend";
import nodemailer from "nodemailer";
import { osOwnerEmail } from "@/lib/is-admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://bsd-ybm.co.il";
const TAGLINE = "BSD-YBM-OS - השדרה שמחברת בין כולם";

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
        <div style="max-width:560px;margin:0 auto;background:#0f172a;border-radius:20px;padding:36px 28px;border:1px solid #1e293b;
          box-shadow:0 25px 50px -12px rgba(0,0,0,0.45);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f8fafc;line-height:1.65;">
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

function defaultFrom(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "BSD-YBM <system@bsd-ybm.co.il>"
  );
}

function createResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

async function sendViaResend(to: string | string[], subject: string, html: string): Promise<boolean> {
  const resend = createResend();
  if (!resend) return false;
  const list = Array.isArray(to) ? to : [to];
  await resend.emails.send({
    from: defaultFrom(),
    to: list,
    subject,
    html,
  });
  return true;
}

async function sendViaSmtp(to: string | string[], subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return false;
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  const list = Array.isArray(to) ? to : [to];
  await transporter.sendMail({
    from: defaultFrom(),
    to: list.join(", "),
    subject,
    html,
  });
  return true;
}

/** שליחה פנימית — קודם Resend, אחרת SMTP (Nodemailer) */
export async function sendTransactionalEmail(
  to: string | string[],
  subject: string,
  htmlBodyInner: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
      error: "חסר RESEND_API_KEY או הגדרות SMTP (SMTP_HOST וכו׳)",
    };
  } catch (e) {
    console.error("sendTransactionalEmail", e);
    return { ok: false, error: "שליחת אימייל נכשלה" };
  }
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
      <a href="${SITE_URL}/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        מעבר לדף הכניסה
      </a>
    </p>`;
  const r = await sendTransactionalEmail(toEmail.trim().toLowerCase(), "ברוכים הבאים ל־BSD-YBM", inner);
  if (!r.ok) {
    console.warn("sendWelcomeEmail:", r.error);
  }
}

/** מייל ברוכים הבאים אחרי הרשמה — כולל רמת מנוי נוכחית (מותג BSD-YBM) */
export async function sendRegistrationWelcomeEmail(
  toEmail: string,
  name: string | null,
  params: {
    tierLabelHe: string;
    tierKey: string;
    accountActive: boolean;
    extraNote?: string;
  },
): Promise<void> {
  const greeting = name?.trim() ? `שלום ${name.trim()},` : "שלום,";
  const statusLine = params.accountActive
    ? "החשבון שלך פעיל — ניתן להתחבר עם Google באותו אימייל."
    : "החשבון ממתין לאישור מנהל המערכת; לאחר האישור תוכלו להתחבר.";
  const extra = params.extraNote?.trim()
    ? `<p style="margin:12px 0 0;color:#94a3b8;font-size:13px;text-align:center;line-height:1.6;">${escapeHtml(params.extraNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;background:linear-gradient(135deg,#fde68a,#e2e8f0);-webkit-background-clip:text;background-clip:text;color:transparent;text-align:center;">
      Welcome to BSD-YBM
    </h1>
    <p style="margin:0 0 8px;color:#f8fafc;font-size:16px;text-align:center;font-weight:700;">ברוכים הבאים ל־BSD-YBM</p>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;text-align:center;">${greeting}</p>
    <p style="margin:0 0 12px;color:#e2e8f0;font-size:15px;text-align:center;line-height:1.75;">
      אתם כעת על רמת המנוי: <strong style="color:#fde68a;">${escapeHtml(params.tierLabelHe)}</strong>
      <span style="color:#94a3b8;"> (${escapeHtml(params.tierKey)})</span>.
    </p>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.6;">
      ${escapeHtml(statusLine)}
    </p>
    ${extra}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${SITE_URL}/login" style="display:inline-block;background:linear-gradient(135deg,#b45309,#ca8a04);color:#0f172a;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;box-shadow:0 8px 24px rgba(180,83,9,0.35);">
        כניסה למערכת
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "ברוכים הבאים ל־BSD-YBM-OS — הרשמה הושלמה",
    inner,
  );
  if (!r.ok) {
    console.warn("sendRegistrationWelcomeEmail:", r.error);
  }
}

/** מייל למשתמש שאושרה לו הגישה (תוכן לפי מפרט מוצר) */
export async function sendAccessApprovedEmail(toEmail: string): Promise<void> {
  const inner = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">הגישה הופעלה</h1>
    <p style="margin:0;color:#e2e8f0;font-size:15px;text-align:center;line-height:1.7;">
      שלום, הגישה שלך למערכת הניהול BSD-YBM הופעלה בהצלחה. כעת ניתן לגשת ל-ERP, ל-Billing ולניהול הארגוני בכתובת
      <a href="https://bsd-ybm.co.il" style="color:#60a5fa;font-weight:700;">https://bsd-ybm.co.il</a>.
    </p>
    <p style="text-align:center;margin:28px 0 0;">
      <a href="https://bsd-ybm.co.il/login" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        כניסה למערכת
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "הגישה ל־BSD-YBM-OS הופעלה",
    inner,
  );
  if (!r.ok) {
    console.warn("sendAccessApprovedEmail:", r.error);
  }
}

/** התראה לבעל ה-OS כשאושרה גישה למשתמש חדש */
export async function sendAccessApprovedAdminNotify(
  approvedUserEmail: string,
  approvedUserName: string | null,
): Promise<void> {
  const admins = [osOwnerEmail()];

  const who = approvedUserName?.trim()
    ? `${approvedUserName.trim()} (${approvedUserEmail})`
    : approvedUserEmail;

  const inner = `
    <h1 style="margin:0 0 12px;font-size:18px;font-weight:800;color:#f8fafc;text-align:center;">עדכון אישור גישה</h1>
    <p style="margin:0;color:#cbd5e1;font-size:14px;text-align:center;">
      אושרה גישה למערכת עבור: <strong style="color:#fff;">${who}</strong>
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      זוהי הודעה אוטומטית ממערכת BSD-YBM.
    </p>`;

  const r = await sendTransactionalEmail(
    admins,
    "ברוכים הבאים ל-BSD-YBM-OS: הגישה למערכת אושרה",
    inner,
  );
  if (!r.ok) {
    console.warn("sendAccessApprovedAdminNotify:", r.error);
  }
}

/** אישור תשלום מנוי אחרי PayPal (מעוצב עם מיתוג BSD-YBM) */
export async function sendPayPalSubscriptionConfirmationEmail(
  toEmail: string,
  params: { planLabel: string; amountIls: string; orgName: string },
): Promise<void> {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">תשלום התקבל — תודה!</h1>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:16px;text-align:center;line-height:1.7;">
      המנוי עבור <strong style="color:#fff;">${escapeHtml(params.orgName)}</strong> הופעל בהצלחה.
    </p>
    <div style="background:#1e293b;border-radius:14px;padding:18px 20px;margin:0 0 20px;border:1px solid #334155;">
      <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">תוכנית</p>
      <p style="margin:0 0 16px;color:#f8fafc;font-size:18px;font-weight:800;">${escapeHtml(params.planLabel)}</p>
      <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">סכום ששולם</p>
      <p style="margin:0;color:#34d399;font-size:20px;font-weight:800;">₪${escapeHtml(params.amountIls)}</p>
    </div>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;text-align:center;line-height:1.65;">
      ברוך הבא לשדרה שמחברת בין כולם — BSD-YBM.
    </p>
    <p style="text-align:center;margin:0;">
      <a href="${SITE_URL}/app" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:14px 28px;border-radius:12px;text-decoration:none;">
        כניסה ללוח הבקרה
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — אישור תשלום מנוי`,
    inner,
  );
  if (!r.ok) {
    console.warn("sendPayPalSubscriptionConfirmationEmail:", r.error);
  }
}

/** הזמנת הצטרפות / שדרוג — מייל מעוצב (טקסט גוף בלבד, ללא HTML חיצוני) */
export async function sendSubscriptionJoinInviteEmail(
  toEmail: string,
  params: { headline: string; bodyText: string; ctaLabel?: string; ctaPath?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctaLabel = params.ctaLabel?.trim() || "כניסה ל-BSD-YBM";
  const path = params.ctaPath?.trim().startsWith("/") ? params.ctaPath.trim() : "/login";
  const ctaHref = `${SITE_URL.replace(/\/$/, "")}${path}`;
  const bodySafe = escapeHtml(params.bodyText).replace(/\n/g, "<br/>");
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">${escapeHtml(params.headline)}</h1>
    <div style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.75;text-align:center;">
      ${bodySafe}
    </div>
    <p style="text-align:center;margin:0;">
      <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#2563eb);color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;box-shadow:0 12px 24px rgba(37,99,235,0.35);">
        ${escapeHtml(ctaLabel)}
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    "BSD-YBM-OS — הזמנה להצטרפות למערכת",
    inner,
  );
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  return { ok: true };
}

/** הזמנה להצטרף לארגון קיים (תפקיד שנבחר — לא יצירת ארגון חדש) */
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
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;line-height:1.75;">
      הוזמנתם להצטרף לארגון <strong style="color:#fff;">${escapeHtml(params.orgName)}</strong>
      בתפקיד: <strong style="color:#fff;">${escapeHtml(params.roleLabel)}</strong>.
      <br/>לא נפתח ארגון נפרד — ההרשמה מקשרת אתכם לארגון המזמין בלבד.
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:linear-gradient(135deg,#0d9488,#2563eb);color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;box-shadow:0 12px 24px rgba(37,99,235,0.35);">
        השלמת הרשמה לצוות
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנה לצוות (${params.orgName})`,
    inner,
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

/** הזמנת רמת מנוי עם קישור הרשמה וטוקן (Executive SuperAdmin) */
export async function sendSubscriptionTierInvitationEmail(
  toEmail: string,
  params: { tierLabel: string; registerUrl: string; expiresNote?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = params.expiresNote?.trim()
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">${escapeHtml(params.expiresNote)}</p>`
    : "";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f8fafc;text-align:center;">הוזמנתם ל-BSD-YBM</h1>
    <p style="margin:0 0 12px;color:#cbd5e1;font-size:15px;text-align:center;line-height:1.75;">
      הוקצתה לכם רמת מנוי: <strong style="color:#fff;">${escapeHtml(params.tierLabel)}</strong>.
      השלימו הרשמה בקישור הבא (האימייל חייב להתאים להזמנה).
    </p>
    ${note}
    <p style="text-align:center;margin:28px 0 0;">
      <a href="${escapeHtml(params.registerUrl)}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#2563eb);color:#fff;font-weight:800;padding:14px 28px;border-radius:14px;text-decoration:none;box-shadow:0 12px 24px rgba(37,99,235,0.35);">
        השלמת הרשמה
      </a>
    </p>`;
  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `BSD-YBM-OS — הזמנת מנוי (${params.tierLabel})`,
    inner,
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

