"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  Hash,
  Sparkles,
  User,
} from "lucide-react";
import type { MarketingDemoScanResult } from "@/hooks/useMarketingDemoScan";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  result: MarketingDemoScanResult;
  registerHref: string;
  onScanAnother: () => void;
  canScanAnother: boolean;
}>;

function formatMoney(total: number, currency?: string): string {
  const cur = currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "ILS";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(total);
}

export default function MarketingFieldScanResults({
  result,
  registerHref,
  onScanAnother,
  canScanAnother,
}: Props) {
  const { t } = useI18n();
  const { extraction } = result;
  const meta = extraction.documentMetadata;
  const lines = extraction.lineItems.filter((row) => row.description?.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-emerald-300">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-xs font-bold tracking-wide uppercase">
            {t("marketingHome.cinematic.fieldScanResultBadge")}
          </span>
        </div>
        {result.confidence === "low" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {t("marketingHome.cinematic.fieldScanConfidenceLow")}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 rounded-xl border border-emerald-500/25 bg-emerald-950/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
            {t("marketingHome.cinematic.fieldScanResultAmount")}
          </p>
          <p className="mt-1 text-2xl font-black text-white">
            {extraction.total > 0
              ? formatMoney(extraction.total, extraction.lineItems[0]?.currency)
              : t("marketingHome.cinematic.fieldScanResultUnknown")}
          </p>
        </div>

        <ResultChip
          icon={Building2}
          label={t("marketingHome.cinematic.fieldScanResultVendor")}
          value={extraction.vendor}
        />
        <ResultChip
          icon={User}
          label={t("marketingHome.cinematic.fieldScanResultClient")}
          value={meta.client ?? extraction.documentMetadata.client}
        />
        <ResultChip
          icon={FileText}
          label={t("marketingHome.cinematic.fieldScanResultProject")}
          value={meta.project}
        />
        <ResultChip
          icon={Calendar}
          label={t("marketingHome.cinematic.fieldScanResultDate")}
          value={extraction.date ?? meta.documentDate}
        />
        {extraction.taxId ? (
          <ResultChip
            icon={Hash}
            label={t("marketingHome.cinematic.fieldScanResultTaxId")}
            value={extraction.taxId}
          />
        ) : null}
      </div>

      {lines.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t("marketingHome.cinematic.fieldScanResultLines")}
          </p>
          <ul className="max-h-36 space-y-2 overflow-y-auto text-xs text-slate-200">
            {lines.slice(0, 8).map((row, i) => (
              <li
                key={`${row.description}-${i}`}
                className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0"
              >
                <span className="min-w-0 flex-1 leading-snug">{row.description}</span>
                {row.lineTotal != null && row.lineTotal > 0 ? (
                  <span className="shrink-0 font-semibold text-emerald-300">
                    {formatMoney(row.lineTotal, row.currency)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.summary ? (
        <p className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-xs leading-relaxed text-slate-200">
          {result.summary}
        </p>
      ) : null}

      {result.assumptions.length > 0 ? (
        <ul className="space-y-1 text-[10px] text-slate-400">
          {result.assumptions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-[10px] leading-relaxed text-slate-400">
        {t("marketingHome.cinematic.fieldScanDisclaimer")}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={registerHref}
          className="inline-flex flex-1 items-center justify-center rounded-xl mkt-btn-primary px-4 py-2.5 text-sm font-bold"
        >
          {t("marketingHome.cinematic.fieldScanRegisterCta")}
        </Link>
        {canScanAnother ? (
          <button
            type="button"
            onClick={onScanAnother}
            className="inline-flex flex-1 items-center justify-center rounded-xl mkt-btn-ghost px-4 py-2.5 text-sm font-bold"
          >
            {t("marketingHome.cinematic.fieldScanRetry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ResultChip({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof Building2;
  label: string;
  value: string | null | undefined;
}>) {
  const { t } = useI18n();
  const display = value?.trim() || t("marketingHome.cinematic.fieldScanResultUnknown");
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-2.5">
      <div className="mb-1 flex items-center gap-1 text-[10px] text-slate-400">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span>{label}</span>
      </div>
      <p className="line-clamp-2 text-xs font-semibold text-slate-100">{display}</p>
    </div>
  );
}
