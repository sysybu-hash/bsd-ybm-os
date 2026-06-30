"use client";

import React from "react";
import { Play, Loader2, Coins, Save, UploadCloud } from "lucide-react";
import ScanFilePreview from "@/components/os/widgets/scan/ScanFilePreview";
import { EngineSelector } from "@/components/os/widgets/ai-scanner/EngineSelector";
import { ScanFullEditor } from "@/components/os/widgets/ai-scanner/ScanFullEditor";
import { ScanDestinationPicker } from "@/components/os/scan/shared/ScanDestinationPicker";
import type { useAiScannerState } from "@/components/os/widgets/ai-scanner/useAiScannerState";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import { EngineTelemetryBoard } from "./EngineTelemetryBoard";
import { LiveExtractionPanel } from "./LiveExtractionPanel";

type ScannerState = ReturnType<typeof useAiScannerState>;

type CommandCenterCanvasProps = {
  state: ScannerState;
  compactMode?: boolean;
  /** false כשסרגל-כותרת חיצוני כבר מספק בורר מנועים + כפתור סריקה — לא לשכפל */
  showControls?: boolean;
};

/** רמת חיוב משוערת לפי מצב המנוע — לתצוגת מחוון עלות לפני סריקה. */
function costHint(mode: TriEngineRunMode, tr: (k: string, f: string) => string): { label: string; premium: boolean } {
  if (mode === "AUTO") return { label: tr("scanner.costAuto", "אוטומטי"), premium: false };
  if (mode === "SINGLE_GEMINI" || mode === "SINGLE_MISTRAL") return { label: tr("scanner.costCheap", "קרדיט זול"), premium: false };
  return { label: tr("scanner.costPremium", "קרדיט פרימיום"), premium: true };
}

/**
 * Command Center — קנבאס יחיד מפוצל שמחליף את זרימת 4 השלבים.
 * מסמך-מקור בצד אחד, חילוץ-חי בצד השני, לוח מנועים בראש, ושמירה מעוגנת —
 * הכל גלוי בו-זמנית. שומר את כל הלוגיקה הקיימת (useAiScannerState).
 */
export function CommandCenterCanvas({ state, compactMode = false, showControls = true }: CommandCenterCanvasProps) {
  const {
    tr,
    fileInputRef,
    cameraInputRef,
    fileAccept,
    isDragging,
    setIsDragging,
    engineMeta,
    engineRunMode,
    setEngineRunMode,
    customEngines,
    setCustomEngines,
    onDrop,
    onFileInputChange,
    boundProjectId,
    scanQueue,
  } = state;

  const {
    pendingFiles,
    isProcessing,
    telemetry,
    lastScanV5,
    pendingAnalysis,
    previewUrl,
    previewMime,
    previewFileName,
    lastScanFileName,
    startScan,
    setPendingAnalysis,
    saveTargets,
    setSaveTargets,
    executeUnifiedSave,
    isSaving,
    lockedSaveTargets,
  } = scanQueue;

  const v5 = lastScanV5 ?? pendingAnalysis?.v5 ?? null;
  const validation = pendingAnalysis?.validation ?? null;
  const hasResult = Boolean(v5);
  const cost = costHint(engineRunMode, tr);
  const fileName = previewFileName || lastScanFileName;

  const onScanClick = () => {
    if (isProcessing) return;
    if (pendingFiles.length > 0) {
      void startScan();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 p-3"
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
    >
      <input ref={fileInputRef} type="file" accept={fileAccept} multiple hidden onChange={onFileInputChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileInputChange} />

      {/* ── שורת פיקוד (רק כשאין סרגל-כותרת חיצוני) ── */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold">{tr("scanner.commandCenter", "מרכז סריקה")}</div>
            {fileName && <div className="truncate text-[11px] text-[color:var(--foreground-muted)]">{fileName}</div>}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold ${
                cost.premium ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
              }`}
            >
              <Coins size={13} aria-hidden />
              {cost.label}
            </span>
            <button
              type="button"
              onClick={onScanClick}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--accent)] px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}
              {isProcessing ? tr("scanner.scanning", "סורק…") : tr("scanner.scan", "סרוק")}
            </button>
          </div>
        </div>
      )}

      {/* ── בורר מנועים (רק כשאין סרגל-כותרת חיצוני) ── */}
      {showControls && !compactMode && (
        <EngineSelector
          value={engineRunMode}
          onChange={setEngineRunMode}
          customEngines={customEngines}
          onCustomEnginesChange={setCustomEngines}
          engineMeta={engineMeta}
          tr={tr}
        />
      )}

      {/* ── לוח מנועים חי ── */}
      {(telemetry || isProcessing) && <EngineTelemetryBoard telemetry={telemetry} tr={tr} />}

      {/* ── קנבאס מפוצל ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex min-h-[220px] flex-col rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
          <div className="mb-2 text-[12px] text-[color:var(--foreground-muted)]">{tr("scanner.sourceDocument", "מסמך מקור")}</div>
          <div className="min-h-0 flex-1 overflow-auto">
            {previewUrl ? (
              <ScanFilePreview url={previewUrl} mime={previewMime} fileName={fileName} emptyLabel={tr("scanner.noPreview", "אין תצוגה מקדימה")} />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-full min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-[12px] transition ${
                  isDragging ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5" : "border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                <UploadCloud size={28} aria-hidden />
                {tr("scanner.dropOrClick", "גרור קובץ לכאן או לחץ להעלאה")}
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-[220px] min-w-0 flex-col gap-3 overflow-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
          <LiveExtractionPanel v5={v5} validation={validation} tr={tr} />
          {pendingAnalysis && (
            <div className="border-t border-[color:var(--border-main)] pt-3">
              <ScanFullEditor
                analysis={pendingAnalysis}
                onChange={setPendingAnalysis}
                onClose={() => setPendingAnalysis(null)}
                onConfirm={() => void executeUnifiedSave()}
                tr={tr}
                embeddedInScrollParent
                confirmLabel={tr("scanner.save", "שמור")}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── סרגל שמירה מעוגן ── */}
      {hasResult && (
        <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <ScanDestinationPicker
              values={saveTargets}
              onChange={lockedSaveTargets ? () => {} : setSaveTargets}
              hasProject={!!boundProjectId}
              tr={tr}
            />
          </div>
          <button
            type="button"
            onClick={() => void executeUnifiedSave()}
            disabled={isSaving || saveTargets.length === 0}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} aria-hidden />}
            {tr("scanner.save", "שמור")}
          </button>
        </div>
      )}
    </div>
  );
}
