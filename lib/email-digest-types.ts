/** קטגוריות לאיגוד מיילים — קובץ נפרד כדי למנוע ייבוא מעגלי עם mail.ts */
export const EMAIL_DIGEST_CATEGORY = {
  NOTIFICATION: "notification",
  ADMIN_PENDING_REGISTRATION: "admin_pending_registration",
  ADMIN_ALERT: "admin_alert",
} as const;

export type EmailDigestCategory =
  (typeof EMAIL_DIGEST_CATEGORY)[keyof typeof EMAIL_DIGEST_CATEGORY];

export type DigestLineItem = {
  title: string;
  body: string;
  createdAt: Date;
};
