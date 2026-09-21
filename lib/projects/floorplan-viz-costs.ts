import { mergeLedgers, type AiUsageLedger } from "@/lib/ai-usage";
import { PRICES_CHECKED_AT, priceLedger, type CostLine } from "@/lib/ai-pricing";
import type { FloorplanSpend } from "@/lib/projects/floorplan-spend";

/**
 * What the visualisations cost, run by run and in total.
 *
 * Built from the ledger each run carries, priced at the rates in force when
 * the run was made. Runs stored before tokens were recorded have call counts
 * and no ledger; they are listed, marked unmeasured, and add nothing to the
 * total rather than a guess.
 */

export type FloorplanVizRunCost = {
  runId: string;
  title: string;
  createdAt: string;
  /** Null when the run predates token recording. */
  usd: number | null;
  imageCalls: number;
  auditCalls: number;
  extractCalls: number;
  unpricedCalls: number;
};

export type FloorplanVizCostSummary = {
  from: string;
  to: string;
  usd: number;
  runs: FloorplanVizRunCost[];
  measuredRuns: number;
  unmeasuredRuns: number;
  /** Mean over measured runs only. */
  averageUsdPerRun: number | null;
  byModel: CostLine[];
  unpricedCalls: number;
  pricesCheckedAt: string;
};

export function spendFromEnginesJson(enginesJson: unknown): FloorplanSpend | undefined {
  if (!enginesJson || typeof enginesJson !== "object") return undefined;
  const spend = (enginesJson as { spend?: unknown }).spend;
  return spend && typeof spend === "object" ? (spend as FloorplanSpend) : undefined;
}

function hasLedger(spend: FloorplanSpend | undefined): spend is FloorplanSpend & { usage: AiUsageLedger } {
  return Boolean(spend?.usageComplete === true && spend.usage && Object.keys(spend.usage).length > 0);
}

export function costOfRun(row: {
  id: string;
  title: string;
  createdAt: Date;
  enginesJson: unknown;
}): FloorplanVizRunCost {
  const spend = spendFromEnginesJson(row.enginesJson);
  const report = hasLedger(spend) ? priceLedger(spend.usage, row.createdAt) : null;
  return {
    runId: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    usd: report ? report.usd : null,
    imageCalls: spend?.imageCalls ?? 0,
    auditCalls: spend?.auditCalls ?? 0,
    extractCalls: spend?.extractCalls ?? 0,
    unpricedCalls: report?.unpricedCalls ?? 0,
  };
}

export function summarizeFloorplanVizCosts(
  rows: Array<{ id: string; title: string; createdAt: Date; enginesJson: unknown }>,
  range: { from: Date; to: Date },
): FloorplanVizCostSummary {
  const runs = rows.map(costOfRun);
  const measured = runs.filter((run) => run.usd != null);
  // By model: every measured run's ledger, priced in one go. Rates are taken
  // at the end of the range — the one place a mid-range price change could
  // shift a model's line, never the per-run figures above it.
  const ledger: AiUsageLedger = {};
  for (const row of rows) {
    const spend = spendFromEnginesJson(row.enginesJson);
    if (hasLedger(spend)) mergeLedgers(ledger, spend.usage);
  }
  const byModel = priceLedger(ledger, range.to);
  const usd = measured.reduce((sum, run) => sum + (run.usd ?? 0), 0);
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    usd,
    runs,
    measuredRuns: measured.length,
    unmeasuredRuns: runs.length - measured.length,
    averageUsdPerRun: measured.length > 0 ? usd / measured.length : null,
    byModel: byModel.lines,
    unpricedCalls: byModel.unpricedCalls,
    pricesCheckedAt: PRICES_CHECKED_AT,
  };
}

/** "2026-09" → the first instant of that month and of the next, in UTC. */
export function monthRange(month: string | null | undefined, now = new Date()): { from: Date; to: Date; month: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month?.trim() ?? "");
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const index = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, index, 1));
  const to = new Date(Date.UTC(year, index + 1, 1));
  return { from, to, month: `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}` };
}

