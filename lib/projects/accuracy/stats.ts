/**
 * Deviation statistics shared by every accuracy check: a list of distances
 * (metres or pixels) summarised the same way everywhere, so a booklet can
 * print one table.
 */

export type DeviationStats = {
  n: number;
  median: number;
  p90: number;
  max: number;
  /** Share of samples within the "close" bound (green). */
  withinClose: number;
  /** Share of samples beyond the "far" bound (red). */
  beyondFar: number;
};

/** Bounds in the samples' own unit. The factory overlay used 0.15 m / 0.35 m. */
export type Bounds = { close: number; far: number };

export const SHEET_BOUNDS_M: Bounds = { close: 0.15, far: 0.35 };

function quantile(sorted: number[], f: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) * f)]!;
}

export function deviationStats(values: number[], bounds: Bounds): DeviationStats {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return {
    n,
    median: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    max: n ? s[n - 1]! : 0,
    withinClose: n ? s.filter((v) => v <= bounds.close).length / n : 0,
    beyondFar: n ? s.filter((v) => v > bounds.far).length / n : 0,
  };
}
