import { emptyModelUsage } from "@/lib/ai-usage";
import { priceModelUsage } from "@/lib/ai-pricing";
import type { UsageGroupRow } from "@/lib/ai-cost-summary";

/**
 * What VMB costs to run in a range, in agorot, from what the system measured: model calls, DWG conversions, compute
 * time, storage, the payment gateway's cut, and the fixed monthly costs the owner entered.
 *
 * A line whose rate nobody entered is not guessed: it comes back with `minor: null` and the rate it waits for, and the
 * total says it is partial. Pure, so the console and the tests read the same numbers.
 */

/** Rates the owner enters in the console (VmbCostRate). None has a default: an unset rate leaves its line unpriced. */
export const COST_RATE_KEYS = ["dwgConversionUsd", "computeUsdPerHour", "storageUsdPerGbMonth", "paypalPercent", "paypalFixedIls", "dailyCeilingIls"] as const;
export type CostRateKey = (typeof COST_RATE_KEYS)[number];
export type CostRates = Partial<Record<CostRateKey, number>>;

export const COST_LINE_KEYS = ["ai", "dwg", "compute", "storage", "gateway", "fixed"] as const;
export type CostLineKey = (typeof COST_LINE_KEYS)[number];
export type Missing = CostRateKey | "usdToIls";

export type CostLine = { key: CostLineKey; /** Agorot; null when a rate is missing. */ minor: number | null; /** Calls, files, seconds, bytes, payments or vendors. */ qty: number; missing: Missing[] };

export type CostJob = { workspaceId: string; computeMs: number | null; dwgConversions: number; delivered: boolean; picturesPainted: number };
export type CostPayment = { workspaceId: string; gateway: string; amountMinor: number };
export type FixedCost = { id: string; vendor: string; amountMinor: number; currency: string; startsOn: Date; endsOn: Date | null };

export type CostInputs = {
  range: { from: Date; to: Date };
  /** Model calls of the VMB engine in the range (feature "vmb-engine:<workspace>"). */
  ai: UsageGroupRow[];
  jobs: CostJob[];
  /** Bytes of client files held now. */
  storageBytes: number;
  /** Completed payments in the range. */
  payments: CostPayment[];
  fixed: FixedCost[];
  rates: CostRates;
  /** Shekels to the dollar; null when no rate could be fetched. */
  usdToIls: number | null;
};

export type OfficeCost = { workspaceId: string; costMinor: number; revenueMinor: number; booklets: number };

export type CostReport = {
  lines: CostLine[];
  /** Sum of the lines that have a figure. */
  totalMinor: number;
  /** Rates still to enter; non-empty means the total is partial. */
  missing: Missing[];
  revenueMinor: number;
  marginMinor: number;
  booklets: number;
  picturesPainted: number;
  /** Model calls, conversions and compute per delivered booklet; null before any booklet. */
  perBookletMinor: number | null;
  /** Model calls per painted picture; null before any was painted. */
  perPaintedMinor: number | null;
  /** Model calls whose model is not on the price list (lib/ai-pricing.ts). */
  aiUnpricedCalls: number;
  fixedRows: Array<{ id: string; vendor: string; minor: number | null }>;
  offices: OfficeCost[];
};

const GB = 1024 ** 3;
const ENGINE = /^vmb-engine:(.+)$/;

/** The workspace a usage row was recorded for, from its feature tag. */
export function engineWorkspace(feature: string): string | null {
  return ENGINE.exec(feature)?.[1] ?? null;
}

/** The share of the range a fixed cost was running in, 0..1. */
export function activeShare(c: Pick<FixedCost, "startsOn" | "endsOn">, range: { from: Date; to: Date }): number {
  const span = range.to.getTime() - range.from.getTime();
  if (span <= 0) return 0;
  const from = Math.max(c.startsOn.getTime(), range.from.getTime());
  const to = Math.min(c.endsOn ? c.endsOn.getTime() : Infinity, range.to.getTime());
  return Math.max(0, to - from) / span;
}

const toMinor = (usd: number, usdToIls: number) => Math.round(usd * usdToIls * 100);

