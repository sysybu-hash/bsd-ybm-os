"use client";

import React from "react";
import { Zap, Bot, FileText } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { formatTelemetrySummaryHe } from "@/lib/scan-telemetry-display";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { AiScannerWidgetProps } from "./ai-scanner/types";
import { useAiScannerState } from "./ai-scanner/useAiScannerState";
import { ScanDropZone } from "./ai-scanner/ScanDropZone";
import { ScanFullEditor } from "./ai-scanner/ScanFullEditor";
import { ScanHistorySidebar } from "./ai-scanner/ScanHistorySidebar";
import { ScanHeaderToolbar } from "./ai-scanner/ScanHeaderToolbar";
import { ScanFloatingPanels } from "./ai-scanner/ScanFloatingPanels";
import { ScanControlBar } from "./ai-scanner/ScanControlBar";

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
    t, dir, tr, scannerPrefix,
    scanModes, fileInputRef, cameraInputRef, fileAccept,
    isDragging, setIsDragging,
    engineMeta, engineRunMode, setEngineRunMode,
    scanModeOverride, setScanModeOverride,
    userInstruction, persistInstruction,
    instructionsOpen, setInstructionsOpen,
    previewPanelOpen, setPreviewPanelOpen,
    resultsPanelOpen, setResultsPanelOpen,
    stackScannerPanels,
    boundProjectName,
    projectsList, projectsListLoading, showProjectPicker, selectProject, clearProject,
    scanQueue,
    activeEngineLabel,
    openPreviewPanel, onDrop, onFileInputChange,
    pushScannerView,
  } = s;

  const {
    queue, isProcessing, queueProgress,
    pendingAnalysis, setPendingAnalysis,
    history, setHistory,
    telemetry, resultJson, scanClassification,
    lastScanV5, lastScanFileName,
    savingNotebook, previewUrl, previewMime, previewFileName,
    applyFilePreview, confirmAnalysis, saveToNotebook,
    scanUiPhase, stopScan, goBackScanStep, continueToSaveStep, resetScanState,
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

  const inEditorMode = !!pendingAnalysis;
  const constrainToViewport = !embeddedInHub || inEditorMode;
  const useNaturalHeightLayout = (stackScannerPanels || embeddedInHub) && !inEditorMode;
  const useInnerEditorScroll = inEditorMode && (embeddedInHub || constrainToViewport);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-x-hidden bg-transparent text-[color:var(--foreground-main)] ${
        constrainToViewport ? "h-full" : ""
      } ${embeddedInHub ? "[&_.workspace-window]:hidden" : ""}`}
      data-embedded-in-hub={embeddedInHub ? "true" : undefined}
      data-hub-inner-scroll={embeddedInHub && inEditorMode ? "true" : undefined}
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
          t={t} tr={tr} scannerPrefix={scannerPrefix}
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
        />

        {/* Body */}
        {pendingAnalysis ? (
          useInnerEditorScroll ? (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
              <ScanFullEditor
                analysis={pendingAnalysis}
                onChange={setPendingAnalysis}
                onClose={() => setPendingAnalysis(null)}
                onConfirm={() => void confirmAnalysis()}
                tr={tr}
                embeddedInScrollParent
              />
            </div>
          ) : (
            <ScanFullEditor
              analysis={pendingAnalysis}
              onChange={setPendingAnalysis}
              onClose={() => setPendingAnalysis(null)}
              onConfirm={() => void confirmAnalysis()}
              tr={tr}
            />
          )
        ) : stackScannerPanels ? (
          /* Mobile: natural-height panels — parent scrolls */
          <div className="flex flex-col">
            <div className="min-h-[42vh]">
              <ScanDropZone
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                isProcessing={isProcessing}
                queue={queue}
                queueProgress={queueProgress}
                hasPendingAnalysis={!!pendingAnalysis}
                previewUrl={previewUrl}
                previewMime={previewMime}
                previewFileName={previewFileName}
                fileAccept={fileAccept}
                fileInputRef={fileInputRef}
                cameraInputRef={cameraInputRef}
                onDrop={onDrop}
                onFileInputChange={onFileInputChange}
                applyFilePreview={applyFilePreview}
                t={t}
                tr={tr}
              />
            </div>
            <div className="h-1.5 bg-[color:var(--border-main)]" />
            <div className="flex min-h-[40vh] flex-col p-2">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("scanner.results")}
              </p>
              <p className="mb-2 rounded-lg border border-[color:var(--border-main)]/60 bg-[color:var(--surface-card)]/50 px-2 py-1 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {tr("scanner.telemetry", "טלמטריה")}: {formatTelemetrySummaryHe(telemetry)}
              </p>
              <pre className="custom-scrollbar min-h-[20vh] overflow-auto rounded-2xl border border-[color:var(--border-main)]/80 bg-gradient-to-b from-black/25 to-[color:var(--surface-card)]/20 p-3 text-[10px] leading-relaxed backdrop-blur-sm">
                {resultJson || tr("scanner.noPreview", "אין תוצאה עדיין")}
              </pre>
            </div>
          </div>
        ) : (
          /* Desktop: fixed resizable panels */
          <Group
            orientation="horizontal"
            className={embeddedInHub ? "min-h-[42vh]" : "min-h-0 flex-1"}
          >
            <Panel
              defaultSize={48}
              minSize={28}
              className="flex min-h-0 flex-col"
            >
              <ScanDropZone
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                isProcessing={isProcessing}
                queue={queue}
                queueProgress={queueProgress}
                hasPendingAnalysis={!!pendingAnalysis}
                previewUrl={previewUrl}
                previewMime={previewMime}
                previewFileName={previewFileName}
                fileAccept={fileAccept}
                fileInputRef={fileInputRef}
                cameraInputRef={cameraInputRef}
                onDrop={onDrop}
                onFileInputChange={onFileInputChange}
                applyFilePreview={applyFilePreview}
                t={t}
                tr={tr}
              />
            </Panel>
            <Separator className="w-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40" />
            <Panel
              defaultSize={52}
              minSize={28}
              className="flex min-h-0 flex-col p-3"
            >
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("scanner.results")}
              </p>
              <p className="mb-2 rounded-lg border border-[color:var(--border-main)]/60 bg-[color:var(--surface-card)]/50 px-2 py-1 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {tr("scanner.telemetry", "טלמטריה")}: {formatTelemetrySummaryHe(telemetry)}
              </p>
              <pre className="custom-scrollbar flex-1 min-h-0 overflow-auto overflow-x-hidden rounded-2xl border border-[color:var(--border-main)]/80 bg-gradient-to-b from-black/25 to-[color:var(--surface-card)]/20 p-3 text-[10px] leading-relaxed backdrop-blur-sm">
                {resultJson || tr("scanner.noPreview", "אין תוצאה עדיין")}
              </pre>
            </Panel>
          </Group>
        )}

        <ScanControlBar
          phase={scanUiPhase}
          t={t}
          onStop={stopScan}
          onBack={goBackScanStep}
          onContinueToSave={pendingAnalysis ? continueToSaveStep : undefined}
          onCancel={resetScanState}
        />

        {/* Engine status bar — compact row on mobile, 3-column on desktop */}
        <div className="border-t border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/30 backdrop-blur-sm">
          {/* Mobile: single compact line */}
          <div className="flex items-center gap-2 px-3 py-1.5 sm:hidden">
            <Zap size={12} className="shrink-0 text-blue-500" />
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
              {tr("scanner.engineActive", "מנוע")}:
            </span>
            <span className="truncate text-[10px] font-black">{activeEngineLabel}</span>
            {engineMeta?.configured.gemini ? (
              <span className="ms-auto shrink-0 text-[9px] font-bold text-purple-500">Gemini ✓</span>
            ) : null}
            {engineMeta?.configured.mistral ? (
              <span className="shrink-0 text-[9px] font-bold text-orange-500">Pixtral ✓</span>
            ) : null}
          </div>
          {/* Desktop: 3 cards */}
          <div className="hidden gap-2 p-2 sm:grid sm:grid-cols-3">
            <div className="rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/60 p-2.5 text-center shadow-sm">
              <Zap size={14} className="mx-auto text-blue-500" />
              <div className="text-[9px] font-bold text-[color:var(--foreground-muted)]">
                {tr("scanner.engineActive", "מנוע")}
              </div>
              <div className="truncate text-[10px] font-black">{activeEngineLabel}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/60 p-2.5 text-center shadow-sm">
              <Bot size={14} className="mx-auto text-purple-500" />
              <div className="text-[9px] font-bold">
                {engineMeta?.configured.gemini ? "Gemini ✓" : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/60 p-2.5 text-center shadow-sm">
              <FileText size={14} className="mx-auto text-emerald-500" />
              <div className="text-[9px] font-bold">
                {engineMeta?.configured.openai ? "OpenAI ✓" : "—"}
              </div>
            </div>
            {engineMeta?.configured.mistral ? (
              <div className="rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/60 p-2.5 text-center shadow-sm">
                <span className="mx-auto block text-[10px]">🟠</span>
                <div className="text-[9px] font-bold text-orange-500">Pixtral ✓</div>
              </div>
            ) : null}
          </div>
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
