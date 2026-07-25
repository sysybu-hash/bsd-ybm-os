"use client";

import React from "react";
import { ScanLine, ArrowRight, Camera, Eye, FileText, Settings2 } from "lucide-react";
import { isAutoDetectScanMode, type ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { EngineMeta, QueueItem } from "./types";
import { EngineSelector } from "./EngineSelector";
import { ScanOutboxBadge } from "./ScanOutboxBadge";
import { OsButton, OsIconButton } from "@/components/os/ui";

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
        <OsButton
          variant="secondary"
          size="sm"
          className="!h-8"
          icon={<ArrowRight size={13} className="rtl:rotate-180" aria-hidden />}
          onClick={clearProject}
          title={t(`${scannerPrefix}.switchProject`)}
        >
          <span className="hidden md:inline">{t(`${scannerPrefix}.switchProject`)}</span>
        </OsButton>
        {pendingCount > 0 ? (
          <OsButton
            variant="primary"
            size="sm"
            className="!h-8"
            icon={<ScanLine size={14} aria-hidden />}
            onClick={onStartScan}
          >
            {tr("workspaceWidgets.aiScanner.scanNow", "סרוק עכשיו")} ({pendingCount})
          </OsButton>
        ) : (
          <OsButton
            variant="secondary"
            size="sm"
            className="!h-8"
            icon={<ScanLine size={14} aria-hidden />}
            onClick={onPickFiles}
          >
            {tr("workspaceWidgets.aiScanner.pickFiles", "בחר קבצים לסריקה")}
          </OsButton>
        )}
        <OsIconButton label={tr("scanner.cameraOpen", "צלם מסמך")} onClick={onOpenCamera}>
          <Camera size={15} aria-hidden />
        </OsIconButton>
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
        <OsIconButton label={tr("scanner.instructionsBtn", "הנחיות")} onClick={() => setInstructionsOpen(true)}>
          <Settings2 size={15} aria-hidden />
        </OsIconButton>
        <OsIconButton
          label={tr("scanner.preview", "תצוגה מקדימה")}
          disabled={queue.length === 0 && !previewUrl && pendingCount === 0}
          onClick={openPreviewPanel}
        >
          <Eye size={15} aria-hidden />
        </OsIconButton>
        <OsIconButton
          label={tr("scanner.resultsPanel", "תוצאות")}
          disabled={!lastScanV5}
          onClick={() => {
            setResultsPanelOpen(true);
            pushScannerView({ openResultsPanel: true });
          }}
        >
          <FileText size={15} aria-hidden />
        </OsIconButton>

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
