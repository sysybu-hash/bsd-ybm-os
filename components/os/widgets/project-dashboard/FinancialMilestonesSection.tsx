"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { BUSINESS_PAYMENT_MILESTONE_PRESETS } from "@/lib/project-payment-milestones";
import type { DashboardData } from "./types";
import { formatMoney } from "./utils";

type Props = {
  data: DashboardData;
  apiBase: string;
  isCompanyMgmt: boolean;
  refresh: () => Promise<void>;
  t: (key: string, opts?: Record<string, string>) => string;
};

export function FinancialMilestonesSection({ data, apiBase, isCompanyMgmt, refresh, t }: Props) {
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold">
        {isCompanyMgmt ? t("projectDashboard.milestonesBusiness") : t("projectDashboard.milestones")}
      </h3>
      {isCompanyMgmt ? (
        <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
          {t("projectDashboard.milestonesBusinessHelp")}
        </p>
      ) : null}
      {(data.hiddenConstructionMilestones ?? 0) > 0 ? (
        <p className="mb-2 text-[10px] text-amber-400/90">
          {t("projectDashboard.milestonesHiddenConstruction", { count: String(data.hiddenConstructionMilestones ?? 0) })}
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
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: preset.name, amount: preset.amount, sortOrder: preset.sortOrder }),
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
          <li key={m.id} className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={m.isPaid}
                onChange={async () => {
                  await fetch(`${apiBase}/milestones`, {
                    method: "PATCH", credentials: "include",
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
          placeholder={isCompanyMgmt ? t("projectDashboard.milestoneNameBusiness") : t("projectDashboard.milestoneName")}
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
              method: "POST", credentials: "include",
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
  );
}
