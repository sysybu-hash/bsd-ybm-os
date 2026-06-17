"use client";

import React from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { DashboardData, TabId } from "./types";
import {
  buildRecentActivity,
  computeOverallProgress,
  computeProjectDateRange,
  computeTaskStatusCounts,
  formatOverviewDate,
} from "./overview-metrics";
import { formatMoney } from "./utils";

type ProjectOverviewTabProps = {
  data: DashboardData;
  onNavigateTab?: (tab: TabId) => void;
};

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  footer?: React.ReactNode;
  icon: LucideIcon;
  iconWrapClassName: string;
  iconClassName: string;
  progress?: number;
};

function MetricCard({
  label,
  value,
  footer,
  icon: Icon,
  iconWrapClassName,
  iconClassName,
  progress,
}: MetricCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-window border border-border-main bg-surface-card p-5 shadow-window transition-all hover:shadow-window-focus">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-muted">{label}</p>
          <div className="mt-1 text-2xl font-bold text-foreground-main">{value}</div>
        </div>
        <div className={`shrink-0 rounded-lg p-2 ${iconWrapClassName}`}>
          <Icon className={`h-5 w-5 ${iconClassName}`} aria-hidden />
        </div>
      </div>
      {typeof progress === "number" ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
      {footer ? <div className="mt-2 text-sm text-foreground-muted">{footer}</div> : null}
    </div>
  );
}

export default function ProjectOverviewTab({ data, onNavigateTab }: ProjectOverviewTabProps) {
  const { t, locale } = useI18n();

  const taskCounts = computeTaskStatusCounts(data.tasks);
  const openTasks = taskCounts.todo + taskCounts.inProgress + taskCounts.review;
  const overallProgress = computeOverallProgress(data.tasks, data.budgetUtilizationPercent);
  const dateRange = computeProjectDateRange(data.tasks);
  const activity = buildRecentActivity(data, t, locale);
  const spent = data.financial.utilized;
  const budgetTotal = data.budget;

  return (
    <div className="min-h-full space-y-6 p-4 md:p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("projectDashboard.overview.progress")}
          value={`${overallProgress}%`}
          progress={overallProgress}
          icon={TrendingUp}
          iconWrapClassName="bg-blue-500/10"
          iconClassName="text-blue-500"
        />
        <MetricCard
          label={t("projectDashboard.overview.openTasks")}
          value={openTasks}
          footer={
            <span className="flex items-center">
              <CheckCircle2 className="h-4 w-4 pe-1 text-emerald-500" aria-hidden />
              {t("projectDashboard.overview.tasksDone", { count: String(taskCounts.done) })}
            </span>
          }
          icon={Clock}
          iconWrapClassName="bg-amber-500/10"
          iconClassName="text-amber-500"
        />
        <MetricCard
          label={t("projectDashboard.overview.budgetUsed")}
          value={formatMoney(spent)}
          footer={t("projectDashboard.overview.budgetTotal", { total: formatMoney(budgetTotal) })}
          icon={Wallet}
          iconWrapClassName="bg-emerald-500/10"
          iconClassName="text-emerald-500"
        />
        <MetricCard
          label={t("projectDashboard.overview.targetDate")}
          value={
            <span className="flex items-center text-lg font-bold sm:text-2xl">
              {formatOverviewDate(dateRange.end, locale)}
            </span>
          }
          footer={t("projectDashboard.overview.startDate", {
            date: formatOverviewDate(dateRange.start, locale),
          })}
          icon={Calendar}
          iconWrapClassName="bg-purple-500/10"
          iconClassName="text-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-window border border-border-main bg-surface-card shadow-window lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-border-main p-5">
            <h4 className="font-semibold text-foreground-main">
              {t("projectDashboard.overview.recentActivity")}
            </h4>
            {onNavigateTab ? (
              <button
                type="button"
                onClick={() => onNavigateTab("diary")}
                className="text-sm font-medium text-[color:var(--brand-accent)] transition-opacity hover:opacity-80"
              >
                {t("projectDashboard.overview.viewAll")}
              </button>
            ) : null}
          </div>
          <div className="p-5">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">
                {t("projectDashboard.overview.noActivity")}
              </p>
            ) : (
              <ul className="space-y-6">
                {activity.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.id} className="relative flex items-start gap-4">
                      <div
                        className={`z-10 mt-0.5 rounded-full p-2 ring-1 ring-border-main ${item.iconWrapClassName} ${item.iconClassName}`}
                      >
                        <ItemIcon className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground-main">{item.action}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                          <span className="flex items-center">
                            <Users className="h-3 w-3 pe-1" aria-hidden />
                            {item.meta}
                          </span>
                          {item.timeLabel !== "—" ? (
                            <>
                              <span aria-hidden>•</span>
                              <span>{item.timeLabel}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-window border border-border-main bg-surface-card shadow-window">
          <div className="border-b border-border-main p-5">
            <h4 className="font-semibold text-foreground-main">
              {t("projectDashboard.overview.projectDetails")}
            </h4>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("projectDashboard.overview.client")}
              </p>
              <p className="text-sm text-foreground-main">
                {data.client ?? t("projectDashboard.noClient")}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("projectDashboard.overview.status")}
              </p>
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {data.status}
              </span>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                {t("projectDashboard.overview.budgetUtilization")}
              </p>
              <p className="text-sm font-bold text-foreground-main">{data.budgetUtilizationPercent}%</p>
            </div>
            {data.financial.extrasPending > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {t("projectDashboard.overview.pendingExtras", {
                    amount: formatMoney(data.financial.extrasPending),
                  })}
                </p>
              </div>
            ) : null}
            {onNavigateTab ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigateTab("tasks")}
                  className="rounded-lg border border-border-main px-3 py-1.5 text-xs font-bold text-foreground-main transition-colors hover:bg-surface-soft"
                >
                  {t("projectDashboard.tabs.tasks")}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab("financial")}
                  className="rounded-lg border border-border-main px-3 py-1.5 text-xs font-bold text-foreground-main transition-colors hover:bg-surface-soft"
                >
                  {t("projectDashboard.tabs.financial")}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {data.attendanceLogs.length > 0 ? (
        <section className="rounded-window border border-border-main bg-surface-card p-5 shadow-window">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-foreground-muted" aria-hidden />
            <h4 className="font-semibold text-foreground-main">{t("projectDashboard.attendanceTitle")}</h4>
          </div>
          <p className="text-sm text-foreground-muted">
            {t("projectDashboard.overview.attendanceCount", { count: String(data.attendanceLogs.length) })}
          </p>
        </section>
      ) : null}
    </div>
  );
}
