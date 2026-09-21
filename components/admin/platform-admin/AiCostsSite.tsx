"use client";

import React from "react";
import type { SiteAiCostSummary } from "@/lib/ai-cost-summary";
import { formatMoney, formatTokens, type CostCurrency, type CostRate } from "./ai-costs-format";

type Tc = (suffix: string, params?: Record<string, string>) => string;

type Slice = SiteAiCostSummary["byFeature"][number];

function SliceTable({
  title,
  rows,
  label,
  money,
  tc,
}: {
  title: string;
  rows: Slice[];
  label: (row: Slice) => string;
  money: (usd: number) => string;
  tc: Tc;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-xl border border-[color:var(--border-main)] p-3" open>
      <summary className="cursor-pointer text-xs font-semibold">{title}</summary>
      <table className="mt-2 w-full text-start text-xs tabular-nums">
        <thead className="text-[color:var(--foreground-muted)]">
          <tr>
            <th className="px-2 py-1 text-start font-semibold">{tc("colName")}</th>
            <th className="px-2 py-1 text-end font-semibold">{tc("colCallCount")}</th>
            <th className="px-2 py-1 text-end font-semibold">{tc("colCost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key || "-"} className="border-t border-[color:var(--border-main)]">
              <td className="px-2 py-1" dir="auto">
                {label(row)}
              </td>
              <td className="px-2 py-1 text-end">{row.calls}</td>
              <td className="px-2 py-1 text-end">
                {money(row.usd)}
                {row.unpricedCalls > 0 ? ` (+${row.unpricedCalls} ${tc("noPriceShort")})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Every model call the site made this month — the figure the providers bill. */
export function AiCostsSite({
  site,
  currency,
  rate,
  tc,
}: {
  site: SiteAiCostSummary & { measuredSince: string | null };
  currency: CostCurrency;
  rate: CostRate;
  tc: Tc;
}) {
  const money = (usd: number) => formatMoney(usd, currency, rate);
  const envLabel = (key: string) =>
    key === "production" ? tc("envProduction") : key === "preview" ? tc("envPreview") : tc("envDevelopment");

  return (
    <section className="space-y-3" aria-label={tc("siteTitle")}>
      <h3 className="text-sm font-bold">{tc("siteTitle")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[color:var(--border-main)] p-3">
          <p className="text-[11px] text-[color:var(--foreground-muted)]">{tc("siteTotal")}</p>
          <p className="text-lg font-bold tabular-nums">{money(site.usd)}</p>
          <p className="text-[10px] text-[color:var(--foreground-muted)]">
            {tc("siteCalls", { count: String(site.calls) })}
          </p>
        </div>
        {site.byEnvironment.map((env) => (
          <div key={env.key} className="rounded-xl border border-[color:var(--border-main)] p-3">
            <p className="text-[11px] text-[color:var(--foreground-muted)]">{envLabel(env.key)}</p>
            <p className="text-lg font-bold tabular-nums">{money(env.usd)}</p>
            <p className="text-[10px] text-[color:var(--foreground-muted)]">
              {tc("siteCalls", { count: String(env.calls) })}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[color:var(--foreground-muted)]">
        {site.measuredSince
          ? tc("measuredSince", { date: new Date(site.measuredSince).toLocaleString("he-IL") })
          : tc("notYetMeasured")}
      </p>

      <SliceTable
        title={tc("byFeature")}
        rows={site.byFeature}
        label={(row) => row.key}
        money={money}
        tc={tc}
      />
      <SliceTable
        title={tc("byOrganization")}
        rows={site.byOrganization}
        label={(row) => (row as Slice & { name?: string }).name || tc("noOrganization")}
        money={money}
        tc={tc}
      />

      {site.byModel.length > 0 ? (
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
              {site.byModel.map((line) => (
                <tr key={line.model} className="border-t border-[color:var(--border-main)]">
                  <td className="px-2 py-1" dir="ltr">
                    {line.model}
                  </td>
                  <td className="px-2 py-1 text-end">{line.usage.calls}</td>
                  <td className="px-2 py-1 text-end">{formatTokens(line.usage.inputTokens)}</td>
                  <td className="px-2 py-1 text-end">
                    {formatTokens(line.usage.outputTokens + line.usage.imageTokens)}
                  </td>
                  <td className="px-2 py-1 text-end">{line.usd != null ? money(line.usd) : tc("noPrice")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      {site.unpricedCalls > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {tc("unpriced", { count: String(site.unpricedCalls) })}
        </p>
      ) : null}
    </section>
  );
}
