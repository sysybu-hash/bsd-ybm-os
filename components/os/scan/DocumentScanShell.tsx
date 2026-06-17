"use client";

import React from "react";
import ScanFilePreview from "@/components/os/widgets/scan/ScanFilePreview";
import { ScanIntakePhase } from "./phases/ScanIntakePhase";
import { ScanProcessingPhase } from "./phases/ScanProcessingPhase";
import { ScanReviewPhase } from "./phases/ScanReviewPhase";
import { ScanSavePhase } from "./phases/ScanSavePhase";
import { ScanHistoryPanel } from "./shared/ScanHistoryPanel";
import { BlueprintForkDialog } from "./blueprint/BlueprintForkDialog";
import type { useAiScannerState } from "@/components/os/widgets/ai-scanner/useAiScannerState";

type ScannerState = ReturnType<typeof useAiScannerState>;

type DocumentScanShellProps = {
  state: ScannerState;
  embeddedInHub?: boolean;
  /** כשה-HeaderToolbar כבר מציג מנועים/מצב — לא לשכפל ב-Intake */
  showIntakeControls?: boolean;
};

/**
 * מעטפת מאוחדת לסורק — שלבי intake → processing → review → save.
 */
export function DocumentScanShell({
  state,
  embeddedInHub = false,
  showIntakeControls = true,
}: DocumentScanShellProps) {
  const {
    t,
    tr,
    scanModes,
    fileInputRef,
    cameraInputRef,
    fileAccept,
    isDragging,
    setIsDragging,
    engineMeta,
    engineRunMode,
    setEngineRunMode,
    scanModeOverride,
    setScanModeOverride,
    onDrop,
    onFileInputChange,
    boundProjectId,
    scanQueue,
  } = state;

  const {
    pendingFiles,
    queue,
    isProcessing,
    queueProgress,
    pendingAnalysis,
    setPendingAnalysis,
    previewUrl,
    previewMime,
    previewFileName,
    applyFilePreview,
    sessionPhase,
    saveTargets,
    setSaveTargets,
    startNewScan,
    goToSaveStep,
    executeUnifiedSave,
    showBlueprintFork,
    dismissBlueprintFork,
    openTakeoffForBlueprint,
    approveBlueprintBoq,
    isSaving,
    lastScanFileName,
    goBackScanStep,
  } = scanQueue;

  /** ב-Hub הגלילה נעשית ברמת ה-pane — לא בחלונית פנימית צרה */
  const useInnerScroll = !embeddedInHub && (sessionPhase === "review" || sessionPhase === "save");

  const hubScrollClass =
    "custom-scrollbar w-full min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-24 [-webkit-overflow-scrolling:touch] [touch-action:pan-y]";

  const wrapEditorScroll = (content: React.ReactNode) =>
    useInnerScroll ? (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className={hubScrollClass}>{content}</div>
      </div>
    ) : (
      <div className="w-full min-w-0">{content}</div>
    );

  const body = (() => {
    if (sessionPhase === "save" && pendingAnalysis) {
      return wrapEditorScroll(
        <ScanSavePhase
          saveTargets={saveTargets}
          onSaveTargetsChange={setSaveTargets}
          hasProject={!!boundProjectId}
          fileName={lastScanFileName || previewFileName}
          vendor={pendingAnalysis.vendor}
          amount={pendingAnalysis.amount}
          tr={tr}
          onSave={() => void executeUnifiedSave()}
          onNewScan={() => {
            startNewScan();
            fileInputRef.current?.click();
          }}
          saving={isSaving}
        />,
      );
    }

    if (sessionPhase === "review" && pendingAnalysis) {
      return wrapEditorScroll(
        <ScanReviewPhase
          analysis={pendingAnalysis}
          onChange={setPendingAnalysis}
          onClose={() => setPendingAnalysis(null)}
          onContinueToSave={goToSaveStep}
          tr={tr}
          embeddedInScrollParent={useInnerScroll}
        />,
      );
    }

    if (isProcessing || sessionPhase === "processing") {
      return <ScanProcessingPhase queue={queue} queueProgress={queueProgress} tr={tr} />;
    }

    const sidebarClass = embeddedInHub
      ? "flex w-full shrink-0 flex-col gap-2 border-b border-[color:var(--border-main)] p-2 md:w-56 md:border-b-0 md:border-e"
      : "hidden w-72 shrink-0 flex-col gap-2 p-2 lg:flex";

    return (
      <div
        className={`flex min-h-0 flex-1 flex-col ${embeddedInHub ? "md:flex-row" : "lg:flex-row"}`}
      >
        <aside className={sidebarClass}>
          <ScanFilePreview
            url={previewUrl}
            mime={previewMime}
            fileName={previewFileName}
            emptyLabel={tr("scanner.noPreview", "אין תצוגה מקדימה")}
          />
          <ScanHistoryPanel tr={tr} />
        </aside>
        <div className="min-h-0 flex-1">
          <ScanIntakePhase
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            isProcessing={isProcessing}
            queue={queue}
            queueProgress={queueProgress}
            previewUrl={previewUrl}
            previewMime={previewMime}
            previewFileName={previewFileName}
            fileAccept={fileAccept}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            onDrop={onDrop}
            onFileInputChange={onFileInputChange}
            applyFilePreview={applyFilePreview}
            engineRunMode={engineRunMode}
            setEngineRunMode={setEngineRunMode}
            engineMeta={engineMeta}
            scanModeOverride={scanModeOverride}
            setScanModeOverride={setScanModeOverride}
            scanModes={scanModes}
            t={t}
            tr={tr}
            showControls={showIntakeControls}
          />
        </div>
      </div>
    );
  })();

  return (
    <>
      {body}
      <BlueprintForkDialog
        open={showBlueprintFork}
        fileName={lastScanFileName || previewFileName}
        tr={tr}
        onApproveAi={() => void approveBlueprintBoq()}
        onTakeoff={openTakeoffForBlueprint}
        onDismiss={dismissBlueprintFork}
      />
      {sessionPhase === "review" && pendingAnalysis ? null : (
        <button type="button" className="sr-only" onClick={goBackScanStep} aria-hidden />
      )}
    </>
  );
}
