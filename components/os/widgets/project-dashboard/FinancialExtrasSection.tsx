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

export function FinancialExtrasSection({ data, apiBase, refresh, t }: Props) {
  const [extraDesc, setExtraDesc] = useState("");
  const [extraCost, setExtraCost] = useState("");

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.extras")}</h3>
      <ul className="space-y-1 text-xs">
        {data.extras.map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1">
            <span>{e.description}</span>
            <div className="flex items-center gap-2">
              <span>{formatMoney(e.cost)}</span>
              <button
                type="button"
                className="text-amber-400 underline"
                onClick={async () => {
                  await fetch(`${apiBase}/extras`, {
                    method: "PATCH", credentials: "include",
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
              method: "POST", credentials: "include",
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
  );
}
