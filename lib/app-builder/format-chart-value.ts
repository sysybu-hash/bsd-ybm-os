import type { ChartDataPoint } from "@/lib/app-builder/dashboard-allowlists";

/** עיגול ערכים לגרפים/מטריקות — מונע עשרוניים ארוכים מה-DB */
export function roundChartValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Number.isInteger(value) || Math.abs(value) >= 1000) {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

export function roundChartDataPoints(points: ChartDataPoint[]): ChartDataPoint[] {
  return points.map((p) => ({ ...p, value: roundChartValue(p.value) }));
}

export function formatMetricDisplayValue(
  value: number,
  locale: string,
  options?: { aggregation?: string; valueField?: string },
): string {
  const rounded = roundChartValue(value);
  const isCount = options?.aggregation === "count";
  const isIntegerLike = isCount || Number.isInteger(rounded);

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: isIntegerLike ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(rounded);
}
