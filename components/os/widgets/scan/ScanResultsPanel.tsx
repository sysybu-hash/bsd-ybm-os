"use client";

import { Copy, Download, Library, Save } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import {
  enginePhaseBadgeClass,
  enginePhaseLabelHe,
  formatTelemetrySummaryHe,
  hasSuccessfulEngine,
} from "@/lib/scan-telemetry-display";

export type ScanResultsPanelProps = {
  v5: ScanExtractionV5;
  fileName: string;
  telemetry?: TriEngineTelemetry | null;
  onConfirmErp?: () => void;
  onSaveNotebook?: () => void;
  savingNotebook?: boolean;
};

const ENGINE_ROWS = [
  { key: "documentAI" as const, label: "Document AI" },
  { key: "gemini" as const, label: "Gemini" },
  { key: "gpt" as const, label: "GPT" },
];

export default function ScanResultsPanel({
  v5,
  fileName,
  telemetry,
  onConfirmErp,
  onSaveNotebook,
  savingNotebook,
}: ScanResultsPanelProps) {
  const { t, dir } = useI18n();
  const meta = v5.documentMetadata;

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ v5, telemetry }, null, 2));
    toast.success(t("scanner.results.copied"));
  };

  const exportCsv = () => {
    const rows = v5.lineItems ?? [];
    const header = "description,quantity,unitPrice,total\n";
    const body = rows
      .map((r) =>
        [r.description ?? "", r.quantity ?? 1, r.unitPrice ?? "", r.lineTotal ?? ""]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "")}-lines.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metaRows = [
    { label: t("scanner.source"), value: v5.vendor },
    { label: t("scanner.document"), value: v5.docType },
    { label: "פרויקט", value: meta?.project },
    { label: "לקוח", value: meta?.client },
    { label: "תאריך", value: meta?.documentDate ?? v5.date },
  ].filter((r) => r.value && r.value !== "לא צוין" && r.value !== "UNKNOWN");

  return (
    <div className="space-y-4 text-sm" dir={dir}>
      <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--foreground-muted)]">
          {t("scanner.results.summary")}
        </p>
        <p className="mt-1 font-black text-[color:var(--foreground-main)]">{v5.docType || "—"}</p>
        <p className="text-[color:var(--foreground-muted)]">{v5.vendor || "—"}</p>
        <p className="mt-2 text-lg font-black text-indigo-600 dark:text-indigo-400">
          {v5.total != null ? `₪${Number(v5.total).toLocaleString("he-IL")}` : "—"}
        </p>
        {metaRows.length > 0 ? (
          <dl className="mt-3 space-y-1 border-t border-[color:var(--border-main)] pt-2 text-xs">
            {metaRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-2">
                <dt className="text-[color:var(--foreground-muted)]">{row.label}</dt>
                <dd className="font-semibold text-end">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {telemetry ? (
        <div className="rounded-xl border border-[color:var(--border-main)] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase text-[color:var(--foreground-muted)]">
              {t("scanner.results.telemetry")}
            </p>
            {!hasSuccessfulEngine(telemetry) ? (
              <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-300">
                לא התקבל פענוח מוצלח
              </span>
            ) : null}
          </div>
          <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">{formatTelemetrySummaryHe(telemetry)}</p>
          <ul className="space-y-2 text-xs">
            {ENGINE_ROWS.map(({ key, label }) => {
              const e = telemetry[key];
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--surface-soft)]/40 px-2 py-1.5"
                >
                  <span className="font-bold">{label}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black ${enginePhaseBadgeClass(e.phase)}`}
                    >
                      {enginePhaseLabelHe(e.phase)}
                    </span>
                    {e.ms != null ? (
                      <span className="font-mono text-[color:var(--foreground-muted)]">{e.ms}ms</span>
                    ) : null}
                  </span>
                  {e.detail && e.phase === "error" ? (
                    <p className="w-full text-[10px] leading-snug text-red-600/90 dark:text-red-300/90">{e.detail}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {(v5.lineItems?.length ?? 0) > 0 && (
        <div className="max-h-48 overflow-auto rounded-xl border border-[color:var(--border-main)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[color:var(--surface-card)]">
              <tr>
                <th className="p-2 text-start">{t("scanner.results.lineDesc")}</th>
                <th className="p-2">{t("scanner.results.qty")}</th>
                <th className="p-2">{t("scanner.results.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {v5.lineItems!.map((row, i) => (
                <tr key={i} className="border-t border-[color:var(--border-main)]">
                  <td className="p-2">{row.description}</td>
                  <td className="p-2 text-center">{row.quantity ?? 1}</td>
                  <td className="p-2 text-end">{row.lineTotal ?? row.unitPrice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyJson()} className="os-btn-secondary flex items-center gap-1.5 text-xs">
          <Copy size={14} aria-hidden />
          JSON
        </button>
        <button type="button" onClick={exportCsv} className="os-btn-secondary flex items-center gap-1.5 text-xs">
          <Download size={14} aria-hidden />
          CSV
        </button>
        {onConfirmErp ? (
          <button type="button" onClick={onConfirmErp} className="os-btn-primary flex items-center gap-1.5 text-xs">
            <Save size={14} aria-hidden />
            {t("scanner.results.confirmErp")}
          </button>
        ) : null}
        {onSaveNotebook ? (
          <button
            type="button"
            disabled={savingNotebook}
            onClick={onSaveNotebook}
            className="os-btn-primary flex items-center gap-1.5 text-xs"
          >
            <Library size={14} aria-hidden />
            {t("scanner.saveToNotebook")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
