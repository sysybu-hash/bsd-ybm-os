/** הגדרות מייל מרכזיות — שולח ברירת מחדל: yb@bsd-ybm.co.il */

export const DEFAULT_MAIL_FROM = "BSD-YBM <yb@bsd-ybm.co.il>";
export const DEFAULT_REPLY_TO = "yb@bsd-ybm.co.il";

/** מפרמט כתובת שולח — תומך ב-yb@... בלבד (בלי <>) לתאימות ל-Vercel/Windows */
export function formatMailFrom(raw: string): string {
  const v = raw.trim();
  if (!v) return DEFAULT_MAIL_FROM;
  if (v.includes("<") && v.includes(">")) return v;
  if (v.includes("@") && !v.includes(" ")) return `BSD-YBM <${v}>`;
  return v;
}

export function getMailFrom(): string {
  const raw =
    process.env.MAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "yb@bsd-ybm.co.il";
  return formatMailFrom(raw);
}

export function getMailReplyTo(): string | undefined {
  const v =
    process.env.MAIL_REPLY_TO?.trim() ||
    process.env.SMTP_USER?.trim() ||
    DEFAULT_REPLY_TO;
  return v.includes("@") ? v : undefined;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function isMailTransportConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

export function mailTransportLabel(): string {
  if (isResendConfigured()) return "Resend";
  if (isSmtpConfigured()) return "SMTP";
  return "לא מוגדר";
}
