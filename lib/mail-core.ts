import { Resend } from "resend";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import {
  getMailFrom,
  getMailReplyTo,
  isMailTransportConfigured,
  isResendConfigured,
  isSmtpConfigured,
} from "@/lib/mail-config";

export const TAGLINE = "BSD-YBM-OS - השדרה שמחברת בין כולם";
const log = createLogger("mail-core");

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

export function mailSiteUrl(): string {
  return getCanonicalSiteUrl().replace(/\/$/, "");
}

export { escapeHtml, wrapBrandedHtml };
