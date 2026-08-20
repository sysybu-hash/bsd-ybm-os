import type { LineItemV5 } from "@/lib/scan-schema-v5";

const PLACEHOLDER_VENDOR = new Set(
  [
    "",
    "לא צוין",
    "לא ידוע",
    "ספק לא ידוע",
    "ספק כללי",
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
  ].map((s) => s.toLowerCase()),
);

/** ספק שלא ניתן להציג למשתמש (ברירת מחדל / חילוץ ריק) */
export function isPlaceholderVendor(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return PLACEHOLDER_VENDOR.has(value.trim().toLowerCase());
}

/** מפרסר סכום ממספר או מחרוזת עם פסיקים/סימן ₪ */
export function parseMoneyField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const v = parseFloat(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return null;
}

/** סכום שורות — lineTotal או quantity × unitPrice */
export function sumLineItemsTotal(items: LineItemV5[]): number {
  return items.reduce((acc, row) => {
    if (typeof row.lineTotal === "number" && Number.isFinite(row.lineTotal) && row.lineTotal > 0) {
      return acc + row.lineTotal;
    }
    const q = row.quantity;
    const up = row.unitPrice;
    if (typeof q === "number" && typeof up === "number" && q > 0 && up > 0) {
      return acc + q * up;
    }
    return acc;
  }, 0);
}

/** בוחר שם ספק ממקורות חלופיים בפלט AI גולמי */
export function pickVendorFromRaw(
  raw: Record<string, unknown>,
  clientFallback?: string | null,
): string {
  const candidates: unknown[] = [
    raw.vendor,
    raw.supplier,
    raw.supplier_name,
    raw.supplierName,
    raw.seller,
    raw.seller_name,
    clientFallback,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && !isPlaceholderVendor(c.trim())) {
      return c.trim();
    }
  }
  return typeof raw.vendor === "string" && raw.vendor.trim() ? raw.vendor.trim() : "לא צוין";
}

/** בוחר סה״כ ממקורות חלופיים או מסכום שורות */
export function pickTotalFromRaw(
  raw: Record<string, unknown>,
  lineItems: LineItemV5[],
): number {
  const direct = [
    raw.total,
    raw.amount,
    raw.grand_total,
    raw.grandTotal,
    raw.invoice_total,
    raw.invoiceTotal,
    raw.net_amount,
  ];
  for (const field of direct) {
    const n = parseMoneyField(field);
    if (n != null) return n;
  }
  const fromLines = sumLineItemsTotal(lineItems);
  return fromLines > 0 ? fromLines : 0;
}
