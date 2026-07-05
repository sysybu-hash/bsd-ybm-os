"use client";

import React from "react";
import { ScanLine, ArrowRight, Camera, Eye, FileText, Settings2 } from "lucide-react";
import { isAutoDetectScanMode, type ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { EngineMeta, QueueItem } from "./types";
import { EngineSelector } from "./EngineSelector";
import { ScanOutboxBadge } from "./ScanOutboxBadge";

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
  scanModeOverride: ScanModeUiSelection;
  setScanModeOverride: (mode: ScanModeUiSelection) => void;
  scanModes: { id: ScanModeUiSelection; label: string }[];
  engineMeta: EngineMeta | null;
  setEngineRunMode: (mode: TriEngineRunMode) => void;
  /** Primary action lives in the header now (top), not pinned at the bottom. */
  pendingCount: number;
  onPickFiles: () => void;
  onStartScan: () => void;
  onOpenCamera: () => void;
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
  pendingCount, onPickFiles, onStartScan, onOpenCamera,
}: ScanHeaderToolbarProps) {
  return (
    <div className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-1.5">
      {/* Row 1 — identity + switch project + PRIMARY action (pick / scan) */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
          <ScanLine className="text-orange-500" size={16} aria-hidden />
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
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2 text-[11px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          title={t(`${scannerPrefix}.switchProject`)}
          aria-label={t(`${scannerPrefix}.switchProject`)}
        >
          <ArrowRight size={13} className="rtl:rotate-180" aria-hidden />
          <span className="hidden md:inline">{t(`${scannerPrefix}.switchProject`)}</span>
        </button>
        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={onStartScan}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-l from-[color:var(--accent)] to-[color:var(--accent-strong)] px-3 text-[11px] font-bold text-white shadow-sm hover:from-orange-500"
          >
            <ScanLine size={14} aria-hidden />
            {tr("workspaceWidgets.aiScanner.scanNow", "סרוק עכשיו")} ({pendingCount})
          </button>
        ) : (
          <button
            type="button"
            onClick={onPickFiles}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 text-[11px] font-bold text-[color:var(--accent)] hover:bg-orange-500/15 dark:text-orange-300"
          >
            <ScanLine size={14} aria-hidden />
            {tr("workspaceWidgets.aiScanner.pickFiles", "בחר קבצים לסריקה")}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenCamera}
          className={iconBtn}
          title={tr("scanner.cameraOpen", "צלם מסמך")}
          aria-label={tr("scanner.cameraOpen", "צלם מסמך")}
        >
          <Camera size={15} aria-hidden />
        </button>
        <ScanOutboxBadge tr={tr} />
      </div>

      {/* Row 2 — clickable engine selector (single row, all engines) */}
      <div className="mt-1.5">
        <EngineSelector
          value={engineRunMode}
          onChange={setEngineRunMode}
          engineMeta={engineMeta}
          tr={tr}
        />
      </div>

      {/* Row 3 — scan-mode + tools, compact scrolling line */}
      <div className="no-scrollbar mt-1.5 flex items-center gap-1.5 overflow-x-auto">
        <select
          value={scanModeOverride}
          onChange={(e) => setScanModeOverride(e.target.value as ScanModeUiSelection)}
          className={selectClass}
          aria-label={tr("scanner.scanMode", "מצב סריקה")}
        >
          {scanModes.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={userInstruction}
          onChange={(e) => persistInstruction(e.target.value)}
          placeholder={tr("scanner.instructionPlaceholder", "הנחיות ל-AI…")}
          aria-label={tr("scanner.instructionPlaceholder", "הנחיות ל-AI")}
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
          disabled={queue.length === 0 && !previewUrl && pendingCount === 0}
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

        {scanClassification ? (
          <span
            className="hidden shrink-0 truncate rounded-lg bg-indigo-500/10 px-2 py-1.5 text-[10px] font-bold text-[color:var(--accent)] dark:text-indigo-300 sm:block"
            title={scanClassification.rationale}
          >
            {isAutoDetectScanMode(scanModeOverride)
              ? tr("scanner.detectedDocType", "זוהה")
              : null}
            {" "}
            {scanModes.find((m) => m.id === scanClassification.scanMode)?.label ??
              scanClassification.scanMode}{" "}
            ({Math.round(scanClassification.confidence * 100)}%)
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
