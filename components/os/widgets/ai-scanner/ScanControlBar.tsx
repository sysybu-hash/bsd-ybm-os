"use client";

import React from "react";
import { ArrowRight, RotateCcw, Save, Square, X } from "lucide-react";

export type ScanUiPhase = "idle" | "processing" | "review" | "results";

type ScanControlBarProps = {
  phase: ScanUiPhase;
  t: (key: string) => string;
  onStop?: () => void;
  onBack?: () => void;
  onContinueToSave?: () => void;
  onCancel?: () => void;
};

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
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/60 px-3 py-2">
      {phase === "processing" && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold text-rose-700 dark:text-rose-300"
        >
          <Square size={12} aria-hidden />
          {t(`${prefix}.stopScan`)}
        </button>
      ) : null}

      {(phase === "review" || phase === "results") && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-[10px] font-bold"
        >
          <ArrowRight size={12} className="rtl:rotate-180" aria-hidden />
          {t(`${prefix}.back`)}
        </button>
      ) : null}

      {phase === "review" && onContinueToSave ? (
        <button
          type="button"
          onClick={onContinueToSave}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white"
        >
          <Save size={12} aria-hidden />
          {t(`${prefix}.continueToSave`)}
        </button>
      ) : null}

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)]"
        >
          <RotateCcw size={12} aria-hidden />
          {t(`${prefix}.cancel`)}
        </button>
      ) : null}
    </div>
  );
}
