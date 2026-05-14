"use server";

import { Resend } from "resend";

function createResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendProvisionCredentialsEmail(
  to: string,
  displayName: string | null,
  plainPassword: string,
  orgName: string,
) {
  const resend = createResend();
  if (!resend) {
    console.error("RESEND_API_KEY חסר — לא נשלח אימייל סיסמה");
    return { ok: false as const, error: "חסר RESEND_API_KEY" };
  }
  try {
    await resend.emails.send({
      from: "BSD-YBM <system@bsd-ybm.co.il>",
      to,
      subject: "פרטי כניסה ל־BSD-YBM",
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.6;">
          <h2>שלום${displayName ? ` ${displayName}` : ""},</h2>
          <p>נפתח לך חשבון בארגון <strong>${orgName}</strong>.</p>
          <p><strong>אימייל:</strong> ${to}</p>
          <p><strong>סיסמה זמנית:</strong> <code style="font-size:1.1em">${plainPassword}</code></p>
          <p>מומלץ להתחבר ולשנות סיסמה בהקדם (דרך הגדרות, כאשר יהיה זמין).</p>
          <p><a href="${process.env.NEXTAUTH_URL || ""}/login">כניסה למערכת</a></p>
        </div>
      `,
    });
    return { ok: true as const };
  } catch (e) {
    console.error(e);
    return { ok: false as const, error: "שליחת אימייל נכשלה" };
  }
}
