"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  executiveListTierPricingAction,
  executiveSaveTierPricingAction,
  type TierPricingRow,
} from "@/app/actions/executive-subscriptions";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldInlineClassName } from "@/components/os/ui/os-field";

/**
 * Editor for the per-tier monthly price.
 *
 * These values are what customers are actually charged: the register wizard
 * renders them and the PayPal order amount is derived from the same source
 * (getExpectedTierOrderAmountIls), so a change here reaches checkout.
 *
 * Clearing a field removes the override and falls back to the price compiled
 * into subscription-tier-config.
 */
export function TierPricingPanel() {
  const { t } = useI18n();
  const tp = (suffix: string) => t(`platformAdmin.tierPricing.${suffix}`);

  const [rows, setRows] = useState<TierPricingRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await executiveListTierPricingAction();
    if ("error" in data) {
      toast.error(data.error);
      return;
    }
    setRows(data);
    setDraft(
      Object.fromEntries(
        data.map((r) => [r.tier, r.isOverridden ? String(r.effectiveMonthlyIls ?? "") : ""]),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const payload: Record<string, number | null> = {};
    for (const [tier, raw] of Object.entries(draft)) {
      const trimmed = raw.trim();
      if (!trimmed) {
        payload[tier] = null;
        continue;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(`${tp("invalidPrice")}: ${tier}`);
        return;
      }
      payload[tier] = n;
    }
    setBusy(true);
    try {
      const r = await executiveSaveTierPricingAction(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(tp("saved"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-[color:var(--foreground-muted)]">
        <Loader2 className="animate-spin" size={16} aria-hidden />
        {tp("loading")}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 sm:p-5">
      <h3 className="text-base font-black">{tp("title")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
        {tp("description")}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-start text-xs font-bold text-[color:var(--foreground-muted)]">
              <th className="pb-2 text-start">{tp("colTier")}</th>
              <th className="pb-2 text-start">{tp("colPrice")}</th>
              <th className="pb-2 text-start">{tp("colDefault")}</th>
              <th className="pb-2 text-start">{tp("colAllowance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tier} className="border-t border-[color:var(--border-main)]">
                <td className="py-2.5 pe-3 font-bold">
                  {t(`subscriptionTierLabels.${row.tier}`)}
                  {row.isOverridden ? (
                    <span className="ms-2 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                      {tp("overridden")}
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pe-3">
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden>₪</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      className={`${osFieldInlineClassName} w-28`}
                      value={draft[row.tier] ?? ""}
                      placeholder={
                        row.defaultMonthlyIls != null ? String(row.defaultMonthlyIls) : "—"
                      }
                      aria-label={`${t(`subscriptionTierLabels.${row.tier}`)} — ${tp("colPrice")}`}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [row.tier]: e.target.value }))
                      }
                    />
                  </div>
                </td>
                <td className="py-2.5 pe-3 text-[color:var(--foreground-muted)]">
                  {row.defaultMonthlyIls != null ? `₪${row.defaultMonthlyIls}` : "—"}
                </td>
                <td className="py-2.5 text-xs text-[color:var(--foreground-muted)]">
                  {row.cheapScans} / {row.premiumScans} · {tp("companies")} {row.maxCompanies}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[color:var(--foreground-muted)]">{tp("clearHint")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Save size={16} aria-hidden />}
          {tp("save")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold disabled:opacity-60"
        >
          <RotateCcw size={16} aria-hidden />
          {tp("reload")}
        </button>
      </div>
    </section>
  );
}
