"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Receipt, TrendingUp, Wallet } from "lucide-react";
import { useProjectSync } from "@/lib/events/project-sync";
import { createLogger } from "@/lib/logger";
import { formatMoney } from "./utils";

const log = createLogger("financial-kanban-summary");

type TaskBudgetRow = {
  budget?: number;
  metadata?: { budget?: number };
};

type Props = {
  projectId: string;
  totalProjectBudget: number;
  actualExpenses: number;
  t: (key: string, opts?: Record<string, string>) => string;
};

export function FinancialKanbanBudgetSummary({
  projectId,
  totalProjectBudget,
  actualExpenses,
  t,
}: Props) {
  const [allocatedInTasks, setAllocatedInTasks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFinancialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
        credentials: "include",
      });
      const data = (await res.json()) as { tasks?: TaskBudgetRow[] };
      let taskBudgetSum = 0;
      for (const task of data.tasks ?? []) {
        const fromMeta = task.metadata?.budget;
        const raw =
          typeof task.budget === "number"
            ? task.budget
            : typeof fromMeta === "number"
              ? fromMeta
              : 0;
        if (!Number.isNaN(raw) && raw > 0) taskBudgetSum += raw;
      }
      setAllocatedInTasks(taskBudgetSum);
    } catch (err: unknown) {
      log.error("fetch_kanban_budgets_failed", {
        message: err instanceof Error ? err.message : String(err),
        projectId,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchFinancialData();
  }, [fetchFinancialData]);

  useProjectSync(projectId, () => {
    void fetchFinancialData();
  });

  if (isLoading) {
    return (
      <p className="py-6 text-center text-sm text-foreground-muted">
        {t("projectDashboard.financialKanban.loading")}
      </p>
    );
  }

  const remainingBudget = totalProjectBudget - allocatedInTasks;
  const isOverBudget = totalProjectBudget > 0 && allocatedInTasks > totalProjectBudget;
  const expensePct =
    totalProjectBudget > 0
      ? Math.min((actualExpenses / totalProjectBudget) * 100, 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground-main">
          {t("projectDashboard.financialKanban.title")}
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {t("projectDashboard.financialKanban.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-window border border-border-main bg-surface-card p-5 shadow-window">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground-muted">
                {t("projectDashboard.financialKanban.approvedBudget")}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-foreground-main">
                {formatMoney(totalProjectBudget)}
              </h3>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Wallet className="h-5 w-5 text-blue-500" aria-hidden />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-window border border-border-main bg-surface-card p-5 shadow-window">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground-muted">
                {t("projectDashboard.financialKanban.allocatedInTasks")}
              </p>
              <h3
                className={`mt-1 text-2xl font-bold ${isOverBudget ? "text-red-500" : "text-foreground-main"}`}
              >
                {formatMoney(allocatedInTasks)}
              </h3>
            </div>
            <div className="rounded-lg bg-purple-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-purple-500" aria-hidden />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-muted">
              {t("projectDashboard.financialKanban.remainingToAllocate")}
            </span>
            <span className={`font-medium ${isOverBudget ? "text-red-500" : "text-emerald-500"}`}>
              {formatMoney(remainingBudget)}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-window border border-border-main bg-surface-card p-5 shadow-window">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground-muted">
                {t("projectDashboard.financialKanban.actualExpenses")}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-foreground-main">
                {formatMoney(actualExpenses)}
              </h3>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Receipt className="h-5 w-5 text-emerald-500" aria-hidden />
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${expensePct}%` }}
            />
          </div>
        </div>
      </div>

      {isOverBudget ? (
        <div className="flex items-start gap-3 rounded-md border border-red-500/20 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />
          <div>
            <h4 className="text-sm font-bold text-red-600 dark:text-red-400">
              {t("projectDashboard.financialKanban.overBudgetTitle")}
            </h4>
            <p className="mt-1 text-sm text-red-500">
              {t("projectDashboard.financialKanban.overBudgetDesc")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