export function costReport(input: CostInputs): CostReport {
  const { rates, usdToIls, range } = input;
  // The console's range is one calendar month, whatever its length: a monthly cost counts once.
  const months = 1;
  const perOffice = new Map<string, OfficeCost>();
  const office = (id: string) => {
    let o = perOffice.get(id);
    if (!o) perOffice.set(id, (o = { workspaceId: id, costMinor: 0, revenueMinor: 0, booklets: 0 }));
    return o;
  };

  // Model calls: the providers' price list, at the start of the range.
  let aiUsd = 0;
  let aiCalls = 0;
  let aiUnpricedCalls = 0;
  for (const row of input.ai) {
    aiCalls += row.calls;
    const usd = priceModelUsage(row.model, { ...emptyModelUsage(), calls: row.calls, inputTokens: row.inputTokens, outputTokens: row.outputTokens, imageTokens: row.imageTokens, outputImages: row.outputImages }, range.from);
    if (usd == null) {
      aiUnpricedCalls += row.calls;
      continue;
    }
    aiUsd += usd;
    const ws = engineWorkspace(row.feature);
    if (ws && usdToIls != null) office(ws).costMinor += toMinor(usd, usdToIls);
  }

  const dwgFiles = input.jobs.reduce((a, j) => a + j.dwgConversions, 0);
  const computeMs = input.jobs.reduce((a, j) => a + (j.computeMs ?? 0), 0);
  const dwgUsd = rates.dwgConversionUsd;
  const computeUsd = rates.computeUsdPerHour;
  for (const j of input.jobs) {
    const o = office(j.workspaceId);
    if (j.delivered) o.booklets++;
    if (usdToIls == null) continue;
    if (dwgUsd != null) o.costMinor += toMinor(j.dwgConversions * dwgUsd, usdToIls);
    if (computeUsd != null) o.costMinor += toMinor(((j.computeMs ?? 0) / 3_600_000) * computeUsd, usdToIls);
  }

  let gatewayMinor = 0;
  const gatewayMissing = new Set<Missing>();
  let revenueMinor = 0;
  for (const p of input.payments) {
    revenueMinor += p.amountMinor;
    const o = office(p.workspaceId);
    o.revenueMinor += p.amountMinor;
    if (p.gateway !== "paypal") continue; // a bank transfer costs nothing here
    if (rates.paypalPercent == null) gatewayMissing.add("paypalPercent");
    if (rates.paypalFixedIls == null) gatewayMissing.add("paypalFixedIls");
    if (rates.paypalPercent == null || rates.paypalFixedIls == null) continue;
    const fee = Math.round((p.amountMinor * rates.paypalPercent) / 100 + rates.paypalFixedIls * 100);
    gatewayMinor += fee;
    o.costMinor += fee;
  }

  const fixedRows = input.fixed
    .map((c) => {
      const share = activeShare(c, range);
      if (share <= 0) return null;
      const perRange = c.amountMinor * months * share;
      const minor = c.currency === "USD" ? (usdToIls == null ? null : Math.round((perRange / 100) * usdToIls * 100)) : Math.round(perRange);
      return { id: c.id, vendor: c.vendor, minor };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const usdLine = (key: CostLineKey, usd: number | null, qty: number, rate?: CostRateKey): CostLine => {
    const missing: Missing[] = [];
    if (usd == null && rate) missing.push(rate);
    if (usdToIls == null) missing.push("usdToIls");
    return { key, qty, missing, minor: usd == null || usdToIls == null ? null : toMinor(usd, usdToIls) };
  };
  const fixedMissing: Missing[] = fixedRows.some((r) => r.minor == null) ? ["usdToIls"] : [];
  const lines: CostLine[] = [
    usdLine("ai", aiUsd, aiCalls),
    usdLine("dwg", dwgUsd == null ? null : dwgFiles * dwgUsd, dwgFiles, "dwgConversionUsd"),
    usdLine("compute", computeUsd == null ? null : (computeMs / 3_600_000) * computeUsd, Math.round(computeMs / 1000), "computeUsdPerHour"),
    usdLine("storage", rates.storageUsdPerGbMonth == null ? null : (input.storageBytes / GB) * rates.storageUsdPerGbMonth * months, input.storageBytes, "storageUsdPerGbMonth"),
    { key: "gateway", qty: input.payments.filter((p) => p.gateway === "paypal").length, missing: [...gatewayMissing], minor: gatewayMissing.size ? null : gatewayMinor },
    { key: "fixed", qty: fixedRows.length, missing: fixedMissing, minor: fixedRows.reduce((a, r) => a + (r.minor ?? 0), 0) },
  ];
  // A line nothing happened on needs no rate.
  for (const l of lines) {
    if (l.qty === 0 && l.minor == null) {
      l.minor = 0;
      l.missing = [];
    }
  }

  const totalMinor = lines.reduce((a, l) => a + (l.minor ?? 0), 0);
  const booklets = input.jobs.filter((j) => j.delivered).length;
  const picturesPainted = input.jobs.reduce((a, j) => a + j.picturesPainted, 0);
  const variable = (["ai", "dwg", "compute"] as const).reduce((a, k) => a + (lines.find((l) => l.key === k)?.minor ?? 0), 0);
  const aiMinor = lines[0]!.minor;
  return {
    lines,
    totalMinor,
    missing: [...new Set(lines.flatMap((l) => l.missing))],
    revenueMinor,
    marginMinor: revenueMinor - totalMinor,
    booklets,
    picturesPainted,
    perBookletMinor: booklets ? Math.round(variable / booklets) : null,
    perPaintedMinor: picturesPainted && aiMinor != null ? Math.round(aiMinor / picturesPainted) : null,
    aiUnpricedCalls,
    fixedRows,
    offices: [...perOffice.values()].filter((o) => o.costMinor || o.revenueMinor || o.booklets).sort((a, b) => b.costMinor - a.costMinor || b.revenueMinor - a.revenueMinor),
  };
}
