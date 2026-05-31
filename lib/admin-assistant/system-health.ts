import { hasOSPayPalConfigured } from "@/lib/platform-paypal";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  getMailFrom,
  isMailTransportConfigured,
  isResendConfigured,
  isSmtpConfigured,
  mailTransportLabel,
} from "@/lib/mail-config";

export type AdminServiceStatus = {
  name: string;
  ok: boolean;
  detail: string;
};

export async function getAdminSystemHealth(): Promise<{
  checkedAt: string;
  statuses: AdminServiceStatus[];
}> {
  const statuses: AdminServiceStatus[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    statuses.push({ name: "Database", ok: true, detail: "מחובר" });
  } catch {
    statuses.push({ name: "Database", ok: false, detail: "שגיאת חיבור" });
  }

  statuses.push({
    name: "AI Engine",
    ok: Boolean(
      env.GOOGLE_GENERATIVE_AI_API_KEY ||
        env.GEMINI_API_KEY ||
        env.OPENAI_API_KEY ||
        env.ANTHROPIC_API_KEY,
    ),
    detail: "בדיקת מפתחות API",
  });

  const payplusOk = Boolean(
    env.PAYPLUS_API_KEY?.trim() &&
      env.PAYPLUS_SECRET_KEY?.trim() &&
      env.PAYPLUS_PAYMENT_PAGE_UID?.trim(),
  );
  const platformPaypal = hasOSPayPalConfigured();
  const mailOk = isMailTransportConfigured();
  statuses.push({
    name: "דואר (מייל)",
    ok: mailOk,
    detail: mailOk
      ? `${mailTransportLabel()} · שולח: ${getMailFrom()}${isResendConfigured() ? "" : isSmtpConfigured() ? " (SMTP)" : ""}`
      : "חסר RESEND_API_KEY או SMTP_HOST — מיילים לא יישלחו",
  });

  statuses.push({
    name: "תשלומים",
    ok: true,
    detail: [
      "ארגונים: PayPal לפי הגדרות DB",
      platformPaypal ? "BSD-YBM-OS: PayPal ENV מוגדר" : "BSD-YBM-OS: PayPal ENV לא מוגדר",
      payplusOk ? "PayPlus API זמין" : "ללא PayPlus API",
    ].join(" · "),
  });

  return { checkedAt: new Date().toISOString(), statuses };
}