/**
 * The admin's view: what each booklet cost to make against what it sells for.
 *
 * Costs are billed in dollars and booklets are sold in shekels, so the margin
 * needs a rate. It is passed in, from the day's published rate; without one
 * the page shows dollars and shekels side by side and no margin, rather than
 * a margin on a made-up rate.
 */
export type AdminVizRunCost = FloorplanVizRunCost & {
  organizationId: string;
  organizationName: string;
  scope: string;
  stillCount: number;
  /** A platform admin's own run — listed and costed, never counted as a sale. */
  internal: boolean;
  /** Zero for an internal run. */
  revenueIls: number;
  costIls: number | null;
  marginIls: number | null;
};

export type AdminVizCostSummary = Omit<FloorplanVizCostSummary, "runs"> & {
  runs: AdminVizRunCost[];
  usdToIls: number | null;
  rateDate: string | null;
  costIls: number | null;
  /** Tariff over every customer run in the range, measured or not. */
  revenueIls: number;
  /**
   * Revenue less cost, over measured customer runs only, so an unmeasured run
   * is not "free". Null until there is at least one such run.
   */
  marginIls: number | null;
  measuredRevenueIls: number;
  /** Runs made by platform admins: what testing cost, apart from sales. */
  internalRuns: number;
  internalUsd: number;
  byOrganization: Array<{
    organizationId: string;
    organizationName: string;
    runs: number;
    usd: number;
    revenueIls: number;
  }>;
};

export function summarizeAdminVizCosts(
  rows: Array<{
    id: string;
    title: string;
    createdAt: Date;
    enginesJson: unknown;
    scope: string;
    organizationId: string;
    organizationName: string;
    stillCount: number;
    internal?: boolean;
  }>,
  range: { from: Date; to: Date },
  tariff: (scope: string) => number,
  rate: { usdToIls: number; date: string } | null,
): AdminVizCostSummary {
  const base = summarizeFloorplanVizCosts(rows, range);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const runs: AdminVizRunCost[] = base.runs.map((run) => {
    const row = byId.get(run.runId)!;
    const internal = row.internal === true;
    const revenueIls = internal ? 0 : tariff(row.scope);
    const costIls = run.usd != null && rate ? run.usd * rate.usdToIls : null;
    return {
      ...run,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      scope: row.scope,
      stillCount: row.stillCount,
      internal,
      revenueIls,
      costIls,
      marginIls: costIls != null && !internal ? revenueIls - costIls : null,
    };
  });
  const sold = runs.filter((run) => !run.internal);
  const measuredSold = sold.filter((run) => run.usd != null);
  const measuredRevenueIls = measuredSold.reduce((sum, run) => sum + run.revenueIls, 0);
  const soldUsd = measuredSold.reduce((sum, run) => sum + (run.usd ?? 0), 0);
  const internal = runs.filter((run) => run.internal);

  const orgs = new Map<string, AdminVizCostSummary["byOrganization"][number]>();
  for (const run of runs) {
    const org = orgs.get(run.organizationId) ?? {
      organizationId: run.organizationId,
      organizationName: run.organizationName,
      runs: 0,
      usd: 0,
      revenueIls: 0,
    };
    org.runs += 1;
    org.usd += run.usd ?? 0;
    org.revenueIls += run.revenueIls;
    orgs.set(run.organizationId, org);
  }

  return {
    ...base,
    runs,
    usdToIls: rate?.usdToIls ?? null,
    rateDate: rate?.date ?? null,
    costIls: rate ? base.usd * rate.usdToIls : null,
    revenueIls: sold.reduce((sum, run) => sum + run.revenueIls, 0),
    // Customer runs only: an internal run costs money and sells nothing, and
    // with no measured customer run yet there is no margin to show, not a zero.
    marginIls: rate && measuredSold.length > 0 ? measuredRevenueIls - soldUsd * rate.usdToIls : null,
    measuredRevenueIls,
    internalRuns: internal.length,
    internalUsd: internal.reduce((sum, run) => sum + (run.usd ?? 0), 0),
    byOrganization: [...orgs.values()].sort((a, b) => b.usd - a.usd),
  };
}
