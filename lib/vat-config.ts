/** שיעור מע״מ ברירת מחדל בישראל — 18% (מאי 2025) */
export const DEFAULT_VAT_RATE_PERCENT = 18;

export function vatRateDecimal(percent: number): number {
  const p = Number.isFinite(percent) && percent >= 0 ? percent : DEFAULT_VAT_RATE_PERCENT;
  return p / 100;
}

export function resolveVatRatePercent(orgPercent: number | null | undefined): number {
  if (orgPercent == null || !Number.isFinite(orgPercent) || orgPercent < 0) {
    return DEFAULT_VAT_RATE_PERCENT;
  }
  return orgPercent;
}

export function formatVatPercent(percent: number): string {
  const p = resolveVatRatePercent(percent);
  return Number.isInteger(p) ? String(p) : p.toFixed(2);
}
