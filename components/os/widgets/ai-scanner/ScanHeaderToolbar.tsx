"use client";

import React from "react";
import { ScanLine, ArrowRight, Eye, FileText, Settings2 } from "lucide-react";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { ENGINE_MODES } from "./constants";
import type { EngineMeta, QueueItem } from "./types";

type ScanClassification = { scanMode: string; confidence: number; rationale?: string; uncertain?: boolean };

type ScanHeaderToolbarProps = {
  t: (key: string) => string;
  tr: (key: string, fallback: string) => string;
  scannerPrefix: string;
  boundProjectName: string;
  clearProject: () => void;
  userInstruction: string;
  persistInstruction: (value: string) => void;
  setInstructionsOpen: (open: boolean) => void;
  openPreviewPanel: () => void;
  queue: QueueItem[];
  previewUrl: string | null;
  lastScanV5: unknown;
  setResultsPanelOpen: (open: boolean) => void;
  pushScannerView: (view: WidgetViewState) => void;
  scanClassification: ScanClassification | null;
  engineRunMode: TriEngineRunMode;
  scanModeOverride: ScanModeV5;
  setScanModeOverride: (mode: ScanModeV5) => void;
  scanModes: { id: string; label: string }[];
  engineMeta: EngineMeta | null;
  setEngineRunMode: (mode: TriEngineRunMode) => void;
};

const selectClass =
  "h-9 shrink-0 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 text-[11px] font-bold";
const iconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] disabled:opacity-40";

export function ScanHeaderToolbar({
  t, tr, scannerPrefix, boundProjectName, clearProject,
  userInstruction, persistInstruction, setInstructionsOpen,
  openPreviewPanel, queue, previewUrl, lastScanV5,
  setResultsPanelOpen, pushScannerView, scanClassification, engineRunMode,
  scanModeOverride, setScanModeOverride, scanModes, engineMeta, setEngineRunMode,
}: ScanHeaderToolbarProps) {
  return (
    <div className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
      {/* Row 1 — identity + switch project (symmetric: title start, action end) */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
          <ScanLine className="text-orange-500" size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-black leading-tight">
            {boundProjectName || t("scanner.title")}
          </h2>
          <p className="truncate text-[9px] leading-tight text-[color:var(--foreground-muted)]">
            {boundProjectName ? t(`${scannerPrefix}.subtitleScoped`) : t("scanner.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={clearProject}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2.5 text-[11px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          title={t(`${scannerPrefix}.switchProject`)}
        >
          <ArrowRight size={13} className="rtl:rotate-180" aria-hidden />
          <span className="hidden sm:inline">{t(`${scannerPrefix}.switchProject`)}</span>
        </button>
      </div>

      {/* Row 2 — controls, single compact line that scrolls instead of wrapping */}
      <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto">
        <select
          value={scanModeOverride}
          onChange={(e) => setScanModeOverride(e.target.value as ScanModeV5)}
          className={selectClass}
          aria-label={tr("scanner.scanMode", "מצב סריקה")}
        >
          {scanModes.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <select
          value={engineRunMode}
          onChange={(e) => setEngineRunMode(e.target.value as TriEngineRunMode)}
          className={selectClass}
          aria-label={tr("scanner.configAi", "מנועים")}
        >
          {ENGINE_MODES.map((m) => (
            <option
              key={m.id}
              value={m.id}
              disabled={m.id === "SINGLE_DOCUMENT_AI" && !engineMeta?.configured.documentAI}
            >
              {tr(m.labelKey, m.fallback)}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={userInstruction}
          onChange={(e) => persistInstruction(e.target.value)}
          placeholder={tr("scanner.instructionPlaceholder", "הנחיות ל-AI…")}
          className="hidden h-9 w-40 shrink-0 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 text-[11px] font-semibold sm:block"
        />
        <button
          type="button"
          onClick={() => setInstructionsOpen(true)}
          className={iconBtn}
          aria-label={tr("scanner.instructionsBtn", "הנחיות")}
        >
          <Settings2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={openPreviewPanel}
          disabled={queue.length === 0 && !previewUrl}
          className={iconBtn}
          aria-label={tr("scanner.preview", "תצוגה מקדימה")}
        >
          <Eye size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setResultsPanelOpen(true);
            pushScannerView({ openResultsPanel: true });
          }}
          disabled={!lastScanV5}
          className={iconBtn}
          aria-label={tr("scanner.resultsPanel", "תוצאות")}
        >
          <FileText size={15} aria-hidden />
        </button>

        {scanClassification && engineRunMode === "AUTO" ? (
          <span
            className="hidden shrink-0 truncate rounded-lg bg-indigo-500/10 px-2 py-1.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 sm:block"
            title={scanClassification.rationale}
          >
            {scanClassification.scanMode} ({Math.round(scanClassification.confidence * 100)}%)
          </span>
        ) : null}
      </div>

      {scanClassification?.uncertain && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-50/80 px-3 py-2 text-xs dark:border-amber-400/20 dark:bg-amber-900/10">
          <span className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>⚠</span>
          <span className="text-amber-800 dark:text-amber-300">
            <strong>{scanClassification.scanMode}</strong>
            {" — "}
            {tr("scanner.classificationUncertainHint", "ניתן לשנות סוג מסמך בבורר למעלה")}
          </span>
        </div>
      )}
    </div>
  );
}
