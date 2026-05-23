"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import ProjectBoqPanel from "@/components/os/widgets/project/ProjectBoqPanel";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { BUSINESS_PAYMENT_MILESTONE_PRESETS } from "@/lib/project-payment-milestones";
import type { DashboardData } from "./types";
import { formatMoney } from "./utils";

type FinancialTabProps = {
  data: DashboardData;
  apiBase: string;
  isCompanyMgmt: boolean;
  refresh: () => Promise<void>;
  t: (key: string, opts?: Record<string, string>) => string;
};

export function FinancialTab({ data, apiBase, isCompanyMgmt, refresh, t }: FinancialTabProps) {
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraCost, setExtraCost] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expAmount, setExpAmount] = useState("");

  return (
    <div className="space-y-4">
      {!isCompanyMgmt ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.financialBoqTitle")}</h3>
          <ProjectBoqPanel projectId={data.id} apiBase={apiBase} />
        </section>
      ) : null}

      {/* Budget utilization */}
      <section>
        <p className="mb-1 text-xs text-[color:var(--foreground-muted)]">
          {t("projectDashboard.budgetUtilization")} ({data.budgetUtilizationPercent}%)
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-elevated)]">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${data.budgetUtilizationPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs">
          {formatMoney(data.financial.utilized)} / {formatMoney(data.budget)}
        </p>
      </section>

      {/* Milestones */}
      <section>
        <h3 className="mb-2 text-xs font-semibold">
          {isCompanyMgmt
            ? t("projectDashboard.milestonesBusiness")
            : t("projectDashboard.milestones")}
        </h3>
        {isCompanyMgmt ? (
          <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
            {t("projectDashboard.milestonesBusinessHelp")}
          </p>
        ) : null}
        {(data.hiddenConstructionMilestones ?? 0) > 0 ? (
          <p className="mb-2 text-[10px] text-amber-400/90">
            {t("projectDashboard.milestonesHiddenConstruction", {
              count: String(data.hiddenConstructionMilestones ?? 0),
            })}
          </p>
        ) : null}
        {isCompanyMgmt && data.milestones.length === 0 ? (
          <div className="mb-2 rounded-lg border border-dashed border-[color:var(--border-main)] p-3 text-xs text-[color:var(--foreground-muted)]">
            <p>{t("projectDashboard.milestonesEmptyBusiness")}</p>
            <button
              type="button"
              className="mt-2 rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
              onClick={async () => {
                const existing = new Set(data.milestones.map((m) => m.name.trim()));
                for (const preset of BUSINESS_PAYMENT_MILESTONE_PRESETS) {
                  if (existing.has(preset.name)) continue;
                  await fetch(`${apiBase}/milestones`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: preset.name,
                      amount: preset.amount,
                      sortOrder: preset.sortOrder,
                    }),
                  });
                }
                await refresh();
                toast.success(t("projectDashboard.milestonesBusinessApplied"));
              }}
            >
              {t("projectDashboard.applyBusinessMilestones")}
            </button>
          </div>
        ) : null}
        <ul className="space-y-1 text-xs">
          {data.milestones.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1"
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.isPaid}
                  onChange={async () => {
                    await fetch(`${apiBase}/milestones`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: m.id, isPaid: !m.isPaid }),
                    });
                    await refresh();
                  }}
                />
                <span>{m.name}</span>
              </label>
              <span>{formatMoney(m.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={osFieldClassName}
            placeholder={
              isCompanyMgmt
                ? t("projectDashboard.milestoneNameBusiness")
                : t("projectDashboard.milestoneName")
            }
            value={milestoneName}
            onChange={(e) => setMilestoneName(e.target.value)}
          />
          <input
            className={osFieldClassName}
            type="number"
            placeholder={t("projectDashboard.amount")}
            value={milestoneAmount}
            onChange={(e) => setMilestoneAmount(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
            onClick={async () => {
              if (!milestoneName || !milestoneAmount) return;
              await fetch(`${apiBase}/milestones`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: milestoneName, amount: Number(milestoneAmount) }),
              });
              setMilestoneName("");
              setMilestoneAmount("");
              await refresh();
            }}
          >
            <Plus size={14} className="inline" /> {t("projectDashboard.add")}
          </button>
        </div>
      </section>

      {/* Extras */}
      <section>
        <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.extras")}</h3>
        <ul className="space-y-1 text-xs">
          {data.extras.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1"
            >
              <span>{e.description}</span>
              <div className="flex items-center gap-2">
                <span>{formatMoney(e.cost)}</span>
                <button
                  type="button"
                  className="text-amber-400 underline"
                  onClick={async () => {
                    await fetch(`${apiBase}/extras`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: e.id, isApproved: !e.isApproved }),
                    });
                    await refresh();
                  }}
                >
                  {e.isApproved ? t("projectDashboard.approved") : t("projectDashboard.approve")}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={osFieldClassName}
            placeholder={t("projectDashboard.extraDesc")}
            value={extraDesc}
            onChange={(e) => setExtraDesc(e.target.value)}
          />
          <input
            className={osFieldClassName}
            type="number"
            placeholder={t("projectDashboard.amount")}
            value={extraCost}
            onChange={(e) => setExtraCost(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
            onClick={async () => {
              if (!extraDesc || !extraCost) return;
              await fetch(`${apiBase}/extras`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: extraDesc, cost: Number(extraCost) }),
              });
              setExtraDesc("");
              setExtraCost("");
              await refresh();
            }}
          >
            {t("projectDashboard.add")}
          </button>
        </div>
      </section>

      {/* ERP Expenses */}
      <section>
        <h3 className="mb-1 text-xs font-semibold">{t("projectDashboard.erpExpenses")}</h3>
        <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
          {t("projectDashboard.erpVsPlannedHelp")}
        </p>
        <ul className="space-y-1 text-xs">
          {(data.expenseRecords ?? []).map((e) => (
            <li
              key={e.id}
              className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1"
            >
              <span>
                {e.vendor ?? "—"} · {e.date ? new Date(e.date).toLocaleDateString("he-IL") : "—"}
              </span>
              <span>{formatMoney(e.amount)}</span>
            </li>
          ))}
          {(data.expenseRecords ?? []).length === 0 && (
            <li className="text-[color:var(--foreground-muted)]">
              {t("projectDashboard.noErpExpenses")}
            </li>
          )}
        </ul>
      </section>

      {/* Planned Expenses */}
      <section>
        <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.plannedExpenses")}</h3>
        <ul className="space-y-1 text-xs">
          {data.projectExpenses.map((e) => (
            <li
              key={e.id}
              className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1"
            >
              <span>
                {e.month} · {e.category}
              </span>
              <span>{formatMoney(e.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={osFieldClassName}
            placeholder="YYYY-MM"
            value={expMonth}
            onChange={(e) => setExpMonth(e.target.value)}
          />
          <input
            className={osFieldClassName}
            placeholder={t("projectDashboard.category")}
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
          />
          <input
            className={osFieldClassName}
            type="number"
            placeholder={t("projectDashboard.amount")}
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
            onClick={async () => {
              if (!expMonth || !expCategory || !expAmount) return;
              await fetch(`${apiBase}/expenses`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  month: expMonth,
                  category: expCategory,
                  amount: Number(expAmount),
                }),
              });
              setExpMonth("");
              setExpCategory("");
              setExpAmount("");
              await refresh();
            }}
          >
            {t("projectDashboard.add")}
          </button>
        </div>
      </section>
    </div>
  );
}

// toast imported lazily to avoid SSR issues
import { toast } from "sonner";
