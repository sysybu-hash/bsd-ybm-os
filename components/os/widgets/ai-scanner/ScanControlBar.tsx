"use client";

import React from "react";
import { ArrowRight, RotateCcw, Save, ScanLine, Square, Trash2 } from "lucide-react";

export type ScanUiPhase = "idle" | "processing" | "review" | "save" | "results";

type ScanControlBarProps = {
  phase: ScanUiPhase;
  t: (key: string) => string;
  tr: (key: string, fallback: string) => string;
  /** Anything to reset (queue / result / processing) — toggles the reset button. */
  hasContent: boolean;
  /** Files selected but not yet scanned. */
  pendingCount?: number;
  /** At least one queue item errored — show retry button. */
  hasFailedItems?: boolean;
  onPickFiles?: () => void;
  onStartScan?: () => void;
  onClearPending?: () => void;
  onStop?: () => void;
  onBack?: () => void;
  onContinueToSave?: () => void;
  onScanMore?: () => void;
  onReset?: () => void;
  onRetry?: () => void;
};

const PREFIX = "workspaceWidgets.aiScanner";

const base =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40";
const ghost = `${base} border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]`;
const danger = `${base} border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-500/15`;
const primary = `${base} bg-gradient-to-l from-[color:var(--accent)] to-[color:var(--accent-strong)] text-white shadow-md shadow-orange-500/20 hover:from-orange-500`;
const success = `${base} bg-gradient-to-l from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20`;
const warn = `${base} border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15`;

export function ScanControlBar({
  phase,
  t,
  tr,
  hasContent,
  pendingCount = 0,
  hasFailedItems = false,
  onPickFiles,
  onStartScan,
  onClearPending,
  onStop,
  onBack,
  onContinueToSave,
  onScanMore,
  onReset,
  onRetry,
}: ScanControlBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/40 px-3 py-2.5 backdrop-blur-md">
      {/* Secondary cluster — start side */}
      {(phase === "review" || phase === "save" || phase === "results") && onBack ? (
        <button type="button" onClick={onBack} className={ghost}>
          <ArrowRight size={14} className="rtl:rotate-180" aria-hidden />
          {t(`${PREFIX}.back`)}
        </button>
      ) : null}

      {hasContent && onReset ? (
        <button type="button" onClick={onReset} className={ghost}>
          <Trash2 size={14} aria-hidden />
          {tr(`${PREFIX}.resetWindow`, "נקה הכל")}
        </button>
      ) : null}

      {phase === "idle" && pendingCount > 0 && onClearPending ? (
        <button type="button" onClick={onClearPending} className={ghost}>
          <Trash2 size={14} aria-hidden />
          {tr(`${PREFIX}.clearPending`, "נקה")}
        </button>
      ) : null}

      {/* Retry — visible when at least one file/engine failed */}
      {hasFailedItems && onRetry && (phase === "review" || phase === "results") ? (
        <button type="button" onClick={onRetry} className={warn}>
          <RotateCcw size={14} aria-hidden />
          {tr(`${PREFIX}.retry`, "נסה שוב")}
        </button>
      ) : null}

      {/* Primary cluster — end side */}
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {phase === "processing" && onStop ? (
          <button type="button" onClick={onStop} className={danger}>
            <Square size={14} aria-hidden />
            {t(`${PREFIX}.stopScan`)}
          </button>
        ) : null}

        {phase === "review" && onContinueToSave ? (
          <button type="button" onClick={onContinueToSave} className={success}>
            <Save size={14} aria-hidden />
            {t(`${PREFIX}.continueToSave`)}
          </button>
        ) : null}

        {(phase === "review" || phase === "results" || phase === "save") && onScanMore ? (
          <button type="button" onClick={onScanMore} className={primary}>
            <ScanLine size={14} aria-hidden />
            {tr(`${PREFIX}.newScan`, "סריקה חדשה")}
          </button>
        ) : null}

        {phase === "idle" && pendingCount > 0 && onStartScan ? (
          <button type="button" onClick={onStartScan} className={primary}>
            <ScanLine size={14} aria-hidden />
            {tr(`${PREFIX}.scanNow`, "סרוק עכשיו")} ({pendingCount})
          </button>
        ) : phase === "idle" && onPickFiles ? (
          <button type="button" onClick={onPickFiles} className={ghost}>
            <ScanLine size={14} aria-hidden />
            {tr(`${PREFIX}.pickFiles`, "בחר קבצים לסריקה")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
