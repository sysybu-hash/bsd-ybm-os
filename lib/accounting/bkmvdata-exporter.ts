/**
 * BKMVDATA Exporter — מבנה אחיד (Israeli Tax Authority standard)
 *
 * Exports financial data in the standard Israeli BKMVDATA format
 * (as required by מע"מ for digital bookkeeping reports).
 *
 * Format reference: מבנה אחיד לנתוני הנהלת חשבונות — רשות המסים
 * Fields: C100 (documents), D110 (line items), B100 (opening balances)
 *
 * Compatible with: Priority, חשבשבת, ממיר נתונים מע"מ
 */

import {
  AccountingExporter,
  registerAccountingExporter,
  type AccountingExportRequest,
  type AccountingExportResult,
  type AccountingDocument,
} from "./accounting-exporter";

const DOC_TYPE_CODE: Record<string, string> = {
  INVOICE: "320",         // חשבונית מס
  RECEIPT: "400",         // קבלה
  QUOTE: "100",           // הצעת מחיר
  CREDIT_NOTE: "330",     // חשבונית זיכוי
  DELIVERY_NOTE: "200",   // תעודת משלוח
};

function formatDate(d: Date | null): string {
  if (!d) return "00000000";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function padRight(s: string, len: number): string {
  return s.slice(0, len).padEnd(len, " ");
}

function padNum(n: number, len: number, decimals = 2): string {
  const s = n.toFixed(decimals).replace(".", "").replace("-", "");
  const sign = n < 0 ? "-" : " ";
  return sign + s.padStart(len - 1, "0");
}

function buildC100Record(doc: AccountingDocument, orgTaxId: string): string {
  const docCode = DOC_TYPE_CODE[doc.docType] ?? "320";
  const docNum = (doc.docNumber ?? "0").padStart(9, "0").slice(0, 9);
  const date = formatDate(doc.date);
  const custTaxId = padRight(doc.customerTaxId ?? "", 9);
  const custName = padRight(doc.customerName, 50);
  const total = padNum(doc.total, 15);
  const vat = padNum(doc.vatAmount ?? 0, 15);
  const currency = padRight(doc.currency || "ILS", 3);

  return `C100|${padRight(orgTaxId, 9)}|${docCode}|${docNum}|${date}|${custTaxId}|${custName}|${total}|${vat}|${currency}`;
}

function buildD110Records(doc: AccountingDocument): string[] {
  const docCode = DOC_TYPE_CODE[doc.docType] ?? "320";
  const docNum = (doc.docNumber ?? "0").padStart(9, "0").slice(0, 9);
  return doc.lineItems.map((item, i) => {
    const lineNum = String(i + 1).padStart(4, "0");
    const desc = padRight(item.description, 50);
    const qty = padNum(item.quantity, 10, 3);
    const price = padNum(item.unitPrice, 15);
    const total = padNum(item.lineTotal, 15);
    return `D110|${docCode}|${docNum}|${lineNum}|${desc}|${qty}|${price}|${total}`;
  });
}

export class BkmvdataExporter extends AccountingExporter {
  readonly systemName = "bkmvdata";
  readonly fileExtension = "txt";
  readonly mimeType = "text/plain; charset=windows-1255";

  async export(request: AccountingExportRequest): Promise<AccountingExportResult> {
    const orgTaxId = request.organizationTaxId ?? "000000000";
    const lines: string[] = [];

    // File header
    lines.push(`A000|${padRight(orgTaxId, 9)}|${padRight(request.organizationName, 50)}|${formatDate(request.fromDate)}|${formatDate(request.toDate)}`);

    // Documents
    for (const doc of request.documents ?? []) {
      lines.push(buildC100Record(doc, orgTaxId));
      lines.push(...buildD110Records(doc));
    }

    // File footer
    lines.push(`Z900|${String((request.documents ?? []).length).padStart(9, "0")}`);

    const content = Buffer.from(lines.join("\r\n"), "utf8");
    const fileName = `bkmvdata_${orgTaxId}_${formatDate(request.fromDate)}_${formatDate(request.toDate)}.txt`;

    return {
      fileName,
      mimeType: this.mimeType,
      content,
      summary: this.buildSummary(request),
    };
  }
}

// Self-register
export const bkmvdataExporter = new BkmvdataExporter();
registerAccountingExporter(bkmvdataExporter);
