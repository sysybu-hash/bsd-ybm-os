import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import {
  escapeHtml,
  LBL_BEFORE_VAT,
  LBL_DOC_NUM,
  LBL_TOTAL,
  LBL_VAT,
  moneyHtml,
} from "@/lib/pdf/invoice-labels";

export type InvoiceHtmlVariant = "pdf" | "word";

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype");
}
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype");
}`;
}

function buildStyles(variant: InvoiceHtmlVariant, singlePage: boolean): string {
  const font =
    variant === "pdf"
      ? '"NotoHebrew", "Arial", sans-serif'
      : '"Arial", "David", "Segoe UI", sans-serif';
  const fontImport = variant === "pdf" ? fontFaceCss() : "";

  const shellHeight = singlePage
    ? `.shell--one-page { height: 297mm; max-height: 297mm; overflow: hidden; }`
    : `.shell { min-height: 297mm; }`;

  return `
    ${fontImport}
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; margin: 0; padding: 0; }
    body {
      font-family: ${font};
      color: #0f172a;
      font-size: 11pt;
      line-height: 1.5;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .he-label,
    .totals .label,
    thead th,
    .doc-no {
      font-family: "NotoHebrew", Arial, "David", "Segoe UI", sans-serif;
    }
    .shell {
      width: 210mm;
      display: flex;
      flex-direction: column;
      padding: 11mm 14mm 9mm;
      background: #fff;
      box-sizing: border-box;
    }
    ${shellHeight}
    .band {
      flex-shrink: 0;
      background: linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%);
      color: #fff;
      border-radius: 14px;
      padding: 20px 24px 18px;
      margin-bottom: 14px;
    }
    .band h1 { margin: 0; font-size: 24pt; font-weight: 700; }
    .band .sub { margin: 6px 0 0; font-size: 11pt; color: #e0e7ff; }
    .doc-no {
      margin-top: 10px;
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 10pt;
      font-weight: 700;
    }
    .cols { flex-shrink: 0; display: flex; gap: 14px; margin-bottom: 14px; }
    .box {
      flex: 1;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      background: #fafafa;
    }
    .lbl { font-size: 8.5pt; color: #6366f1; font-weight: 700; margin-bottom: 6px; }
    .val { font-size: 12pt; font-weight: 700; }
    .hebrew { unicode-bidi: plaintext; text-align: right; display: block; }
    .meta { font-size: 10pt; color: #64748b; margin-top: 4px; }
    .table-card {
      flex-shrink: 0;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
    }
    .table-card-title {
      background: #f1f5f9;
      padding: 8px 14px;
      font-size: 9pt;
      font-weight: 700;
      color: #64748b;
    }
    table { width: 100%; border-collapse: collapse; direction: rtl; }
    thead th {
      background: #eef2ff;
      color: #4338ca;
      font-size: 9.5pt;
      font-weight: 700;
      padding: 10px 12px;
      border-bottom: 2px solid #c7d2fe;
      text-align: right;
    }
    tbody td {
      padding: 11px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    tbody tr.row-alt td { background: #fafafa; }
    tbody tr.row-filler td { height: 30px; border-bottom: 1px solid #f8fafc; }
    .col-desc { width: 42%; text-align: right; }
    .col-qty { width: 12%; text-align: center; }
    .col-price, .col-total { width: 23%; text-align: center; }
    .col-total { font-weight: 700; }
    .money {
      unicode-bidi: isolate;
      direction: ltr;
      display: inline-block;
      white-space: nowrap;
      font-weight: 600;
    }
    .page-spacer { flex: 1 1 auto; min-height: 6mm; }
    .closing { flex-shrink: 0; break-inside: avoid; page-break-inside: avoid; }
    .bottom { display: flex; gap: 16px; align-items: flex-start; }
    .totals {
      width: 280px;
      border: 2px solid #e0e7ff;
      border-radius: 10px;
      padding: 14px 16px;
      background: #fafaff;
      flex-shrink: 0;
    }
    .totals .line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin: 7px 0;
      font-size: 10.5pt;
    }
    .totals .line .label { color: #64748b; }
    .totals .grand {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-top: 10px;
      padding-top: 12px;
      border-top: 2px solid #c7d2fe;
      font-size: 13pt;
      font-weight: 700;
      color: #4338ca;
    }
    .notes {
      flex: 1;
      border: 1px dashed #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      min-height: 80px;
    }
    .notes-title { font-size: 9pt; font-weight: 700; color: #64748b; margin-bottom: 6px; }
    .notes-body { margin: 0; font-size: 10pt; color: #475569; }
    .alloc {
      margin-top: 12px;
      padding: 10px 14px;
      background: #eef2ff;
      border-radius: 8px;
      font-size: 10pt;
      font-weight: 700;
      color: #4338ca;
    }
    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #94a3b8;
      text-align: center;
      line-height: 1.55;
    }
  `;
}

/** HTML למסמך — PDF (עמוד A4 אחד למסמכים קצרים) או Word */
export function buildInvoicePrintHtml(
  payload: InvoiceExportPayload,
  variant: InvoiceHtmlVariant = "pdf",
): string {
  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);
  const singlePage = payload.items.length <= 14;

  const rows = payload.items
    .map(
      (i, idx) => `<tr class="${idx % 2 === 1 ? "row-alt" : ""}">
        <td class="col-desc"><span class="hebrew">${escapeHtml(i.desc || "—")}</span></td>
        <td class="col-qty"><bdi class="money" dir="ltr">${i.qty}</bdi></td>
        <td class="col-price">${moneyHtml(i.price)}</td>
        <td class="col-total">${moneyHtml(i.qty * i.price)}</td>
      </tr>`,
    )
    .join("");

  const emptyRow =
    payload.items.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">אין פריטים</td></tr>`
      : "";

  const fillerCount =
    singlePage && payload.items.length > 0 ? Math.max(0, 6 - payload.items.length) : 0;
  const fillerRows = Array.from(
    { length: fillerCount },
    () => `<tr class="row-filler"><td colspan="4">&#8203;</td></tr>`,
  ).join("");

  const notesBlock = payload.paymentNote
    ? `<section class="notes">
        <div class="notes-title">הערות</div>
        <p class="notes-body">${escapeHtml(payload.paymentNote)}</p>
      </section>`
    : "";

  const shellClass = singlePage ? "shell shell--one-page" : "shell";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <style>${buildStyles(variant, singlePage)}</style>
</head>
<body>
  <div class="${shellClass}">
    <header class="band">
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">${escapeHtml(payload.orgName ?? "BSD-YBM")}</p>
      <span class="doc-no">${LBL_DOC_NUM} ${payload.number}</span>
    </header>

    <div class="cols">
      <div class="box">
        <div class="lbl">מאת</div>
        <div class="val"><span class="hebrew">${escapeHtml(payload.orgName ?? "—")}</span></div>
        ${payload.orgTaxIdLine ? `<div class="meta"><bdi class="money" dir="ltr">${escapeHtml(payload.orgTaxIdLine)}</bdi></div>` : ""}
        ${payload.orgAddress ? `<div class="meta"><span class="hebrew">${escapeHtml(payload.orgAddress)}</span></div>` : ""}
      </div>
      <div class="box">
        <div class="lbl">לכבוד</div>
        <div class="val"><span class="hebrew">${escapeHtml(payload.clientName)}</span></div>
        <div class="meta">תאריך: ${escapeHtml(payload.date)}</div>
        ${payload.dueDate ? `<div class="meta">לתשלום עד: ${escapeHtml(payload.dueDate)}</div>` : ""}
      </div>
    </div>

    <section class="table-card">
      <div class="table-card-title">פירוט פריטים</div>
      <table>
        <thead>
          <tr>
            <th class="col-desc">תיאור</th>
            <th class="col-qty">כמות</th>
            <th class="col-price">מחיר ליחידה</th>
            <th class="col-total he-label">${LBL_TOTAL}</th>
          </tr>
        </thead>
        <tbody>${rows}${emptyRow}${fillerRows}</tbody>
      </table>
    </section>

    <div class="page-spacer"></div>

    <div class="closing">
      <div class="bottom">
        ${notesBlock}
        <div style="flex:1"></div>
        <div class="totals">
          <div class="line"><span class="label he-label">${LBL_BEFORE_VAT}</span>${moneyHtml(payload.amount)}</div>
          <div class="line"><span class="label he-label">${LBL_VAT} (${vatPct}%)</span>${moneyHtml(payload.vat)}</div>
          <div class="grand"><span class="label he-label">${LBL_TOTAL} לתשלום</span>${moneyHtml(payload.total)}</div>
        </div>
      </div>
      ${payload.itaAllocationNumber ? `<p class="alloc">מספר הקצאה: <bdi class="money" dir="ltr">${escapeHtml(payload.itaAllocationNumber)}</bdi></p>` : ""}
      <footer class="footer">
        <strong>BSD-YBM-OS</strong> · מסמך הופק במערכת ניהול עסקי ·
        אין לראות במסמך זה כקבלה אלא אם צוין במפורש
      </footer>
    </div>
  </div>
</body>
</html>`;
}
