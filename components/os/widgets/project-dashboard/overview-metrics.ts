import type { LucideIcon } from "lucide-react";
import { BookOpen, CheckCircle2, FileText, Wallet } from "lucide-react";
import type { DashboardData } from "./types";
import { formatDate } from "./utils";

export type TaskStatusCounts = {
  todo: number;
  inProgress: number;
  review: number;
  done: number;
};

export type OverviewActivityItem = {
  id: string;
  action: string;
  meta: string;
  sortAt: number;
  timeLabel: string;
  icon: LucideIcon;
  iconClassName: string;
  iconWrapClassName: string;
};

export function computeTaskStatusCounts(tasks: DashboardData["tasks"]): TaskStatusCounts {
  const counts: TaskStatusCounts = { todo: 0, inProgress: 0, review: 0, done: 0 };
  for (const task of tasks) {
    const status = task.status?.toUpperCase() ?? "TODO";
    if (status === "DONE") counts.done += 1;
    else if (status === "IN_PROGRESS") counts.inProgress += 1;
    else if (status === "REVIEW") counts.review += 1;
    else counts.todo += 1;
  }
  return counts;
}

export function computeOverallProgress(tasks: DashboardData["tasks"], budgetUtilizationPercent: number): number {
  if (tasks.length === 0) return budgetUtilizationPercent;
  const total = tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0);
  return Math.min(100, Math.round(total / tasks.length));
}

export function computeProjectDateRange(tasks: DashboardData["tasks"]): {
  start: string | null;
  end: string | null;
} {
  let startMs: number | null = null;
  let endMs: number | null = null;
  for (const task of tasks) {
    if (task.startDate) {
      const ms = new Date(task.startDate).getTime();
      if (!Number.isNaN(ms) && (startMs === null || ms < startMs)) startMs = ms;
    }
    if (task.endDate) {
      const ms = new Date(task.endDate).getTime();
      if (!Number.isNaN(ms) && (endMs === null || ms > endMs)) endMs = ms;
    }
  }
  return {
    start: startMs != null ? new Date(startMs).toISOString() : null,
    end: endMs != null ? new Date(endMs).toISOString() : null,
  };
}

function formatActivityTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const dayMs = 86_400_000;
  if (diffMs >= 0 && diffMs < dayMs) {
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const hours = Math.round(diffMs / 3_600_000);
      if (hours < 24) return rtf.format(-hours, "hour");
    } catch {
      /* fall through */
    }
  }
  return date.toLocaleDateString(locale === "he" ? "he-IL" : locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildRecentActivity(
  data: DashboardData,
  t: (key: string, vars?: Record<string, string>) => string,
  locale: string,
): OverviewActivityItem[] {
  const items: OverviewActivityItem[] = [];

  for (const diary of data.workDiaries) {
    const sortAt = new Date(diary.date).getTime();
    if (Number.isNaN(sortAt)) continue;
    items.push({
      id: `diary-${diary.id}`,
      action: diary.description.trim() || t("projectDashboard.overview.activityDiaryFallback"),
      meta: t("projectDashboard.overview.activityDiaryMeta", { progress: String(diary.progress) }),
      sortAt,
      timeLabel: formatActivityTime(diary.date, locale),
      icon: BookOpen,
      iconClassName: "text-blue-500",
      iconWrapClassName: "bg-blue-500/10",
    });
  }

  for (const milestone of data.milestones) {
    if (!milestone.isPaid || !milestone.datePaid) continue;
    const sortAt = new Date(milestone.datePaid).getTime();
    if (Number.isNaN(sortAt)) continue;
    items.push({
      id: `milestone-${milestone.id}`,
      action: t("projectDashboard.overview.activityMilestonePaid", { name: milestone.name }),
      meta: t("projectDashboard.overview.activityMilestoneMeta"),
      sortAt,
      timeLabel: formatActivityTime(milestone.datePaid, locale),
      icon: CheckCircle2,
      iconClassName: "text-emerald-500",
      iconWrapClassName: "bg-emerald-500/10",
    });
  }

  for (const extra of data.extras) {
    if (!extra.isApproved) continue;
    items.push({
      id: `extra-${extra.id}`,
      action: extra.description.trim() || t("projectDashboard.overview.activityExtraFallback"),
      meta: t("projectDashboard.overview.activityExtraMeta"),
      sortAt: 0,
      timeLabel: "—",
      icon: FileText,
      iconClassName: "text-amber-500",
      iconWrapClassName: "bg-amber-500/10",
    });
  }

  for (const expense of data.expenseRecords.slice(0, 10)) {
    if (!expense.date) continue;
    const sortAt = new Date(expense.date).getTime();
    if (Number.isNaN(sortAt)) continue;
    items.push({
      id: `expense-${expense.id}`,
      action: t("projectDashboard.overview.activityExpense", {
        vendor: expense.vendor?.trim() || t("projectDashboard.overview.activityExpenseUnknown"),
      }),
      meta: t("projectDashboard.overview.activityExpenseMeta"),
      sortAt,
      timeLabel: formatActivityTime(expense.date, locale),
      icon: Wallet,
      iconClassName: "text-orange-500",
      iconWrapClassName: "bg-orange-500/10",
    });
  }

  return items
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 6);
}

export function formatOverviewDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale === "he" ? "he-IL" : locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export { formatDate };
