import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { renderHebrewInvoicePdf } from "@/lib/pdf/hebrew-pdf";

export type { InvoiceExportPayload, InvoiceLineItem } from "@/lib/invoice-export-types";

export async function buildInvoicePdfBuffer(payload: InvoiceExportPayload): Promise<Uint8Array> {
  return renderHebrewInvoicePdf(payload);
}

export function buildInvoiceDocxHtml(payload: InvoiceExportPayload): string {
  const rows = payload.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.desc)}</td><td>${i.qty}</td><td>${i.price}</td><td>${(i.qty * i.price).toFixed(2)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head><body>
<h1>${escapeHtml(payload.type)} #${payload.number}</h1>
<p>לקוח: ${escapeHtml(payload.clientName)} | תאריך: ${escapeHtml(payload.date)}</p>
<table border="1" cellpadding="4"><thead><tr><th>תיאור</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>סה״כ: ₪${payload.total.toFixed(2)}</strong></p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
