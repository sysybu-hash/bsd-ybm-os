"use client";

import React from "react";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { ScanValidationResult } from "@/lib/scan-validate";

type LiveExtractionPanelProps = {
  v5: ScanExtractionV5 | null;
  validation: ScanValidationResult | null;
  tr: (key: string, fallback: string) => string;
};

/** צבע נקודת ביטחון פר-שדה: ירוק ≥0.8, כתום ≥0.5, אחרת אדום. */
function confidenceDotClass(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500";
  if (confidence >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function formatIls(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "—";
  return `₪ ${total.toLocaleString("he-IL")}`;
}

type FieldRow = {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
};

/**
 * פאנל החילוץ-החי של ה-Command Center — מציג את השדות הסקלריים עם נקודת ביטחון
 * פר-שדה (מ-validation.fieldConfidence) ותווית מקור-המנוע (מ-v5.fieldProvenance),
 * מתחתם באנרי ולידציה. מתעדכן חי מאירועי partial_v5 בסטרימינג.
 */
export function LiveExtractionPanel({ v5, validation, tr }: LiveExtractionPanelProps) {
  const fieldConfidence = validation?.fieldConfidence ?? {};
  const provenance = v5?.fieldProvenance ?? {};
  const overall = validation?.effectiveConfidence;

  const rows: FieldRow[] = v5
    ? [
        { key: "vendor", label: tr("scanner.fieldVendor", "ספק"), value: v5.vendor || "—" },
        { key: "taxId", label: tr("scanner.fieldTaxId", "ח.פ"), value: v5.taxId || "—", mono: true },
        { key: "date", label: tr("scanner.fieldDate", "תאריך"), value: v5.date || "—", mono: true },
        { key: "total", label: tr("scanner.fieldTotal", "סה״כ"), value: formatIls(v5.total) },
      ]
    : [];

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[color:var(--foreground-muted)]">
          {tr("scanner.liveExtraction", "חילוץ חי")}
        </span>
        {overall != null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              overall >= 0.8
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : overall >= 0.6
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300"
            }`}
          >
            {tr("scanner.confidence", "ביטחון")} {overall.toFixed(2)}
          </span>
        )}
      </div>

      {!v5 ? (
        <p className="py-6 text-center text-[12px] text-[color:var(--foreground-muted)]">
          {tr("scanner.waitingForScan", "ממתין לסריקה — התוצאות יופיעו כאן בזמן אמת")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const conf = fieldConfidence[row.key] ?? 0.85;
            const source = provenance[row.key];
            return (
              <div key={row.key} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${confidenceDotClass(conf)}`} aria-hidden />
                <span className="w-14 shrink-0 text-[12px] text-[color:var(--foreground-muted)]">{row.label}</span>
                <span className={`flex-1 truncate text-[13px] font-bold ${row.mono ? "font-mono" : ""}`}>{row.value}</span>
                {source && (
                  <span className="shrink-0 text-[10px] text-[color:var(--foreground-muted)]">{source}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {validation && validation.issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {validation.issues
            .filter((issue) => issue.severity !== "info")
            .slice(0, 4)
            .map((issue, idx) => (
              <div
                key={`${issue.code}-${idx}`}
                className={`flex gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${
                  issue.severity === "error"
                    ? "bg-red-500/10 text-red-700 dark:text-red-300"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}
              >
                <span>{issue.message}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
