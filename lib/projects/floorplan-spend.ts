/**
 * What a run actually cost, in model calls.
 *
 * Without this, "how much is a booklet" stays a guess. Image calls dominate:
 * each finish is two of them (placement, then recolour), and best-of-N
 * multiplies that. Extraction and the auditor are cheaper but not free.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { mergeLedgers, runWithAiUsage, type AiUsageLedger } from "@/lib/ai-usage";

export type FloorplanSpendKind = "image" | "audit" | "extract";

export type FloorplanSpend = {
  imageCalls: number;
  auditCalls: number;
  extractCalls: number;
  byModel: Record<string, number>;
  /**
   * Tokens and pictures per provider model id — what the bill is made of.
   * Absent on runs stored before it was recorded.
   */
  usage?: AiUsageLedger;
  /**
   * The ledger covers the run from its first call. A run stored before tokens
   * were recorded can still pick up an edit's usage later, and without this
   * that edit alone would read as the cost of the whole run.
   */
  usageComplete?: boolean;
};

export function emptyFloorplanSpend(): FloorplanSpend {
  return { imageCalls: 0, auditCalls: 0, extractCalls: 0, byModel: {}, usage: {} };
}

export function recordFloorplanSpend(
  spend: FloorplanSpend,
  kind: FloorplanSpendKind,
  model = "unknown",
): void {
  if (kind === "image") spend.imageCalls += 1;
  else if (kind === "audit") spend.auditCalls += 1;
  else spend.extractCalls += 1;
  spend.byModel[model] = (spend.byModel[model] ?? 0) + 1;
}

/**
 * One run's bill plus another's: the first generation, then every view added
 * later and every edit, each of which is paid for separately.
 */
export function mergeFloorplanSpend(
  base: FloorplanSpend | undefined,
  extra: FloorplanSpend | undefined,
): FloorplanSpend {
  const out = emptyFloorplanSpend();
  // Complete only if the run's own bill was: a follow-up cannot backfill it.
  out.usageComplete = base ? base.usageComplete === true : extra?.usageComplete === true;
  for (const part of [base, extra]) {
    if (!part) continue;
    out.imageCalls += part.imageCalls ?? 0;
    out.auditCalls += part.auditCalls ?? 0;
    out.extractCalls += part.extractCalls ?? 0;
    for (const [model, n] of Object.entries(part.byModel ?? {})) {
      out.byModel[model] = (out.byModel[model] ?? 0) + n;
    }
    mergeLedgers(out.usage!, part.usage);
  }
  return out;
}

export function formatFloorplanSpend(spend: FloorplanSpend): string {
  const models = Object.entries(spend.byModel)
    .map(([model, n]) => `${model}:${n}`)
    .join(",") || "-";
  return `spend ${spend.imageCalls} image / ${spend.auditCalls} audit / ${spend.extractCalls} extract (${models})`;
}

/** Two image calls per finish attempt — placement, then recolour. */
export function imageCallsForAttempts(attempts: number): number {
  return Math.max(0, attempts) * 2;
}

const ambient = new AsyncLocalStorage<FloorplanSpend>();

/**
 * Counts every image and audit call made inside fn against spend.
 *
 * The photoreal generator reaches the image model and the auditors from a
 * dozen places — attempts, repairs, warm passes, companions. Threading a
 * counter through each of them is how raster runs came to report zero calls.
 */
export function runWithFloorplanSpend<T>(spend: FloorplanSpend, fn: () => Promise<T>): Promise<T> {
  spend.usage ??= {};
  const ledger = spend.usage;
  return ambient.run(spend, () => runWithAiUsage(ledger, fn));
}

/** Records against the spend of the enclosing runWithFloorplanSpend, if any. */
export function recordAmbientFloorplanSpend(kind: FloorplanSpendKind, model?: string): void {
  const spend = ambient.getStore();
  if (spend) recordFloorplanSpend(spend, kind, model);
}
