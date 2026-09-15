/**
 * What a run actually cost, in model calls.
 *
 * Without this, "how much is a booklet" stays a guess. Image calls dominate:
 * each finish is two of them (placement, then recolour), and best-of-N
 * multiplies that. Extraction and the auditor are cheaper but not free.
 */

export type FloorplanSpendKind = "image" | "audit" | "extract";

export type FloorplanSpend = {
  imageCalls: number;
  auditCalls: number;
  extractCalls: number;
  byModel: Record<string, number>;
};

export function emptyFloorplanSpend(): FloorplanSpend {
  return { imageCalls: 0, auditCalls: 0, extractCalls: 0, byModel: {} };
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
