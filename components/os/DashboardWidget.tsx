"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import WindowBody from "@/components/os/layout/WindowBody";
import React, { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { Sparkles, TrendingUp, Activity, Download, FileText } from "lucide-react";
import { StatCard, ChartContainer, StatusBadge } from "@/components/os/widgets/shared/WidgetCard";
import { motion } from "framer-motion";
import { useDashboardStats } from "./useDashboardStats";
import { useFinanceReportExport } from "@/hooks/useFinanceReportExport";
import { intlLocaleForApp } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/config";
import type { WidgetType } from "@/hooks/use-window-manager";

type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
) => void;

type DashboardWidgetProps = {
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  /** Switch to cashflow tab when embedded in Finance Hub */
  onOpenCashflow?: () => void;
};

export default function DashboardWidget({
  openWorkspaceWidget,
  onOpenCashflow,
}: DashboardWidgetProps = {}) {
  const { dir, t, locale } = useI18n();
  const { theme } = useTheme();
  const { stats, loading, error, fetchDashboardStats } = useDashboardStats(t);
  const { exporting, exportCsv, exportPdf } = useFinanceReportExport({ t });

  const intlLocale = intlLocaleForApp(locale as AppLocale);
  const formatCurrency = useMemo(
    () => (num: number) =>
      new Intl.NumberFormat(intlLocale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(num),
    [intlLocale],
  );

  const pendingQuoteCount =
    stats.analytics.quoteStatus.find(
      (s) => s.name === "Pending" || s.name === "\u05DE\u05DE\u05EA\u05D9\u05DF",
    )?.value ?? 0;

  if (loading) return <WidgetState variant="loading" message={t("workspaceWidgets.dashboard.loading")} />;
  if (error) return (
    <WidgetState
      variant="error"
      message={error}
      onRetry={() => void fetchDashboardStats()}
      retryLabel={t("workspaceWidgets.dashboard.retry")}
    />
  );

  const netProfit = stats.totalRevenue - stats.totalExpenses;

  const openRevenue = () => openWorkspaceWidget?.("documentsHub", { tab: "create" });
  const openExpenses = () => openWorkspaceWidget?.("executiveHub", { tab: "officeExpenses" });
  const openNet = () => {
    if (onOpenCashflow) onOpenCashflow();
    else openWorkspaceWidget?.("financeHub", { tab: "cashflow" });
  };
  const openProjects = () => openWorkspaceWidget?.("projectsHub", null);

  return (
    <WindowBody
      role="region"
      aria-label={t("workspaceWidgets.quickActions.dashboard.title")}
      tabIndex={0}
      className="min-w-0 gap-4 p-3 text-[color:var(--foreground-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 md:gap-8 md:p-6"
      dir={dir}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting !== null}
          className="os-btn-secondary flex items-center gap-2 text-xs font-bold"
          aria-label={t("workspaceWidgets.dashboard.exportCsv")}
        >
          <Download size={16} aria-hidden />
          {t("workspaceWidgets.dashboard.exportCsv")}
        </button>
        <button
          type="button"
          onClick={() => void exportPdf()}
          disabled={exporting !== null}
          className="os-btn-secondary flex items-center gap-2 text-xs font-bold"
          aria-label={t("workspaceWidgets.dashboard.exportPdf")}
        >
          <FileText size={16} aria-hidden />
          {t("workspaceWidgets.dashboard.exportPdf")}
        </button>
      </div>

      {/* Top Stats Cards — click opens related window / tab */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("workspaceWidgets.dashboard.totalRevenue")}
          value={formatCurrency(stats.totalRevenue)}
          valueClassName="text-emerald-600 dark:text-emerald-400"
          detail={
            stats.breakdown
              ? t("workspaceWidgets.dashboard.revenueSourceDetail", {
                  count: String(stats.breakdown.issuedIncomeDocsCount),
                })
              : t("workspaceWidgets.dashboard.revenueSourceFallback")
          }
          onClick={openWorkspaceWidget ? openRevenue : undefined}
          onClickLabel={t("workspaceWidgets.dashboard.openRevenue")}
        />
        <StatCard
          title={t("workspaceWidgets.dashboard.totalExpenses")}
          value={formatCurrency(stats.totalExpenses)}
          valueClassName="text-rose-600 dark:text-rose-400"
          detail={
            stats.breakdown
              ? t("workspaceWidgets.dashboard.expensesSourceDetail", {
                  count: String(stats.breakdown.expenseRecordsCount),
                })
              : t("workspaceWidgets.dashboard.expensesSourceFallback")
          }
          onClick={openWorkspaceWidget ? openExpenses : undefined}
          onClickLabel={t("workspaceWidgets.dashboard.openExpenses")}
        />
        <StatCard
          title={t("workspaceWidgets.dashboard.netProfit")}
          value={formatCurrency(netProfit)}
          valueClassName={netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          detail={t("workspaceWidgets.dashboard.netSourceDetail")}
          onClick={openWorkspaceWidget || onOpenCashflow ? openNet : undefined}
          onClickLabel={t("workspaceWidgets.dashboard.openCashflow")}
        />
        <StatCard
          title={t("workspaceWidgets.dashboard.activeProjects")}
          value={stats.activeProjects}
          onClick={openWorkspaceWidget ? openProjects : undefined}
          onClickLabel={t("workspaceWidgets.dashboard.openProjects")}
        >
          <div className="mt-3">
            <StatusBadge variant="indigo">
              {t("workspaceWidgets.dashboard.pendingBadge", { count: String(stats.pendingInvoices) })}
            </StatusBadge>
          </div>
        </StatCard>
      </div>

      {stats.breakdown ? (
        <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 text-sm">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.dashboard.breakdownTitle")}
          </h3>
          <ul className="space-y-1.5 text-[color:var(--foreground-main)]">
            {stats.breakdown.revenueLines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span className="text-[color:var(--foreground-muted)]">{line.label}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(line.amount)}</span>
              </li>
            ))}
            {stats.breakdown.expenseLines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span className="text-[color:var(--foreground-muted)]">{line.label}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(line.amount)}</span>
              </li>
            ))}
            {(stats.breakdown.projectBudgetsTotal ?? 0) > 0 ? (
              <li className="flex justify-between gap-3 border-t border-[color:var(--border-main)] pt-1.5 text-xs text-[color:var(--foreground-muted)]">
                <span>{t("workspaceWidgets.dashboard.projectBudgetsNote")}</span>
                <span className="tabular-nums">{formatCurrency(stats.breakdown.projectBudgetsTotal)}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* AI Insight */}
      {stats.aiInsight && (
        <div className="flex flex-col sm:flex-row items-start gap-4 p-5 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <StatusBadge variant="green">AI Financial Intelligence</StatusBadge>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{stats.aiInsight}</p>
          </div>
        </div>
      )}

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartContainer
          title={<span className="flex items-center gap-2"><TrendingUp size={15} className="text-emerald-500 dark:text-emerald-400" />{t("workspaceWidgets.dashboard.monthlyExpensesTitle")}</span>}
          minHeight={192}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.analytics.monthlyExpenses}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff08" : "#00000008"} vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₪${v / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", fontSize: "12px" }}
                itemStyle={{ color: theme === "dark" ? "#e2e8f0" : "#0f172a" }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title={<span className="flex items-center gap-2"><Activity size={15} className="text-[color:var(--win-accent,#6366f1)] dark:text-indigo-400" />{t("workspaceWidgets.dashboard.quoteStatusTitle")}</span>}
          minHeight={192}
        >
          <div className="flex flex-col gap-4">
            {stats.analytics.quoteStatus.map((status) => (
              <div key={status.name} className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500 dark:text-slate-400">{status.name}</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    {t("workspaceWidgets.dashboard.documentsCount", { count: String(status.value) })}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(status.value / (stats.analytics.quoteStatus.reduce((a, b) => a + b.value, 0) || 1)) * 100}%` }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-2 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-center">
                {t("workspaceWidgets.dashboard.quoteInsight", { count: String(pendingQuoteCount) })}
              </p>
            </div>
          </div>
        </ChartContainer>
      </div>

      {/* Cashflow Chart — real monthly income vs expenses */}
      <ChartContainer
        title={<span className="flex items-center gap-2"><Activity className="w-4 h-4 text-[color:var(--win-accent,#6366f1)] dark:text-indigo-400" />{t("workspaceWidgets.dashboard.cashflowForecastTitle")}</span>}
        subtitle={t("workspaceWidgets.dashboard.cashflowSubtitle")}
        actionElement={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("workspaceWidgets.dashboard.incomeLabel")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("workspaceWidgets.dashboard.expenseLabel")}</span>
            </div>
          </div>
        }
        minHeight={256}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.cashflow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff08" : "#00000008"} vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `₪${value / 1000}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", fontSize: "12px" }}
              itemStyle={{ color: theme === "dark" ? "#e2e8f0" : "#0f172a" }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Bar dataKey="revenue" name={t("workspaceWidgets.dashboard.incomeLabel")} fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="expenses" name={t("workspaceWidgets.dashboard.expenseLabel")} fill="#fb7185" radius={[4, 4, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </WindowBody>
  );
}
