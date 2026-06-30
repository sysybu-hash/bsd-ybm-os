"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, Receipt, X } from "lucide-react";
import { DocumentScanShell } from "@/components/os/scan/DocumentScanShell";
import { ScanEngineBar } from "@/components/os/scan/shared/ScanEngineBar";
import { ScanControlBar } from "@/components/os/widgets/ai-scanner/ScanControlBar";
import { useOfficeExpenseScan } from "@/components/os/widgets/office-expense-scan/useOfficeExpenseScan";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";

type Props = {
  onExpenseSaved?: () => void;
};

/** סורק מותאם להוצאות משרד — חשבונית/קבלה, ללא פרויקט וללא כרום מלא */
export default function OfficeExpenseScanPanel({ onExpenseSaved }: Props) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const s = useOfficeExpenseScan({ onSaveComplete: onExpenseSaved });

  const {
    dir,
    tr,
    engineMeta,
    engineRunMode,
    setEngineRunMode,
    scanModeOverride,
    setScanModeOverride,
    officeScanModes,
    fileInputRef,
    scanQueue,
  } = s;

  const {
    pendingFiles,
    startScan,
    clearPending,
    removePendingFile,
    applyFilePreview,
    queue,
    isProcessing,
    pendingAnalysis,
    scanUiPhase,
    stopScan,
    goBackScanStep,
    continueToSaveStep,
    resetScanState,
  } = scanQueue;

  const activeModeLabel = useMemo(
    () => officeScanModes.find((m) => m.id === scanModeOverride)?.label ?? officeScanModes[0]?.label ?? "",
    [officeScanModes, scanModeOverride],
  );

  const showIntakeChrome = scanUiPhase === "idle" || scanUiPhase === "processing";

  return (
    <div className="flex flex-col bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      {showIntakeChrome ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-main)]/60 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--foreground-main)]">
            <Receipt size={14} className="text-[color:var(--win-accent,#6366f1)]" aria-hidden />
            {activeModeLabel}
          </span>
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--foreground-main)]"
            aria-expanded={advancedOpen}
          >
            {t("workspaceWidgets.officeExpenses.scanAdvanced")}
            <ChevronDown
              size={12}
              className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      ) : null}

      {advancedOpen && showIntakeChrome ? (
        <div className="flex flex-col gap-2 border-b border-[color:var(--border-main)]/60 px-3 py-2">
          <ScanEngineBar
            value={engineRunMode}
            onChange={setEngineRunMode}
            engineMeta={engineMeta}
            tr={tr}
          />
          <select
            value={scanModeOverride}
            onChange={(e) => setScanModeOverride(e.target.value as ScanModeUiSelection)}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[11px] font-bold"
            aria-label={t("workspaceWidgets.officeExpenses.scanDocType")}
          >
            {officeScanModes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <DocumentScanShell state={s} embeddedInHub compactMode showIntakeControls={false} />

      {pendingFiles.length > 0 && scanUiPhase === "idle" ? (
        <div className="shrink-0 border-t border-[color:var(--border-main)]/60 bg-amber-500/5 px-3 py-2">
          <p className="mb-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            {t("workspaceWidgets.officeExpenses.scanFilesReady", {
              count: String(pendingFiles.length),
            })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pendingFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[11rem] items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-[10px] font-bold"
              >
                <button
                  type="button"
                  onClick={() => applyFilePreview(f)}
                  className="truncate text-start hover:text-orange-600"
                  title={f.name}
                >
                  {f.name}
                </button>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="shrink-0 text-[color:var(--foreground-muted)] hover:text-rose-500"
                  aria-label={tr("workspaceWidgets.aiScanner.removeFile", "הסר")}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ScanControlBar
        phase={scanUiPhase}
        t={t}
        tr={tr}
        hasContent={queue.length > 0 || !!pendingAnalysis || isProcessing}
        pendingCount={pendingFiles.length}
        onClearPending={clearPending}
        onStop={stopScan}
        onBack={goBackScanStep}
        onContinueToSave={pendingAnalysis ? continueToSaveStep : undefined}
        onScanMore={() => {
          resetScanState();
          fileInputRef.current?.click();
        }}
        onReset={resetScanState}
        onPickFiles={() => fileInputRef.current?.click()}
        onStartScan={() => void startScan()}
      />
    </div>
  );
}
