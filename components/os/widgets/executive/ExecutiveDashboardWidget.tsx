"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, TrendingUp, Wallet, FileCheck } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import WindowBody from "@/components/os/layout/WindowBody";
import { StatCard } from "@/components/os/widgets/shared/WidgetCard";
import type { ExecutiveStatsResponse } from "@/lib/validation/schemas/executive";

export default function ExecutiveDashboardWidget() {
  const { dir, t } = useI18n();
  const [data, setData] = useState<ExecutiveStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/executive/stats", { credentials: "include" });
      const json = (await res.json()) as ExecutiveStatsResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("workspaceWidgets.executive.loadError"));
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.executive.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(num);

  if (loading) {
    return <WidgetState variant="loading" message={t("workspaceWidgets.executive.loading")} />;
  }
  if (error || !data) {
    return (
      <WidgetState
        variant="error"
        message={error ?? t("workspaceWidgets.executive.loadError")}
        onRetry={() => void load()}
        retryLabel={t("workspaceWidgets.dashboard.retry")}
      />
    );
  }

  return (
    <WindowBody
      role="region"
      aria-label={t("workspaceWidgets.executive.title")}
      tabIndex={0}
      className="min-w-0 gap-4 p-3 text-[color:var(--foreground-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 md:gap-6 md:p-6"
      dir={dir}
    >
      <div>
        <h2 className="text-lg font-bold text-[color:var(--foreground-main)] md:text-xl">
          {t("workspaceWidgets.executive.title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.executive.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title={t("workspaceWidgets.executive.netCashflow")}
          value={formatCurrency(data.netCashflow)}
          icon={Wallet}
          valueClassName={
            data.netCashflow >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }
        />
        <StatCard
          title={t("workspaceWidgets.executive.lateTasks")}
          value={String(data.lateTasks)}
          icon={AlertTriangle}
          valueClassName={data.lateTasks > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
        />
        <StatCard
          title={t("workspaceWidgets.executive.budgetAlerts")}
          value={String(data.budgetAlerts)}
          icon={TrendingUp}
          valueClassName={data.budgetAlerts > 0 ? "text-orange-600 dark:text-orange-400" : undefined}
        />
        <StatCard
          title={t("workspaceWidgets.executive.activeProjects")}
          value={String(data.activeProjects)}
          icon={Clock}
          valueClassName="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title={t("workspaceWidgets.executive.pendingBills")}
          value={String(data.pendingProgressBills)}
          icon={FileCheck}
          valueClassName={data.pendingProgressBills > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
      </div>
    </WindowBody>
  );
}
