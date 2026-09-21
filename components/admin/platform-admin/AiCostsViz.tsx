"use client";

import React from "react";
import type { AdminVizCostSummary } from "@/lib/projects/floorplan-viz-costs";
import { formatIlsIn, formatMoney, type CostCurrency, type CostRate } from "./ai-costs-format";

type Tc = (suffix: string, params?: Record<string, string>) => string;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border-main)] p-3">
      <p className="text-[11px] text-[color:var(--foreground-muted)]">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-[color:var(--foreground-muted)]">{hint}</p> : null}
    </div>
  );
}

/** What each booklet cost to make, against the tariff it sells at. */
export function AiCostsViz({
  viz,
  currency,
  rate,
  tc,
}: {
  viz: AdminVizCostSummary;
  currency: CostCurrency;
  rate: CostRate;
  tc: Tc;
}) {
  const money = (usd: number) => formatMoney(usd, currency, rate);
  const ils = (value: number) => formatIlsIn(value, currency, rate);

  return (
    <section className="space-y-3" aria-label={tc("vizTitle")}>
      <h3 className="text-sm font-bold">{tc("vizTitle")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tc("cost")} value={money(viz.usd)} />
        <Stat label={tc("revenue")} value={ils(viz.revenueIls)} hint={tc("revenueHint")} />
        <Stat
          label={tc("margin")}
          value={viz.marginIls != null ? ils(viz.marginIls) : "—"}
          hint={
            viz.marginIls != null && viz.measuredRevenueIls > 0
              ? tc("marginPct", { pct: String(Math.round((viz.marginIls / viz.measuredRevenueIls) * 100)) })
              : tc("noRate")
          }
        />
        <Stat
          label={tc("runs")}
          value={String(viz.runs.length)}
          hint={viz.averageUsdPerRun != null ? tc("average", { amount: money(viz.averageUsdPerRun) }) : undefined}
        />
      </div>

      {viz.unmeasuredRuns > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {tc("unmeasured", { count: String(viz.unmeasuredRuns) })}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
        <table className="w-full text-start text-xs tabular-nums">
          <thead className="text-[color:var(--foreground-muted)]">
            <tr>
              <th className="px-2 py-1.5 text-start font-semibold">{tc("colDate")}</th>
              <th className="px-2 py-1.5 text-start font-semibold">{tc("colOrg")}</th>
              <th className="px-2 py-1.5 text-start font-semibold">{tc("colTitle")}</th>
              <th className="px-2 py-1.5 text-start font-semibold">{tc("colBooklet")}</th>
              <th className="px-2 py-1.5 text-end font-semibold">{tc("colCalls")}</th>
              <th className="px-2 py-1.5 text-end font-semibold">{tc("colCost")}</th>
              <th className="px-2 py-1.5 text-end font-semibold">{tc("colPrice")}</th>
              <th className="px-2 py-1.5 text-end font-semibold">{tc("colMargin")}</th>
            </tr>
          </thead>
          <tbody>
            {viz.runs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-[color:var(--foreground-muted)]">
                  {tc("empty")}
                </td>
              </tr>
            ) : (
              viz.runs.map((run) => (
                <tr key={run.runId} className="border-t border-[color:var(--border-main)]">
                  <td className="px-2 py-1.5">{new Date(run.createdAt).toLocaleDateString("he-IL")}</td>
                  <td className="px-2 py-1.5">{run.organizationName}</td>
                  <td className="px-2 py-1.5">{run.title}</td>
                  <td className="px-2 py-1.5">{run.scope === "overview" ? tc("bookletOne") : tc("bookletFull")}</td>
                  <td className="px-2 py-1.5 text-end">
                    {tc("calls", {
                      images: String(run.imageCalls),
                      audits: String(run.auditCalls),
                      extracts: String(run.extractCalls),
                    })}
                  </td>
                  <td className="px-2 py-1.5 text-end">{run.usd != null ? money(run.usd) : tc("notMeasured")}</td>
                  <td className="px-2 py-1.5 text-end">{ils(run.revenueIls)}</td>
                  <td className="px-2 py-1.5 text-end">{run.marginIls != null ? ils(run.marginIls) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
