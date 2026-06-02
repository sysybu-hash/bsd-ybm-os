"use client";

import React from "react";
import { ScanLine, ArrowRight, Eye, FileText, Settings2 } from "lucide-react";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { ENGINE_MODES } from "./constants";
import type { EngineMeta, QueueItem } from "./types";

type ScanClassification = { scanMode: string; confidence: number; rationale?: string };

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

export function ScanHeaderToolbar({
  t, tr, scannerPrefix, boundProjectName, clearProject,
  userInstruction, persistInstruction, setInstructionsOpen,
  openPreviewPanel, queue, previewUrl, lastScanV5,
  setResultsPanelOpen, pushScannerView, scanClassification, engineRunMode,
  scanModeOverride, setScanModeOverride, scanModes, engineMeta, setEngineRunMode,
}: ScanHeaderToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] p-3">
      <div className="flex items-center gap-3 min-w-0">
        <ScanLine className="text-orange-500 shrink-0" size={22} />
        <div className="min-w-0">
          <h2 className="text-sm font-black truncate">
            {boundProjectName || t("scanner.title")}
          </h2>
          <p className="text-[10px] text-[color:var(--foreground-muted)]">
            {boundProjectName ? t(`${scannerPrefix}.subtitleScoped`) : t("scanner.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Switch project — icon-only on mobile, text on desktop */}
        <button
          type="button"
          onClick={clearProject}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          title={t(`${scannerPrefix}.switchProject`)}
        >
          <ArrowRight size={13} aria-hidden />
          <span className="hidden sm:inline">{t(`${scannerPrefix}.switchProject`)}</span>
        </button>

        {/* Scan mode select — always visible but compact */}
        <select
          value={scanModeOverride}
          onChange={(e) => setScanModeOverride(e.target.value as ScanModeV5)}
          className="min-h-[44px] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-bold"
          aria-label={tr("scanner.scanMode", "מצב סריקה")}
        >
          {scanModes.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        {/* Instructions — hidden on mobile, shown on desktop */}
        <input
          type="text"
          value={userInstruction}
          onChange={(e) => persistInstruction(e.target.value)}
          placeholder={tr("scanner.instructionPlaceholder", "הנחיות ל-AI…")}
          className="hidden max-w-[10rem] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-semibold sm:block"
        />

        {/* Instructions button — icon on mobile */}
        <button
          type="button"
          onClick={() => setInstructionsOpen(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold"
          aria-label={tr("scanner.instructionsBtn", "הנחיות")}
        >
          <Settings2 size={13} aria-hidden />
          <span className="hidden sm:inline">{tr("scanner.instructionsBtn", "הנחיות")}</span>
        </button>

        {/* Preview — only when there's content */}
        <button
          type="button"
          onClick={openPreviewPanel}
          disabled={queue.length === 0 && !previewUrl}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[color:var(--border-main)] p-1.5 disabled:opacity-40"
          aria-label={tr("scanner.preview", "תצוגה מקדימה")}
        >
          <Eye size={14} aria-hidden />
        </button>

        {/* Results — only when there's a scan result */}
        <button
          type="button"
          onClick={() => {
            setResultsPanelOpen(true);
            pushScannerView({ openResultsPanel: true });
          }}
          disabled={!lastScanV5}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[color:var(--border-main)] p-1.5 disabled:opacity-40"
          aria-label={tr("scanner.resultsPanel", "תוצאות")}
        >
          <FileText size={14} aria-hidden />
        </button>

        {/* Classification badge — desktop only */}
        {scanClassification && engineRunMode === "AUTO" ? (
          <span
            className="hidden max-w-[8rem] truncate rounded-lg bg-indigo-500/10 px-2 py-1 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 sm:block"
            title={scanClassification.rationale}
          >
            {tr("scanner.classification", "סיווג")}: {scanClassification.scanMode} (
            {Math.round(scanClassification.confidence * 100)}%)
          </span>
        ) : null}

        {/* Engine mode — visible on all sizes (wraps to new row on mobile) */}
        <select
          value={engineRunMode}
          onChange={(e) => setEngineRunMode(e.target.value as TriEngineRunMode)}
          className="min-h-[44px] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-bold"
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
      </div>
    </div>
  );
}
