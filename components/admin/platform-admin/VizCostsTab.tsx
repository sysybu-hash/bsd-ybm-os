"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { AdminVizCostSummary } from "@/lib/projects/floorplan-viz-costs";

function usd(value: number): string {
  return `$${value < 10 ? value.toFixed(3) : value.toFixed(2)}`;
}

function ils(value: number): string {
  return `₪${value.toLocaleString("he-IL", { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border-main)] p-3">
      <p className="text-[11px] text-[color:var(--foreground-muted)]">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-[color:var(--foreground-muted)]">{hint}</p> : null}
    </div>
  );
}

/**
 * What the visualisations cost to make, against what they sell for.
 * Platform admin only — the customer-facing widget carries no cost at all.
 */
export function VizCostsTab() {
  const { t } = useI18n();
  const tc = useCallback(
    (suffix: string, params?: Record<string, string>) => t(`platformAdmin.vizCosts.${suffix}`, params),
    [t],
  );
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<AdminVizCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/viz-costs?month=${encodeURIComponent(month)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as AdminVizCostSummary & { error?: string };
      if (!res.ok) throw new Error(json.error || tc("loadFailed"));
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tc("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [month, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4" aria-label={tc("title")}>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Coins size={18} aria-hidden />
          {tc("title")}
        </h2>
        <label className="flex items-center gap-2 text-xs">
          {tc("month")}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
            className={osFieldClassName}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          {tc("refresh")}
        </button>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label={tc("cost")}
              value={usd(data.usd)}
              hint={data.costIls != null ? ils(data.costIls) : tc("noRate")}
            />
            <Stat label={tc("revenue")} value={ils(data.revenueIls)} hint={tc("revenueHint")} />
            <Stat
              label={tc("margin")}
              value={data.marginIls != null ? ils(data.marginIls) : "—"}
              hint={
                data.marginIls != null && data.measuredRevenueIls > 0
                  ? tc("marginPct", {
                      pct: String(Math.round((data.marginIls / data.measuredRevenueIls) * 100)),
                    })
                  : undefined
              }
            />
            <Stat
              label={tc("runs")}
              value={String(data.runs.length)}
              hint={
                data.averageUsdPerRun != null ? tc("average", { usd: usd(data.averageUsdPerRun) }) : undefined
              }
            />
          </div>

          {data.unmeasuredRuns > 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {tc("unmeasured", { count: String(data.unmeasuredRuns) })}
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
                {data.runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-[color:var(--foreground-muted)]">
                      {tc("empty")}
                    </td>
                  </tr>
                ) : (
                  data.runs.map((run) => (
                    <tr key={run.runId} className="border-t border-[color:var(--border-main)]">
                      <td className="px-2 py-1.5">{new Date(run.createdAt).toLocaleDateString("he-IL")}</td>
                      <td className="px-2 py-1.5">{run.organizationName}</td>
                      <td className="px-2 py-1.5">{run.title}</td>
                      <td className="px-2 py-1.5">
                        {run.scope === "overview" ? tc("bookletOne") : tc("bookletFull")}
                      </td>
                      <td className="px-2 py-1.5 text-end">
                        {tc("calls", {
                          images: String(run.imageCalls),
                          audits: String(run.auditCalls),
                          extracts: String(run.extractCalls),
                        })}
                      </td>
                      <td className="px-2 py-1.5 text-end">{run.usd != null ? usd(run.usd) : tc("notMeasured")}</td>
                      <td className="px-2 py-1.5 text-end">{ils(run.revenueIls)}</td>
                      <td className="px-2 py-1.5 text-end">{run.marginIls != null ? ils(run.marginIls) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data.byModel.length > 0 ? (
            <details className="rounded-xl border border-[color:var(--border-main)] p-3">
              <summary className="cursor-pointer text-xs font-semibold">{tc("byModel")}</summary>
              <table className="mt-2 w-full text-start text-xs tabular-nums">
                <thead className="text-[color:var(--foreground-muted)]">
                  <tr>
                    <th className="px-2 py-1 text-start font-semibold">{tc("colModel")}</th>
                    <th className="px-2 py-1 text-end font-semibold">{tc("colCallCount")}</th>
                    <th className="px-2 py-1 text-end font-semibold">{tc("colIn")}</th>
                    <th className="px-2 py-1 text-end font-semibold">{tc("colOut")}</th>
                    <th className="px-2 py-1 text-end font-semibold">{tc("colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((line) => (
                    <tr key={line.model} className="border-t border-[color:var(--border-main)]">
                      <td className="px-2 py-1" dir="ltr">
                        {line.model}
                      </td>
                      <td className="px-2 py-1 text-end">{line.usage.calls}</td>
                      <td className="px-2 py-1 text-end">{tokens(line.usage.inputTokens)}</td>
                      <td className="px-2 py-1 text-end">
                        {tokens(line.usage.outputTokens + line.usage.imageTokens)}
                      </td>
                      <td className="px-2 py-1 text-end">{line.usd != null ? usd(line.usd) : tc("noPrice")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}

          {data.unpricedCalls > 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {tc("unpriced", { count: String(data.unpricedCalls) })}
            </p>
          ) : null}
          <p className="text-[11px] text-[color:var(--foreground-muted)]">
            {tc("source", { date: data.pricesCheckedAt })}
            {data.usdToIls != null && data.rateDate
              ? ` ${tc("rate", { rate: data.usdToIls.toFixed(3), date: data.rateDate })}`
              : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
