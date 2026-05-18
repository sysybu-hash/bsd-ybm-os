import type { DocType } from "@prisma/client";

/** סף מספר הקצאה לפני מע״מ — מעודכן ל-18/05/2026 */
const THRESHOLD_FROM_2026_01_01 = 10_000;
const THRESHOLD_FROM_2026_06_01 = 5_000;

const THRESHOLD_CHANGE_JUNE_2026 = new Date("2026-06-01T00:00:00.000Z");

/** סוגי מסמך שדורשים מספר הקצאה מעל הסף (הנפקה) */
const ITA_ISSUER_TYPES = new Set<DocType>([
  "INVOICE",
  "INVOICE_RECEIPT",
  "TRANSACTION_INVOICE",
  "CREDIT_NOTE",
]);

export function getItaAllocationThresholdNis(asOf: Date = new Date()): number {
  if (asOf >= THRESHOLD_CHANGE_JUNE_2026) {
    return THRESHOLD_FROM_2026_06_01;
  }
  return THRESHOLD_FROM_2026_01_01;
}

export function docTypeRequiresItaAllocation(type: DocType): boolean {
  return ITA_ISSUER_TYPES.has(type);
}

/** netAmount = סכום לפני מע״מ */
export function requiresItaAllocation(
  type: DocType,
  netAmount: number,
  asOf: Date = new Date(),
): boolean {
  if (!docTypeRequiresItaAllocation(type)) return false;
  return netAmount >= getItaAllocationThresholdNis(asOf);
}
