"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { StatCard, ChartContainer } from "@/components/os/widgets/shared/WidgetCard";
import { useDashboardStats } from "@/components/os/useDashboardStats";
import {
  hasCashflowData,
  mapDashboardStatsToCashflow,
  type CashflowTrendPoint,
} from "@/lib/workspace-api/map-cashflow-from-dashboard";
import { widgetScrollPaneClass } from "@/lib/workspace/widget-shell-layout";

const nis = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export default function CashflowWidget() {
  const { dir, t } = useI18n();
  const { stats, loading, error, fetchDashboardStats } = useDashboardStats(t);
  const cashflow = useMemo(
    () => (hasCashflowData(stats) ? mapDashboardStatsToCashflow(stats) : null),
    [stats],
  );
  const [selectedPoint, setSelectedPoint] = useState<CashflowTrendPoint | null>(null);
  const [isLivePulse, setIsLivePulse] = useState(false);

  useEffect(() => {
    if (!cashflow) {
      setSelectedPoint(null);
      return;
    }
    setSelectedPoint(cashflow.trend[cashflow.trend.length - 1] ?? null);
  }, [cashflow]);

  useEffect(() => {
    if (!cashflow?.fetchedAt) return;
    setIsLivePulse(true);
    const timer = window.setTimeout(() => setIsLivePulse(false), 1400);
    return () => window.clearTimeout(timer);
  }, [cashflow?.fetchedAt]);

  if (loading) {
    return <WidgetState variant="loading" message={t("workspaceWidgets.cashflowView.loading")} />;
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        message={error}
        onRetry={() => void fetchDashboardStats()}
        retryLabel={t("workspaceWidgets.cashflowView.retry")}
      />
    );
  }

  if (!cashflow || cashflow.trend.length === 0) {
    return (
      <WidgetState
        variant="empty"
        message={t("workspaceWidgets.cashflowView.emptyMessage")}
      />
    );
  }

  const maxTrendValue = Math.max(
    ...cashflow.trend.flatMap((item) => [item.revenue, item.expenses]),
    1,
  );
  const monthlyStats = [
    {
      label: t("workspaceWidgets.dashboard.totalRevenue"),
      value: nis.format(cashflow.overview.revenue),
      detail: stats.breakdown
        ? t("workspaceWidgets.dashboard.revenueSourceDetail", {
            count: String(stats.breakdown.issuedIncomeDocsCount),
          })
        : t("workspaceWidgets.cashflowView.revenueDetail"),
      valueClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: t("workspaceWidgets.dashboard.totalExpenses"),
      value: nis.format(cashflow.overview.expenses),
      detail: stats.breakdown
        ? t("workspaceWidgets.dashboard.expensesSourceDetail", {
            count: String(stats.breakdown.expenseRecordsCount),
          })
        : t("workspaceWidgets.cashflowView.expensesDetail"),
      valueClass: "text-rose-600 dark:text-rose-400",
    },
    {
      label: t("workspaceWidgets.dashboard.netProfit"),
      value: nis.format(cashflow.overview.netProfit),
      detail: t("workspaceWidgets.dashboard.netSourceDetail"),
      valueClass: "text-teal-600 dark:text-teal-400",
    },
  ];

  return (
    <div
      data-widget-sticky-chrome
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-emerald-600/60 dark:via-emerald-300/60 to-transparent" />

      <div className="relative shrink-0 border-b border-[color:var(--border-main)] p-3 pb-4 md:p-6 md:pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-200/70">
              {t("workspaceWidgets.cashflowView.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[color:var(--foreground-main)]">
              {t("workspaceWidgets.cashflowView.title")}
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-200">
            <span
              className={`h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-300 ${isLivePulse ? "animate-ping" : ""}`}
            />
            {t("workspaceWidgets.cashflowView.liveBadge")}
          </div>
        </div>
      </div>

      <div
        data-widget-scroll-pane
        className={`relative flex flex-col gap-5 p-3 md:p-6 ${widgetScrollPaneClass}`}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {monthlyStats.map((stat) => (
            <StatCard
              key={stat.label}
              title={stat.label}
              value={stat.value}
              detail={stat.detail}
              valueClassName={stat.valueClass}
            />
          ))}
        </div>

        <ChartContainer
          title={t("workspaceWidgets.cashflowView.chartTitle")}
          subtitle={t("workspaceWidgets.cashflowView.chartSubtitle")}
          actionElement={
            <div className="flex items-center gap-3" dir="ltr">
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                {t("workspaceWidgets.cashflowView.legendRevenue")}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full bg-rose-500 dark:bg-rose-400" />
                {t("workspaceWidgets.cashflowView.legendExpenses")}
              </span>
            </div>
          }
          minHeight={144}
        >
          <div className="min-w-0 overflow-x-auto pb-1">
            <div
              className="flex h-36 min-w-[300px] items-end justify-between gap-1.5 border-b border-slate-200 pb-3 sm:gap-3 dark:border-slate-700/50"
              dir="ltr"
            >
              {cashflow.trend.map((item) => {
                const isSelected = selectedPoint?.month === item.month;
                return (
                  <button
                    key={item.month}
                    type="button"
                    onClick={() => setSelectedPoint(item)}
                    className={`flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-xl px-1 transition-colors ${
                      isSelected
                        ? "bg-slate-100 dark:bg-slate-700/50"
                        : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    }`}
                  >
                    <div className="flex h-full w-full items-end justify-center gap-1.5">
                      <div
                        className="w-4 rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300"
                        style={{ height: `${(item.revenue / maxTrendValue) * 100}%` }}
                        title={`${item.month} ${t("workspaceWidgets.cashflowView.legendRevenue")}: ${nis.format(item.revenue)}`}
                      />
                      <div
                        className="w-4 rounded-t-lg bg-gradient-to-t from-rose-600 to-rose-400 dark:from-rose-500 dark:to-rose-300"
                        style={{ height: `${(item.expenses / maxTrendValue) * 100}%` }}
                        title={`${item.month} ${t("workspaceWidgets.cashflowView.legendExpenses")}: ${nis.format(item.expenses)}`}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.month}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-green-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-green-500/10">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("workspaceWidgets.cashflowView.runwayLabel")}
              </p>
              <p className="mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                {cashflow.overview.runwayMonths > 0
                  ? t("workspaceWidgets.cashflowView.runwayMonths", {
                      count: String(cashflow.overview.runwayMonths),
                    })
                  : t("workspaceWidgets.cashflowView.runwayUnknown")}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/60 dark:bg-red-500/10">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("workspaceWidgets.cashflowView.payablesLabel")}
              </p>
              <p className="mt-1 font-bold text-rose-700 dark:text-rose-400">
                {nis.format(cashflow.overview.upcomingPayables)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {selectedPoint?.month ?? t("workspaceWidgets.cashflowView.detailLabel")}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                {selectedPoint
                  ? t("workspaceWidgets.cashflowView.netMonth", {
                      amount: nis.format(selectedPoint.revenue - selectedPoint.expenses),
                    })
                  : t("workspaceWidgets.cashflowView.pickColumn")}
              </p>
            </div>
          </div>
        </ChartContainer>
      </div>
    </div>
  );
}
