import type { CashflowPoint, DashboardStats } from "@/components/os/useDashboardStats";

export type CashflowTrendPoint = {
  month: string;
  revenue: number;
  expenses: number;
};

export type CashflowViewData = {
  fetchedAt: string;
  overview: {
    revenue: number;
    expenses: number;
    netProfit: number;
    runwayMonths: number;
    upcomingPayables: number;
  };
  trend: CashflowTrendPoint[];
};

function isCashflowPoint(value: unknown): value is CashflowPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as CashflowPoint).name === "string"
  );
}

function trendFromStats(stats: DashboardStats): CashflowTrendPoint[] {
  const points = stats.cashflow.filter(isCashflowPoint);
  if (points.length > 0) {
    const monthlyRevenue =
      stats.totalRevenue > 0 ? Math.round(stats.totalRevenue / points.length) : 0;
    return points.map((p) => ({
      month: p.name,
      revenue: monthlyRevenue,
      expenses: p.actual ?? p.forecast ?? 0,
    }));
  }

  return stats.analytics.monthlyExpenses.map((row) => ({
    month: row.name,
    revenue: stats.totalRevenue > 0 ? Math.round(stats.totalRevenue / 2) : 0,
    expenses: row.value,
  }));
}

export function hasCashflowData(stats: DashboardStats): boolean {
  if (stats.totalRevenue > 0 || stats.totalExpenses > 0) return true;
  if (stats.pendingInvoices > 0) return true;
  return stats.cashflow.some((p) => {
    if (!isCashflowPoint(p)) return false;
    return (p.actual ?? 0) > 0 || (p.forecast ?? 0) > 0;
  });
}

export function mapDashboardStatsToCashflow(stats: DashboardStats): CashflowViewData {
  const trend = trendFromStats(stats);
  const thisMonthExpenses =
    stats.analytics.monthlyExpenses.find((row) => row.name === "החודש")?.value ??
    stats.analytics.monthlyExpenses.at(-1)?.value ??
    0;
  const netProfit = stats.totalRevenue - stats.totalExpenses;
  const runwayMonths =
    thisMonthExpenses > 0 && netProfit > 0
      ? Math.round((netProfit / thisMonthExpenses) * 10) / 10
      : 0;

  return {
    fetchedAt: new Date().toISOString(),
    overview: {
      revenue: stats.totalRevenue,
      expenses: stats.totalExpenses,
      netProfit,
      runwayMonths: Math.max(0, runwayMonths),
      upcomingPayables: thisMonthExpenses,
    },
    trend,
  };
}
