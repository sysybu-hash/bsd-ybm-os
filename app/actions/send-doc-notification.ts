"use server";

import { Resend } from "resend";

function createResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendDocNotification(
  userEmail: string,
  vendor: string,
  total: number,
) {
  const resend = createResend();
  if (!resend) {
    console.error("RESEND_API_KEY is not set");
    return;
  }

  try {
    await resend.emails.send({
      from: "BSD-YBM <system@bsd-ybm.co.il>",
      to: userEmail,
      subject: `✅ מסמך חדש נסרק בהצלחה: ${vendor}`,
      html: `
        <div dir="rtl" style="font-family: sans-serif;">
          <h2>היי, המסמך מוכן!</h2>
          <p>ה-AI של BSD-YBM פענח חשבונית חדשה:</p>
          <ul>
            <li><strong>ספק:</strong> ${vendor}</li>
            <li><strong>סכום:</strong> ₪${total}</li>
          </ul>
          <a href="https://www.bsd-ybm.co.il/app/documents/erp" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px;">לצפייה ב-ERP</a>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send email", error);
  }
}

