"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { SiteAiCostSummary } from "@/lib/ai-cost-summary";
import type { AdminVizCostSummary } from "@/lib/projects/floorplan-viz-costs";
import { AiCostsSite } from "./AiCostsSite";
import { AiCostsViz } from "./AiCostsViz";
import { readCurrency, saveCurrency, type CostCurrency, type CostRate } from "./ai-costs-format";

type Payload = {
  month: string;
  rate: CostRate;
  site: SiteAiCostSummary & { measuredSince: string | null };
  viz: AdminVizCostSummary;
  error?: string;
};

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The site's AI bill, and the visualisations against what they sell for.
 * Platform admin only — nothing a customer can reach shows a cost.
 */
export function AiCostsTab() {
  const { t } = useI18n();
  const tc = useCallback(
    (suffix: string, params?: Record<string, string>) => t(`platformAdmin.aiCosts.${suffix}`, params),
    [t],
  );
  const [month, setMonth] = useState(thisMonth);
  const [currency, setCurrency] = useState<CostCurrency>("ILS");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setCurrency(readCurrency()), []);

  const pick = (next: CostCurrency) => {
    setCurrency(next);
    saveCurrency(next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-costs?month=${encodeURIComponent(month)}`, { credentials: "include" });
      const json = (await res.json()) as Payload;
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

  const currencyButton = (value: CostCurrency, label: string) => (
    <button
      type="button"
      onClick={() => pick(value)}
      aria-pressed={currency === value}
      className={`px-3 py-1 text-xs font-semibold ${
        currency === value ? "bg-[color:var(--foreground-main,#111)] text-[color:var(--background-main,#fff)]" : ""
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-5" aria-label={tc("title")}>
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
        <div
          role="group"
          aria-label={tc("currency")}
          className="inline-flex overflow-hidden rounded-lg border border-[color:var(--border-main)]"
        >
          {currencyButton("ILS", "₪")}
          {currencyButton("USD", "$")}
        </div>
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
      {data && currency === "ILS" && !data.rate ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">{tc("noRateFallback")}</p>
      ) : null}

      {data ? (
        <>
          <AiCostsSite site={data.site} currency={currency} rate={data.rate} tc={tc} />
          <AiCostsViz viz={data.viz} currency={currency} rate={data.rate} tc={tc} />
          <p className="text-[11px] text-[color:var(--foreground-muted)]">
            {tc("source", { date: data.site.pricesCheckedAt })}
            {data.rate ? ` ${tc("rate", { rate: data.rate.usdToIls.toFixed(3), date: data.rate.date })}` : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
