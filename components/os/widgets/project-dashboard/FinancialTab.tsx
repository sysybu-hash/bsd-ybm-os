"use client";

import React from "react";
import ProjectBoqPanel from "@/components/os/widgets/project/ProjectBoqPanel";
import type { DashboardData } from "./types";
import { formatMoney } from "./utils";
import { FinancialMilestonesSection } from "./FinancialMilestonesSection";
import { FinancialExtrasSection } from "./FinancialExtrasSection";
import { FinancialPlannedExpensesSection } from "./FinancialPlannedExpensesSection";
import { FinancialKanbanBudgetSummary } from "./FinancialKanbanBudgetSummary";

type FinancialTabProps = {
  data: DashboardData;
  apiBase: string;
  isCompanyMgmt: boolean;
  refresh: () => Promise<void>;
  t: (key: string, opts?: Record<string, string>) => string;
};

export function FinancialTab({ data, apiBase, isCompanyMgmt, refresh, t }: FinancialTabProps) {
  const milestonesSection = (
    <FinancialMilestonesSection data={data} apiBase={apiBase} isCompanyMgmt={isCompanyMgmt} refresh={refresh} t={t} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <FinancialKanbanBudgetSummary
        projectId={data.id}
        totalProjectBudget={data.budget}
        actualExpenses={data.financial.erpExpenses}
        t={t}
      />

      {!isCompanyMgmt ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.financialBoqTitle")}</h3>
          <ProjectBoqPanel projectId={data.id} apiBase={apiBase} milestonesSection={milestonesSection} />
        </section>
      ) : null}

      {/* Budget utilization */}
      <section>
        <p className="mb-1 text-xs text-[color:var(--foreground-muted)]">
          {t("projectDashboard.budgetUtilization")} ({data.budgetUtilizationPercent}%)
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-elevated)]">
          <div className="h-full bg-emerald-500" style={{ width: `${data.budgetUtilizationPercent}%` }} />
        </div>
        <p className="mt-1 text-xs">
          {formatMoney(data.financial.utilized)} / {formatMoney(data.budget)}
        </p>
      </section>

      {isCompanyMgmt ? milestonesSection : null}

      <FinancialExtrasSection data={data} apiBase={apiBase} refresh={refresh} t={t} />

      {/* ERP Expenses */}
      <section>
        <h3 className="mb-1 text-xs font-semibold">{t("projectDashboard.erpExpenses")}</h3>
        <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
          {t("projectDashboard.erpVsPlannedHelp")}
        </p>
        <ul className="space-y-1 text-xs">
          {(data.expenseRecords ?? []).map((e) => (
            <li key={e.id} className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1">
              <span>{e.vendor ?? "—"} · {e.date ? new Date(e.date).toLocaleDateString("he-IL") : "—"}</span>
              <span>{formatMoney(e.amount)}</span>
            </li>
          ))}
          {(data.expenseRecords ?? []).length === 0 && (
            <li className="text-[color:var(--foreground-muted)]">{t("projectDashboard.noErpExpenses")}</li>
          )}
        </ul>
      </section>

      <FinancialPlannedExpensesSection data={data} apiBase={apiBase} refresh={refresh} t={t} />
    </div>
  );
}
