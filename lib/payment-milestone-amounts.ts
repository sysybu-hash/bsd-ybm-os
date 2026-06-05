/** Milestone row with amount and optional explicit percent (0–100). */
export type MilestoneAmountRow = {
  amount: number;
  percent?: number | null;
};

/** Heuristic: blueprint AI often stores payment stages as 15+25+25+25+10 (=100). */
export function milestonesLookLikePercents(rows: MilestoneAmountRow[]): boolean {
  if (rows.length === 0) return false;
  const amounts = rows.map((r) => r.amount);
  const sum = amounts.reduce((s, a) => s + a, 0);
  if (Math.abs(sum - 100) > 0.01) return false;
  return amounts.every((a) => a >= 0 && a <= 100);
}

export function resolveMilestonePercent(row: MilestoneAmountRow, allRows?: MilestoneAmountRow[]): number | null {
  if (row.percent != null && Number.isFinite(row.percent) && row.percent >= 0 && row.percent <= 100) {
    return row.percent;
  }
  if (allRows && milestonesLookLikePercents(allRows)) {
    return row.amount;
  }
  if (row.amount > 0 && row.amount <= 100 && !Number.isInteger(row.amount * 100)) {
    return row.amount;
  }
  if (row.amount > 0 && row.amount <= 100) {
    const solo = [row];
    if (milestonesLookLikePercents(solo)) return row.amount;
  }
  return null;
}

export function resolveMilestoneIls(row: MilestoneAmountRow, budget: number, allRows?: MilestoneAmountRow[]): number {
  const pct = resolveMilestonePercent(row, allRows);
  if (pct != null && budget > 0) {
    return Math.round((budget * pct) / 100);
  }
  return row.amount;
}

export function formatMilestonePercent(pct: number): string {
  return `${pct % 1 === 0 ? pct : pct.toFixed(1)}%`;
}
