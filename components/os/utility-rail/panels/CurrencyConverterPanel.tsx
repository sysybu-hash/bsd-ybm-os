"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { SUPPORTED_CURRENCIES } from "@/lib/exchange-rates/frankfurter";
import { useExchangeRates } from "@/hooks/use-exchange-rates";

const R = "workspaceWidgets.utilityRail.currency";

export default function CurrencyConverterPanel() {
  const { t, locale } = useI18n();
  const [from, setFrom] = useState("ILS");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("100");

  const symbols = useMemo(
    () => SUPPORTED_CURRENCIES.filter((c) => c !== from),
    [from],
  );

  const { data, loading, error, refresh } = useExchangeRates(from, symbols);

  const rate = data?.rates[to] ?? null;
  const parsedAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const converted = rate != null ? parsedAmount * rate : null;

  const formatMoney = (value: number, currency: string) =>
    new Intl.NumberFormat(locale === "he" ? "he-IL" : locale === "ru" ? "ru-RU" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  if (loading && !data) {
    return <WidgetState variant="loading" message={t(`${R}.loading`)} />;
  }

  if (error && !data) {
    return (
      <WidgetState
        variant="error"
        message={t(`${R}.loadFailed`)}
        onRetry={() => void refresh()}
        retryLabel={t(`${R}.refresh`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t(`${R}.from`)}
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-2 text-sm"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="mb-1 rounded-lg border border-[color:var(--border-main)] p-2 hover:bg-[color:var(--surface-soft)]"
          aria-label={t(`${R}.swap`)}
        >
          <ArrowLeftRight size={16} aria-hidden />
        </button>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t(`${R}.to`)}
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-2 text-sm"
          >
            {SUPPORTED_CURRENCIES.filter((c) => c !== from).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium">
        {t(`${R}.amount`)}
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-mono"
          dir="ltr"
        />
      </label>

      <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/5 p-3">
        <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${R}.result`)}</p>
        <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">
          {converted != null ? formatMoney(converted, to) : "—"}
        </p>
        {rate != null ? (
          <p className="mt-2 text-xs text-[color:var(--foreground-muted)]" dir="ltr">
            1 {from} = {rate.toFixed(4)} {to}
          </p>
        ) : null}
      </div>

      {data ? (
        <p className="text-[10px] text-[color:var(--foreground-muted)]">
          {t(`${R}.updated`, { date: data.date })}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void refresh()}
        className="inline-flex items-center justify-center gap-1 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-semibold hover:bg-[color:var(--surface-soft)]"
      >
        <RefreshCw size={14} aria-hidden />
        {t(`${R}.refresh`)}
      </button>
    </div>
  );
}
