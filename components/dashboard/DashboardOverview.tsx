"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  ScanLine,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Breakdown = {
  revenueLines?: { label: string; amount: number }[];
  expenseLines?: { label: string; amount: number }[];
  issuedIncomeDocsCount?: number;
  expenseRecordsCount?: number;
  projectBudgetsTotal?: number;
};

type Stats = {
  totalRevenue?: number;
  totalExpenses?: number;
  activeProjects?: number;
  totalClients?: number;
  pendingInvoices?: number;
  aiInsight?: string;
  breakdown?: Breakdown;
};

function shekel(n: number | undefined): string {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(v);
}

const ACTIONS: ReadonlyArray<{ id: string; icon: LucideIcon; labelKey: string }> = [
  { id: "scan", icon: ScanLine, labelKey: "workspaceWidgets.classicDashboard.overview.actionScan" },
  { id: "erp", icon: FileText, labelKey: "workspaceWidgets.classicDashboard.overview.actionDocument" },
  { id: "crm", icon: Users, labelKey: "workspaceWidgets.classicDashboard.overview.actionCrm" },
];

export default function DashboardOverview({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      setStats(res.ok ? ((await res.json()) as Stats) : {});
    } catch {
      setStats({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = stats?.pendingInvoices ?? 0;
  const projects = stats?.activeProjects ?? 0;
  const clients = stats?.totalClients ?? 0;
  const hasAny = projects > 0 || clients > 0 || pending > 0 || (stats?.totalRevenue ?? 0) > 0;
  const insight = typeof stats?.aiInsight === "string" ? stats.aiInsight.trim() : "";
  const showInsight =
    insight.length > 0 && !insight.includes("מנתחת נתונים") && !insight.toLowerCase().includes("analyzing");

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-[color:var(--classic-ink)] sm:text-3xl">
          {t("workspaceWidgets.classicDashboard.overview.greeting")}
        </h2>
        <p className="text-sm text-[color:var(--classic-muted)] sm:text-base">
          {t("workspaceWidgets.classicDashboard.overview.subtitle")}
        </p>
      </header>

      {loading ? (
        <div className="flex min-h-[120px] items-center justify-center text-[color:var(--classic-muted)]">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--classic-accent)]" aria-hidden />
        </div>
      ) : (
        <>
          {/* Status strip */}
          <section
            aria-label={t("workspaceWidgets.classicDashboard.overview.greeting")}
            className="border-y border-[color:var(--classic-rule)] py-5"
          >
            <div className="flex flex-wrap items-end gap-8 sm:gap-12">
              <div className="classic-fade-in">
                <p className="text-xs font-semibold text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.classicDashboard.overview.revenue")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[color:var(--classic-ink)] sm:text-3xl">
                  {shekel(stats?.totalRevenue)}
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.dashboard.revenueSourceDetail", {
                    count: String(stats?.breakdown?.issuedIncomeDocsCount ?? 0),
                  })}
                </p>
              </div>
              <div className="classic-fade-in" style={{ animationDelay: "60ms" }}>
                <p className="text-xs font-semibold text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.classicDashboard.overview.expenses")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[color:var(--classic-ink)] sm:text-3xl">
                  {shekel(stats?.totalExpenses)}
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.dashboard.expensesSourceDetail", {
                    count: String(stats?.breakdown?.expenseRecordsCount ?? 0),
                  })}
                </p>
              </div>
              <div className="classic-fade-in" style={{ animationDelay: "120ms" }}>
                <p className="text-xs font-semibold text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.classicDashboard.overview.activeProjects")}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-[color:var(--classic-ink)] sm:text-3xl">
                  {projects}
                </p>
              </div>
            </div>
            {stats?.breakdown?.revenueLines?.length || stats?.breakdown?.expenseLines?.length ? (
              <ul className="mt-4 space-y-1 border-t border-[color:var(--classic-rule)] pt-3 text-sm text-[color:var(--classic-muted)]">
                {(stats.breakdown.revenueLines ?? []).map((line) => (
                  <li key={line.label} className="flex justify-between gap-4">
                    <span>{line.label}</span>
                    <span className="tabular-nums text-[color:var(--classic-ink)]">{shekel(line.amount)}</span>
                  </li>
                ))}
                {(stats.breakdown.expenseLines ?? []).map((line) => (
                  <li key={line.label} className="flex justify-between gap-4">
                    <span>{line.label}</span>
                    <span className="tabular-nums text-[color:var(--classic-ink)]">{shekel(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 text-sm text-[color:var(--classic-muted)]">
              {hasAny
                ? t("workspaceWidgets.classicDashboard.overview.summary", {
                    projects: String(projects),
                    clients: String(clients),
                    pending: String(pending),
                  })
                : t("workspaceWidgets.classicDashboard.overview.summaryEmpty")}
            </p>
          </section>

          {/* Attention list */}
          <section>
            <h3 className="mb-3 text-base font-bold text-[color:var(--classic-ink)]">
              {t("workspaceWidgets.classicDashboard.overview.attentionTitle")}
            </h3>
            <ul className="divide-y divide-[color:var(--classic-rule)] border-y border-[color:var(--classic-rule)]">
              {pending > 0 ? (
                <li className="flex items-center justify-between gap-3 py-3">
                  <span className="text-sm text-[color:var(--classic-ink)]">
                    {t("workspaceWidgets.classicDashboard.overview.attentionPending", {
                      count: String(pending),
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("erp")}
                    className="shrink-0 text-sm font-semibold text-[color:var(--classic-accent)] underline-offset-2 hover:underline"
                  >
                    {t("workspaceWidgets.classicDashboard.overview.attentionGoInvoices")}
                  </button>
                </li>
              ) : null}
              {showInsight ? (
                <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[color:var(--classic-muted)]">
                      {t("workspaceWidgets.classicDashboard.overview.attentionInsight")}
                    </p>
                    <p className="mt-0.5 text-sm text-[color:var(--classic-ink)]">{insight}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("crm")}
                    className="shrink-0 self-start text-sm font-semibold text-[color:var(--classic-accent)] underline-offset-2 hover:underline"
                  >
                    {t("workspaceWidgets.classicDashboard.overview.attentionGoCrm")}
                  </button>
                </li>
              ) : null}
              {pending === 0 && !showInsight ? (
                <li className="py-3 text-sm text-[color:var(--classic-muted)]">
                  {t("workspaceWidgets.classicDashboard.overview.attentionEmpty")}
                </li>
              ) : null}
            </ul>
          </section>

          {/* Flat primary actions */}
          <section>
            <h3 className="mb-3 text-base font-bold text-[color:var(--classic-ink)]">
              {t("workspaceWidgets.classicDashboard.overview.quickActionsTitle")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map(({ id, icon: Icon, labelKey }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate?.(id)}
                  className="inline-flex items-center gap-2 border border-[color:var(--classic-rule)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[color:var(--classic-ink)] transition-colors hover:border-[color:var(--classic-accent)] hover:text-[color:var(--classic-accent)]"
                >
                  <Icon size={16} strokeWidth={2} aria-hidden />
                  {t(labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onNavigate?.("crm")}
                className="inline-flex items-center gap-2 border border-[color:var(--classic-rule)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[color:var(--classic-ink)] transition-colors hover:border-[color:var(--classic-accent)] hover:text-[color:var(--classic-accent)]"
              >
                <Users size={16} strokeWidth={2} aria-hidden />
                {t("workspaceWidgets.classicDashboard.overview.actionClients")}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
