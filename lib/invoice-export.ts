import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";
import { renderHebrewInvoicePdf } from "@/lib/pdf/hebrew-pdf";
import { renderInvoicePdfWithPdfKit } from "@/lib/pdf/invoice-pdfkit";

export type { InvoiceExportPayload, InvoiceLineItem } from "@/lib/invoice-export-types";

export async function buildInvoicePdfBuffer(payload: InvoiceExportPayload): Promise<Uint8Array> {
  try {
    return await renderInvoicePdfWithPdfKit(payload);
  } catch (pdfKitErr) {
    console.warn("[invoice-export] pdfkit failed, trying react-pdf:", pdfKitErr);
    return renderHebrewInvoicePdf(payload);
  }
}

function money(n: number) {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildInvoiceDocxHtml(payload: InvoiceExportPayload): string {
  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);
  const rows = payload.items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(i.desc)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center">${i.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center">${money(i.price)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:left">${money(i.qty * i.price)}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;color:#0f172a;margin:24px}
  .band{background:#4f46e5;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:20px}
  .band h1{margin:0;font-size:22px}
  .band p{margin:4px 0 0;font-size:11px;color:#c7d2fe}
  .cols{display:flex;gap:12px;margin-bottom:16px}
  .box{flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px}
  .lbl{font-size:10px;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f1f5f9;font-size:10px;color:#64748b;padding:8px}
  .totals{margin-top:16px;max-width:280px;border:1px solid #e2e8f0;border-radius:6px;padding:12px}
  .totals div{display:flex;justify-content:space-between;margin:4px 0;font-size:12px}
  .grand{font-size:15px;font-weight:bold;color:#4f46e5;margin-top:8px}
  .alloc{margin-top:12px;font-size:11px;color:#4f46e5;font-weight:bold}
</style></head><body>
<div class="band"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(payload.orgName ?? "BSD-YBM")} · מס׳ ${payload.number}</p></div>
<div class="cols">
  <div class="box"><div class="lbl">מאת</div><strong>${escapeHtml(payload.orgName ?? "—")}</strong>
  ${payload.orgTaxId ? `<div style="font-size:11px">ח.פ: ${escapeHtml(payload.orgTaxId)}</div>` : ""}
  </div>
  <div class="box"><div class="lbl">לכבוד</div><strong>${escapeHtml(payload.clientName)}</strong>
  <div style="font-size:11px;margin-top:6px">תאריך: ${escapeHtml(payload.date)}</div>
  ${payload.dueDate ? `<div style="font-size:11px">לתשלום עד: ${escapeHtml(payload.dueDate)}</div>` : ""}
  </div>
</div>
<table><thead><tr>
  <th style="text-align:right">תיאור</th><th>כמות</th><th>מחיר</th><th style="text-align:left">סה״כ</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>לפני מע״מ</span><span>${money(payload.amount)}</span></div>
  <div><span>מע״מ (${vatPct}%)</span><span>${money(payload.vat)}</span></div>
  <div class="grand"><span>סה״כ לתשלום</span><span>${money(payload.total)}</span></div>
</div>
${payload.itaAllocationNumber ? `<p class="alloc">מספר הקצאה: ${escapeHtml(payload.itaAllocationNumber)}</p>` : ""}
<p style="margin-top:24px;font-size:9px;color:#94a3b8;text-align:center">הופק ב-BSD-YBM-OS</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
