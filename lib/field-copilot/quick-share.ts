/**
 * Field Copilot — quick client-side share utilities.
 * Generates a WhatsApp message or a print-ready HTML page from a BOQ draft.
 * No server round-trip required — runs entirely in the browser.
 */

import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { LineItemV5 } from "@/lib/scan-schema-v5";

// ── WhatsApp text share ───────────────────────────────────────────────────────

/** Build a plain-text BOQ summary suitable for WhatsApp. */
export function buildBoqShareText(
  draft: FieldCopilotDraft | null,
  rows: LineItemV5[],
  locale = "he",
): string {
  const isHe = locale === "he";
  const lines: string[] = [];

  // Header
  const clientName = draft?.contactName ?? draft?.projectName;
  if (clientName) {
    lines.push(isHe ? `👷 לקוח: ${clientName}` : `👷 Client: ${clientName}`);
  }
  if (draft?.projectName && draft.projectName !== clientName) {
    lines.push(isHe ? `📁 פרויקט: ${draft.projectName}` : `📁 Project: ${draft.projectName}`);
  }
  if (draft?.scopeSummary) {
    lines.push("", draft.scopeSummary);
  }

  // BOQ rows
  if (rows.length > 0) {
    lines.push("", isHe ? "📋 כתב כמויות:" : "📋 Bill of Quantities:");
    let total = 0;
    rows.forEach((r, i) => {
      const qty = r.quantity ?? 1;
      const price = r.unitPrice ?? 0;
      const lineTotal = price > 0 ? qty * price : 0;
      total += lineTotal;
      const priceStr = price > 0 ? ` — ${qty} × ₪${price.toLocaleString()} = ₪${lineTotal.toLocaleString()}` : ` — ${qty}`;
      lines.push(`${i + 1}. ${r.description}${priceStr}`);
    });
    if (total > 0) {
      lines.push("", isHe ? `💰 סה"כ: ₪${total.toLocaleString()}` : `💰 Total: ₪${total.toLocaleString()}`);
    }
  }

  // Assumptions
  if (draft?.assumptions?.length) {
    lines.push("", isHe ? "⚠️ הנחות וסימני שאלה:" : "⚠️ Assumptions:");
    draft.assumptions.forEach((a) => lines.push(`• ${a}`));
  }

  lines.push("", isHe ? "⚡ נוצר עם BSD-YBM קופיילוט שטח" : "⚡ Generated with BSD-YBM Field Copilot");

  return lines.join("\n");
}

/** Open WhatsApp share with the given text. Opens to contact picker (no phone pre-filled). */
export function openWhatsAppShare(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ── Print / PDF ───────────────────────────────────────────────────────────────

/** Open a print-ready HTML page in a new window (user can save as PDF via browser). */
export function printBoqPdf(
  draft: FieldCopilotDraft | null,
  rows: LineItemV5[],
  locale = "he",
): void {
  const isHe = locale === "he" || locale === "ru";
  const dir = locale === "he" ? "rtl" : "ltr";
  const clientName = draft?.contactName ?? draft?.projectName ?? "";
  const projectName = draft?.projectName ?? "";
  const today = new Date().toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  let total = 0;
  const rowsHtml = rows.map((r, i) => {
    const qty = r.quantity ?? 1;
    const price = r.unitPrice ?? 0;
    const lineTotal = price > 0 ? qty * price : 0;
    total += lineTotal;
    const priceCell = price > 0 ? `₪${price.toLocaleString()}` : `—`;
    const totalCell = lineTotal > 0 ? `₪${lineTotal.toLocaleString()}` : `—`;
    return `<tr>
      <td>${i + 1}</td>
      <td style="text-align:${dir === "rtl" ? "right" : "left"}">${escHtml(r.description)}</td>
      <td>${qty}</td>
      <td>${priceCell}</td>
      <td>${totalCell}</td>
    </tr>`;
  }).join("");

  const totalRow = total > 0
    ? `<tr style="font-weight:bold;border-top:2px solid #333">
        <td colspan="4" style="text-align:${dir === "rtl" ? "right" : "left"}">${isHe ? 'סה"כ' : "Total"}</td>
        <td>₪${total.toLocaleString()}</td>
      </tr>`
    : "";

  const assumptionsHtml = draft?.assumptions?.length
    ? `<div class="section">
        <h3>${isHe ? "הנחות וסימני שאלה" : "Assumptions"}</h3>
        <ul>${draft.assumptions.map((a) => `<li>${escHtml(a)}</li>`).join("")}</ul>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="UTF-8"/>
<title>${isHe ? "כתב כמויות" : "Bill of Quantities"}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; direction: ${dir}; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  h3 { font-size: 14px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 6px 8px; border: 1px solid #ccc; text-align: center; }
  td { padding: 5px 8px; border: 1px solid #ddd; text-align: center; }
  ul { padding-inline-start: 20px; }
  li { margin-bottom: 4px; }
  .disclaimer { font-size: 11px; color: #888; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>${isHe ? "כתב כמויות / הצעת מחיר" : "Bill of Quantities"}</h1>
<div class="meta">
  ${clientName ? `<span>${isHe ? "לקוח" : "Client"}: <strong>${escHtml(clientName)}</strong></span>` : ""}
  ${projectName && projectName !== clientName ? ` &nbsp;|&nbsp; <span>${isHe ? "פרויקט" : "Project"}: <strong>${escHtml(projectName)}</strong></span>` : ""}
  &nbsp;|&nbsp; <span>${today}</span>
</div>
${draft?.scopeSummary ? `<div class="section"><p>${escHtml(draft.scopeSummary)}</p></div>` : ""}
<div class="section">
  <table>
    <thead><tr>
      <th>#</th>
      <th>${isHe ? "תיאור" : "Description"}</th>
      <th>${isHe ? "כמות" : "Qty"}</th>
      <th>${isHe ? "מחיר יחידה" : "Unit Price"}</th>
      <th>${isHe ? 'סה"כ שורה' : "Line Total"}</th>
    </tr></thead>
    <tbody>${rowsHtml}${totalRow}</tbody>
  </table>
</div>
${assumptionsHtml}
<div class="disclaimer">${isHe ? "* טיוטה — נדרש אישור מקצועי לפני שליחה ללקוח" : "* Draft — requires professional review before sending to client"}</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Slight delay so styles load before print dialog
  setTimeout(() => { win.print(); }, 400);
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
