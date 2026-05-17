"use client";

import { Copy, Download, Library, Save } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";

export type ScanResultsPanelProps = {
  v5: ScanExtractionV5;
  fileName: string;
  telemetry?: TriEngineTelemetry | null;
  onConfirmErp?: () => void;
  onSaveNotebook?: () => void;
  savingNotebook?: boolean;
};

export default function ScanResultsPanel({
  v5,
  fileName,
  telemetry,
  onConfirmErp,
  onSaveNotebook,
  savingNotebook,
}: ScanResultsPanelProps) {
  const { t, dir } = useI18n();

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
      </div>

      {telemetry ? (
        <div className="rounded-xl border border-[color:var(--border-main)] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase text-[color:var(--foreground-muted)]">
            {t("scanner.results.telemetry")}
          </p>
          <ul className="space-y-1 text-xs">
            {(
              [
                { name: "Document AI", ...telemetry.documentAI },
                { name: "Gemini", ...telemetry.gemini },
                { name: "GPT", ...telemetry.gpt },
              ] as const
            ).map((e) => (
              <li key={e.name} className="flex justify-between gap-2">
                <span>{e.name}</span>
                <span className="text-[color:var(--foreground-muted)]">
                  {e.phase}
                  {e.ms != null ? ` · ${e.ms}ms` : ""}
                </span>
              </li>
            ))}
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
