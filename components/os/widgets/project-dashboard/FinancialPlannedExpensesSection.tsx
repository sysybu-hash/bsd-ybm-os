"use client";

import React, { useState } from "react";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { DashboardData } from "./types";
import { formatMoney } from "./utils";

type Props = {
  data: DashboardData;
  apiBase: string;
  refresh: () => Promise<void>;
  t: (key: string) => string;
};

export function FinancialPlannedExpensesSection({ data, apiBase, refresh, t }: Props) {
  const [expMonth, setExpMonth] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expAmount, setExpAmount] = useState("");

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold">{t("projectDashboard.plannedExpenses")}</h3>
      <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
        {t("projectDashboard.plannedExpensesHelp")}
      </p>
      <ul className="space-y-1 text-xs">
        {data.projectExpenses.map((e) => (
          <li key={e.id} className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1">
            <span>{e.month} · {e.category}</span>
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
          className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-2 py-1 text-xs text-white"
          onClick={async () => {
            if (!expMonth || !expCategory || !expAmount) return;
            await fetch(`${apiBase}/expenses`, {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ month: expMonth, category: expCategory, amount: Number(expAmount) }),
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
  );
}
