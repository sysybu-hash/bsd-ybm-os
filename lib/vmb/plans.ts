import { DEFAULT_VAT_RATE_PERCENT } from "@/lib/vat-config";

/**
 * VisualModuBuild price list: the one place prices, included credits and
 * credit packs live. Amounts are in agorot before VAT; VAT is added at checkout.
 *
 * Launch numbers, approved by the owner on 2026-11-11. A credit must cover the
 * paid painting cost of ~3.4–5¢ per image (live research doc, item 16).
 */
export const VMB_ANNUAL_PLAN = {
  id: "office",
  priceMinor: 15_000_00,
  includedCredits: 2_000,
  periodMonths: 12,
} as const;

export const VMB_CREDIT_PACKS = [
  { id: "p500", credits: 500, priceMinor: 2_500_00 },
  { id: "p1500", credits: 1_500, priceMinor: 6_750_00 },
  { id: "p5000", credits: 5_000, priceMinor: 20_000_00 },
] as const;

export type VmbCreditPack = (typeof VMB_CREDIT_PACKS)[number];

export function findCreditPack(id: string): VmbCreditPack | undefined {
  return VMB_CREDIT_PACKS.find((p) => p.id === id);
}

/** Price including VAT, in agorot (rounded to the agora). */
export function withVat(minor: number, vatPercent: number = DEFAULT_VAT_RATE_PERCENT): number {
  return Math.round(minor * (1 + vatPercent / 100));
}

/** "15000.00": the decimal string payment gateways expect. */
export function minorToDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** The period that starts now, or right after a still-running period ends (renewal). */
export function nextPeriod(now: Date, currentEnd: Date | null): { start: Date; end: Date } {
  const start = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + VMB_ANNUAL_PLAN.periodMonths);
  return { start, end };
}

/**
 * What a booklet costs in credits — PLACEHOLDERS until the owner sets them (live research doc, item 18).
 *
 * One credit is one painted picture delivered. A picture the deviation gate refuses twice goes out as the free render
 * (rule 13.6) and costs nothing, so the hold is the ceiling (every picture painted) and the bill is what was delivered.
 * `base` covers reading, the model and the booklet itself, by building kind.
 */
export const VMB_BOOKLET_PRICING = {
  creditsPerPicture: 1,
  base: { flat: 2, house: 4, building: 6, industrial: 4, public: 6 },
  /** Pictures each chosen view yields, by building kind. */
  picturesPerView: {
    flat: { exterior_day: 0, exterior_dusk: 0, aerial: 0, interior: 6 },
    house: { exterior_day: 4, exterior_dusk: 2, aerial: 2, interior: 6 },
    building: { exterior_day: 4, exterior_dusk: 2, aerial: 2, interior: 3 },
    industrial: { exterior_day: 4, exterior_dusk: 2, aerial: 2, interior: 2 },
    public: { exterior_day: 4, exterior_dusk: 2, aerial: 2, interior: 4 },
  },
  /** Share of pictures expected to come out painted rather than as the free render (target ≥ 80%, rule 13.9). */
  expectedPaintedShare: 0.85,
} as const;
