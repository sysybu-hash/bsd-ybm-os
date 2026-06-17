"use client";

import React from "react";
import { X } from "lucide-react";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { AiScannerWidgetProps } from "./ai-scanner/types";
import { useAiScannerState } from "./ai-scanner/useAiScannerState";
import { ScanHistorySidebar } from "./ai-scanner/ScanHistorySidebar";
import { ScanHeaderToolbar } from "./ai-scanner/ScanHeaderToolbar";
import { ScanFloatingPanels } from "./ai-scanner/ScanFloatingPanels";
import { ScanControlBar } from "./ai-scanner/ScanControlBar";
import { DocumentScanShell } from "@/components/os/scan/DocumentScanShell";

export default function AiScannerWidget({
  liveData = null,
  openWorkspaceWidget,
  embeddedInHub = false,
}: AiScannerWidgetProps) {
  const s = useAiScannerState({
    liveData,
    openWorkspaceWidget: embeddedInHub ? undefined : openWorkspaceWidget,
  });
  const {
    t,
    dir,
    tr,
    scannerPrefix,
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
    userInstruction,
    persistInstruction,
    instructionsOpen,
    setInstructionsOpen,
    previewPanelOpen,
    setPreviewPanelOpen,
    resultsPanelOpen,
    setResultsPanelOpen,
    stackScannerPanels,
    boundProjectName,
    projectsList,
    projectsListLoading,
    showProjectPicker,
    selectProject,
    clearProject,
    scanQueue,
    openPreviewPanel,
    onDrop,
    onFileInputChange,
    pushScannerView,
  } = s;

  const {
    pendingFiles,
    startScan,
    clearPending,
    removePendingFile,
    queue,
    isProcessing,
    queueProgress,
    pendingAnalysis,
    setPendingAnalysis,
    history,
    setHistory,
    telemetry,
    lastScanV5,
    lastScanFileName,
    savingNotebook,
    previewUrl,
    previewMime,
    previewFileName,
    applyFilePreview,
    confirmAnalysis,
    saveToNotebook,
    scanUiPhase,
    stopScan,
    goBackScanStep,
    continueToSaveStep,
    resetScanState,
    scanClassification,
  } = scanQueue;

  if (showProjectPicker) {
    return (
      <ProjectPickerPanel
        projects={projectsList}
        loading={projectsListLoading}
        onSelect={selectProject}
        titleKey={`${scannerPrefix}.pickProjectTitle`}
        descKey={`${scannerPrefix}.pickProjectDesc`}
        loadingKey={`${scannerPrefix}.pickProjectLoading`}
        emptyKey={`${scannerPrefix}.noProjects`}
        openCrmKey={openWorkspaceWidget ? `${scannerPrefix}.openCrm` : undefined}
        onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
      />
    );
  }

  const constrainToViewport = !embeddedInHub;
  const useNaturalHeightLayout = embeddedInHub || stackScannerPanels;

  return (
    <div
      className={`flex min-h-0 flex-col overflow-x-hidden bg-transparent text-[color:var(--foreground-main)] ${
        constrainToViewport ? "h-full" : ""
      } ${embeddedInHub ? "[&_.workspace-window]:hidden" : ""}`}
      data-embedded-in-hub={embeddedInHub ? "true" : undefined}
      dir={dir}
    >
      <ScanHistorySidebar
        history={history}
        onDelete={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
        tr={tr}
      />

      <div
        className={
          useNaturalHeightLayout
            ? "flex flex-col"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        <ScanHeaderToolbar
          t={t}
          tr={tr}
          scannerPrefix={scannerPrefix}
          boundProjectName={boundProjectName ?? ""}
          clearProject={clearProject}
          userInstruction={userInstruction}
          persistInstruction={persistInstruction}
          setInstructionsOpen={setInstructionsOpen}
          openPreviewPanel={openPreviewPanel}
          queue={queue}
          previewUrl={previewUrl}
          lastScanV5={lastScanV5}
          setResultsPanelOpen={setResultsPanelOpen}
          pushScannerView={pushScannerView}
          scanClassification={scanClassification}
          engineRunMode={engineRunMode}
          scanModeOverride={scanModeOverride}
          setScanModeOverride={setScanModeOverride}
          scanModes={scanModes}
          engineMeta={engineMeta}
          setEngineRunMode={setEngineRunMode}
          pendingCount={pendingFiles.length}
          onPickFiles={() => fileInputRef.current?.click()}
          onStartScan={() => void startScan()}
        />

        <div
          className={
            useNaturalHeightLayout
              ? "flex flex-col"
              : "flex min-h-0 flex-1 flex-col overflow-hidden"
          }
        >
          <DocumentScanShell state={s} embeddedInHub={embeddedInHub} showIntakeControls={false} />
        </div>

        {pendingFiles.length > 0 && scanUiPhase === "idle" ? (
          <div className="shrink-0 border-t border-[color:var(--border-main)]/80 bg-amber-500/5 px-3 py-2">
            <p className="mb-1.5 text-[11px] font-black text-amber-600 dark:text-amber-400">
              {pendingFiles.length}{" "}
              {tr(`${scannerPrefix}.filesReady`, "קבצים מוכנים לסריקה — לחץ «סרוק עכשיו»")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pendingFiles.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex max-w-[12rem] items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-[10px] font-bold"
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
                    aria-label={tr(`${scannerPrefix}.removeFile`, "הסר")}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="bg-[color:var(--surface-card)]">
          <ScanControlBar
            phase={scanUiPhase}
            t={t}
            tr={tr}
            hasContent={queue.length > 0 || !!lastScanV5 || !!pendingAnalysis || isProcessing}
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
      </div>

      <ScanFloatingPanels
        tr={tr}
        instructionsOpen={instructionsOpen}
        setInstructionsOpen={setInstructionsOpen}
        userInstruction={userInstruction}
        persistInstruction={persistInstruction}
        previewPanelOpen={previewPanelOpen}
        setPreviewPanelOpen={setPreviewPanelOpen}
        previewUrl={previewUrl}
        previewMime={previewMime}
        previewFileName={previewFileName}
        queue={queue}
        applyFilePreview={applyFilePreview}
        resultsPanelOpen={resultsPanelOpen}
        setResultsPanelOpen={setResultsPanelOpen}
        lastScanV5={lastScanV5}
        lastScanFileName={lastScanFileName}
        telemetry={telemetry}
        pendingAnalysis={pendingAnalysis}
        confirmAnalysis={confirmAnalysis}
        saveToNotebook={saveToNotebook}
        savingNotebook={savingNotebook}
      />
    </div>
  );
}
