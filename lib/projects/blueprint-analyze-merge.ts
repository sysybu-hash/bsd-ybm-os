import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

export function normKey(s: string): string {
  return s.replace(/[\s"'״׳,.\-–]/g, "").toLowerCase();
}

/** After any analysis, ensure milestones sum to exactly 100% and amounts are consistent */
export function normalizeMilestones(
  milestones: BlueprintAnalysis["milestones"],
  totalEstimatedCost?: number,
): BlueprintAnalysis["milestones"] {
  if (milestones.length === 0) return milestones;

  // Remove duplicates by normalized name
  const seen = new Map<string, BlueprintAnalysis["milestones"][number]>();
  for (const m of milestones) {
    const k = normKey(m.name);
    if (!seen.has(k)) seen.set(k, m);
  }
  const deduped = Array.from(seen.values());

  // Parse percentages
  const withPct = deduped.map((m) => ({
    ...m,
    _pct: typeof m.percent === "number" ? m.percent : parseFloat(String(m.percent ?? "0")) || 0,
  }));

  const total = withPct.reduce((s, m) => s + m._pct, 0);

  // Rescale to 100% if total is off by more than 1%
  const normalized = total > 1 && Math.abs(total - 100) > 1
    ? withPct.map((m) => ({ ...m, _pct: Math.round((m._pct / total) * 1000) / 10 }))
    : withPct;

  // Fix rounding so sum is exactly 100
  const roundedTotal = normalized.reduce((s, m) => s + m._pct, 0);
  const diff = Math.round((100 - roundedTotal) * 10) / 10;
  if (diff !== 0 && normalized.length > 0) {
    normalized[normalized.length - 1]!._pct = Math.round((normalized[normalized.length - 1]!._pct + diff) * 10) / 10;
  }

  return normalized.map(({ _pct, ...m }) => ({
    ...m,
    percent: _pct,
    amount: totalEstimatedCost ? Math.round(totalEstimatedCost * _pct / 100) : m.amount,
  }));
}

export function mergeBlueprintResults(results: BlueprintAnalysis[]): BlueprintAnalysis {
  const taskKeys = new Set<string>();
  const boqDescs = new Map<string, BlueprintAnalysis["boqLineItems"][number]>();
  const tasks: BlueprintAnalysis["tasks"] = [];
  let projectSummary: string | undefined;
  let totalEstimatedCost: number | undefined;

  // Pick the result with the most milestones as the milestone source (best single engine)
  // rather than unioning all milestones from all engines (which causes 200% sum)
  const bestMilestoneSource = results.reduce((best, r) =>
    r.milestones.length > (best?.milestones.length ?? 0) ? r : best,
    results[0]!,
  );

  for (const r of results) {
    if (!projectSummary && r.projectSummary) projectSummary = r.projectSummary;
    if (!totalEstimatedCost && r.totalEstimatedCost) totalEstimatedCost = r.totalEstimatedCost;
    for (const t of r.tasks) {
      const k = normKey(t.name);
      if (!taskKeys.has(k)) { taskKeys.add(k); tasks.push(t); }
    }
    for (const b of r.boqLineItems) {
      const key = normKey(b.description);
      const existing = boqDescs.get(key);
      if (!existing || (b.confidence ?? 0) > (existing.confidence ?? 0)) boqDescs.set(key, b);
    }
  }

  const milestones = normalizeMilestones(bestMilestoneSource.milestones, totalEstimatedCost);

  return {
    tasks,
    milestones,
    boqLineItems: Array.from(boqDescs.values()),
    projectSummary,
    totalEstimatedCost,
    requiresReview: true,
  };
}

