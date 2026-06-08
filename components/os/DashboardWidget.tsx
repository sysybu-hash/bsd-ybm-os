"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import WindowBody from "@/components/os/layout/WindowBody";
import React from "react";
import { useTheme } from "next-themes";
import {
  AreaChart,
  Area,
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

export default function DashboardWidget() {
  const { dir, t } = useI18n();
  const { theme } = useTheme();
  const { stats, loading, error, fetchDashboardStats } = useDashboardStats(t);
  const { exporting, exportCsv, exportPdf } = useFinanceReportExport({ t });

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
  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(num);

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

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("workspaceWidgets.dashboard.totalRevenue")} value={formatCurrency(stats.totalRevenue)} valueClassName="text-emerald-600 dark:text-emerald-400" />
        <StatCard title={t("workspaceWidgets.dashboard.totalExpenses")} value={formatCurrency(stats.totalExpenses)} valueClassName="text-rose-600 dark:text-rose-400" />
        <StatCard
          title={t("workspaceWidgets.dashboard.netProfit")}
          value={formatCurrency(netProfit)}
          valueClassName={netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
        />
        <StatCard title={t("workspaceWidgets.dashboard.activeProjects")} value={stats.activeProjects}>
          <div className="mt-3">
            <StatusBadge variant="indigo">{stats.pendingInvoices} בטיפול</StatusBadge>
          </div>
        </StatCard>
      </div>

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
          title={<span className="flex items-center gap-2"><TrendingUp size={15} className="text-emerald-500 dark:text-emerald-400" />סיכום הוצאות חודשי</span>}
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
          title={<span className="flex items-center gap-2"><Activity size={15} className="text-indigo-500 dark:text-indigo-400" />סטטוס הצעות מחיר</span>}
          minHeight={192}
        >
          <div className="flex flex-col gap-4">
            {stats.analytics.quoteStatus.map((status) => (
              <div key={status.name} className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500 dark:text-slate-400">{status.name}</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">{status.value} מסמכים</span>
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
                המערכת מזהה {stats.analytics.quoteStatus.find((s) => s.name === "ממתין")?.value ?? 0} הצעות מחיר שטרם נחתמו. מומלץ לשלוח תזכורת אוטומטית.
              </p>
            </div>
          </div>
        </ChartContainer>
      </div>

      {/* Cashflow Chart */}
      <ChartContainer
        title={<span className="flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />תחזית תזרים מזומנים חכמה</span>}
        subtitle="ניתוח היסטורי + תחזית רבעונית קדימה"
        actionElement={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ביצוע בפועל</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-300 border border-dashed border-indigo-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">תחזית AI</span>
            </div>
          </div>
        }
        minHeight={256}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.cashflow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff08" : "#00000008"} vertical={false} />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `₪${value / 1000}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: theme === "dark" ? "#1e293b" : "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", fontSize: "12px" }}
              itemStyle={{ color: theme === "dark" ? "#e2e8f0" : "#0f172a" }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" strokeLinecap="round" connectNulls />
            <Area type="monotone" dataKey="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorForecast)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </WindowBody>
  );
}
