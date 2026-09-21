import { emptyModelUsage, type AiUsageLedger } from "@/lib/ai-usage";
import { PRICES_CHECKED_AT, priceLedger, priceModelUsage, type CostLine } from "@/lib/ai-pricing";

/**
 * The whole site's AI bill for a range, cut the ways an owner asks about it:
 * by screen, by customer, by model, and by where the traffic came from.
 *
 * Input is the ledger grouped in the database, never the raw rows. Prices are
 * taken at the start of the range; the only scheduled change on the list is on
 * 1 January, and a month never straddles it.
 */

export type UsageGroupRow = {
  feature: string;
  model: string;
  organizationId: string | null;
  environment: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  imageTokens: number;
  outputImages: number;
};

type Slice = { key: string; calls: number; usd: number; unpricedCalls: number };

export type SiteAiCostSummary = {
  usd: number;
  calls: number;
  unpricedCalls: number;
  byFeature: Slice[];
  byOrganization: Array<Slice & { name: string }>;
  byEnvironment: Slice[];
  byModel: CostLine[];
  pricesCheckedAt: string;
};

function addSlice(map: Map<string, Slice>, key: string, calls: number, usd: number | null): void {
  const slice = map.get(key) ?? { key, calls: 0, usd: 0, unpricedCalls: 0 };
  slice.calls += calls;
  if (usd == null) slice.unpricedCalls += calls;
  else slice.usd += usd;
  map.set(key, slice);
}

function sorted(map: Map<string, Slice>): Slice[] {
  return [...map.values()].sort((a, b) => b.usd - a.usd || b.calls - a.calls);
}

export function summarizeSiteAiCosts(
  rows: UsageGroupRow[],
  at: Date,
  organizationNames: Record<string, string>,
): SiteAiCostSummary {
  const features = new Map<string, Slice>();
  const orgs = new Map<string, Slice>();
  const envs = new Map<string, Slice>();
  const ledger: AiUsageLedger = {};
  for (const row of rows) {
    const usage = {
      ...emptyModelUsage(),
      calls: row.calls,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      imageTokens: row.imageTokens,
      outputImages: row.outputImages,
    };
    const usd = priceModelUsage(row.model, usage, at);
    addSlice(features, row.feature, row.calls, usd);
    addSlice(orgs, row.organizationId ?? "", row.calls, usd);
    addSlice(envs, row.environment, row.calls, usd);
    const line = ledger[row.model] ?? emptyModelUsage();
    line.calls += usage.calls;
    line.inputTokens += usage.inputTokens;
    line.outputTokens += usage.outputTokens;
    line.imageTokens += usage.imageTokens;
    line.outputImages += usage.outputImages;
    ledger[row.model] = line;
  }
  const byModel = priceLedger(ledger, at);
  return {
    usd: byModel.usd,
    calls: rows.reduce((n, row) => n + row.calls, 0),
    unpricedCalls: byModel.unpricedCalls,
    byFeature: sorted(features),
    byOrganization: sorted(orgs).map((slice) => ({
      ...slice,
      name: slice.key ? (organizationNames[slice.key] ?? slice.key) : "",
    })),
    byEnvironment: sorted(envs),
    byModel: byModel.lines,
    pricesCheckedAt: PRICES_CHECKED_AT,
  };
}
