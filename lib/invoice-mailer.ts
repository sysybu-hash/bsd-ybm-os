import { sendTransactionalEmail } from "@/lib/mail";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InvoiceReceiptEmailPayload = {
  invoiceNumber: string;
  issueDate: Date;
  amount: number;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://bsd-ybm.co.il";

/**
 * מייל אישור תשלום / קבלה (Resend או SMTP דרך sendTransactionalEmail).
 */
export async function sendInvoiceEmail(
  toEmail: string,
  orgName: string,
  invoiceDetails: InvoiceReceiptEmailPayload,
): Promise<boolean> {
  const safeOrg = escapeHtml(orgName);
  const safeNum = escapeHtml(invoiceDetails.invoiceNumber);
  const dateStr = escapeHtml(invoiceDetails.issueDate.toLocaleDateString("he-IL"));
  const amountStr = invoiceDetails.amount.toFixed(2);

  const inner = `
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;">שלום צוות ${safeOrg},</h2>
    <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.7;">
      תודה על התשלום! המנוי הופעל / הרכישה נרשמה במערכת.
    </p>
    <div style="background:#1e293b;border-radius:14px;padding:18px 20px;margin:0 0 20px;border:1px solid #334155;">
      <h3 style="margin:0 0 12px;color:#f8fafc;font-size:16px;">פרטי קבלה</h3>
      <ul style="margin:0;padding:0 18px 0 0;color:#cbd5e1;font-size:14px;line-height:1.8;">
        <li><strong style="color:#e2e8f0;">מספר מסמך:</strong> ${safeNum}</li>
        <li><strong style="color:#e2e8f0;">תאריך:</strong> ${dateStr}</li>
        <li><strong style="color:#e2e8f0;">סכום ששולם:</strong> ₪${amountStr}</li>
        <li><strong style="color:#e2e8f0;">סטטוס:</strong> שולם (PayPal)</li>
      </ul>
    </div>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;line-height:1.65;">
      מסמך זה מהווה אישור תשלום אלקטרוני. ניתן לצפות בהיסטוריה דרך אזור ההגדרות והחיובים.
    </p>
    <p style="text-align:center;margin:0;">
      <a href="${escapeHtml(SITE_URL.replace(/\/$/, ""))}/app" style="display:inline-block;background:#6366f1;color:#fff;font-weight:800;padding:12px 24px;text-decoration:none;border-radius:8px;">
        מעבר למערכת
      </a>
    </p>`;

  const r = await sendTransactionalEmail(
    toEmail.trim().toLowerCase(),
    `אישור תשלום #${invoiceDetails.invoiceNumber} — BSD-YBM`,
    inner,
  );
  return r.ok;
}
