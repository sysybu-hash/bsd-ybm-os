import { VAT_RATE } from "@/lib/billing-calculations";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

/** הפרדה גסה: סה״כ מסמך (כולל מע״מ) / (1+מע״מ) כשאין שורות מספקות. */
function lineItemsNetTotal(e: ScanExtractionV5): number {
  let s = 0;
  for (const li of e.lineItems) {
    if (li.lineTotal != null && Number.isFinite(li.lineTotal) && li.lineTotal > 0) {
      s += li.lineTotal;
    } else if (li.unitPrice != null && li.quantity != null && li.unitPrice > 0) {
      s += li.unitPrice * li.quantity;
    }
  }
  return s;
}

export function scanV5ToExpenseAmounts(
  e: ScanExtractionV5,
): { amountNet: number; vat: number; total: number } {
  const lineNet = lineItemsNetTotal(e);
  if (lineNet > 0) {
    const vat = Math.round(lineNet * VAT_RATE * 100) / 100;
    const total = Math.round((lineNet + vat) * 100) / 100;
    return { amountNet: lineNet, vat, total };
  }
  const docTotal = e.total;
  if (docTotal > 0) {
    const amountNet = Math.round((docTotal / (1 + VAT_RATE)) * 100) / 100;
    const vat = Math.round((docTotal - amountNet) * 100) / 100;
    return { amountNet, vat, total: docTotal };
  }
  return { amountNet: 0, vat: 0, total: 0 };
}

export function isExpenseLikeScanV5(e: ScanExtractionV5): boolean {
  if (e.documentMetadata?.scanMode === "INVOICE_FINANCIAL") return true;
  if (e.total > 0 && e.vendor && e.vendor.trim() !== "לא צוין") return true;
  if (e.lineItems.length > 0 && (e.total > 0 || lineItemsNetTotal(e) > 0)) return true;
  return false;
}
