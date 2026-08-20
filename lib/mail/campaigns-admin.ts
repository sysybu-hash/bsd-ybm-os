import { osAdminEmails } from "@/lib/is-admin";
import { createLogger } from "@/lib/logger";
import { EMAIL_DIGEST_CATEGORY, type DigestLineItem } from "@/lib/email-digest-types";
import type { SiteFeedbackInput } from "@/lib/validation/schemas/site-feedback";
import { sendTransactionalEmail, escapeHtml, mailSiteUrl, TAGLINE } from "@/lib/mail-core";

const log = createLogger("mail-campaigns-admin");

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


