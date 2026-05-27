"use client";

import React from "react";
import { ArrowRight, RotateCcw, Save, Square } from "lucide-react";

export type ScanUiPhase = "idle" | "processing" | "review" | "results";

type ScanControlBarProps = {
  phase: ScanUiPhase;
  t: (key: string) => string;
  onStop?: () => void;
  onBack?: () => void;
  onContinueToSave?: () => void;
  onCancel?: () => void;
};

const btnBase =
  "flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40";

export function ScanControlBar({
  phase,
  t,
  onStop,
  onBack,
  onContinueToSave,
  onCancel,
}: ScanControlBarProps) {
  if (phase === "idle") return null;

  const prefix = "workspaceWidgets.aiScanner";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/40 px-3 py-2.5 backdrop-blur-md">
      {phase === "processing" && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className={`${btnBase} border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300`}
        >
          <Square size={14} aria-hidden />
          {t(`${prefix}.stopScan`)}
        </button>
      ) : null}

      {(phase === "review" || phase === "results") && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`${btnBase} border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80`}
        >
          <ArrowRight size={14} className="rtl:rotate-180" aria-hidden />
          {t(`${prefix}.back`)}
        </button>
      ) : null}

      {phase === "review" && onContinueToSave ? (
        <button
          type="button"
          onClick={onContinueToSave}
          className={`${btnBase} bg-gradient-to-l from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20`}
        >
          <Save size={14} aria-hidden />
          {t(`${prefix}.continueToSave`)}
        </button>
      ) : null}

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className={`${btnBase} border border-[color:var(--border-main)] text-[color:var(--foreground-muted)]`}
        >
          <RotateCcw size={14} aria-hidden />
          {t(`${prefix}.cancel`)}
        </button>
      ) : null}
    </div>
  );
}
