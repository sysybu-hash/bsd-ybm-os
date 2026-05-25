"use client";

import React from "react";
import { Zap, Bot, FileText } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { formatTelemetrySummaryHe } from "@/lib/scan-telemetry-display";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { AiScannerWidgetProps } from "./ai-scanner/types";
import { useAiScannerState } from "./ai-scanner/useAiScannerState";
import { ScanDropZone } from "./ai-scanner/ScanDropZone";
import { ScanConfirmPanel } from "./ai-scanner/ScanConfirmPanel";
import { ScanHistorySidebar } from "./ai-scanner/ScanHistorySidebar";
import { ScanHeaderToolbar } from "./ai-scanner/ScanHeaderToolbar";
import { ScanFloatingPanels } from "./ai-scanner/ScanFloatingPanels";

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
    scanModes, fileInputRef, fileAccept,
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

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] md:flex-row ${
        embeddedInHub ? "[&_.workspace-window]:hidden" : ""
      }`}
      data-embedded-in-hub={embeddedInHub ? "true" : undefined}
      dir={dir}
    >
      <ScanHistorySidebar
        history={history}
        onDelete={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
        tr={tr}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <ScanConfirmPanel
            analysis={pendingAnalysis}
            onChange={setPendingAnalysis}
            onClose={() => setPendingAnalysis(null)}
            onConfirm={() => void confirmAnalysis()}
            tr={tr}
          />
        ) : (
          <Group
            orientation={stackScannerPanels ? "vertical" : "horizontal"}
            className="min-h-0 flex-1"
          >
            <Panel
              defaultSize={stackScannerPanels ? 42 : 48}
              minSize={stackScannerPanels ? 24 : 28}
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
                onDrop={onDrop}
                onFileInputChange={onFileInputChange}
                applyFilePreview={applyFilePreview}
                t={t}
                tr={tr}
              />
            </Panel>
            <Separator
              className={
                stackScannerPanels
                  ? "h-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40"
                  : "w-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40"
              }
            />
            <Panel
              defaultSize={stackScannerPanels ? 58 : 52}
              minSize={stackScannerPanels ? 28 : 28}
              className="flex min-h-0 flex-col p-3"
            >
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("scanner.results")}
              </p>
              <p className="mb-2 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {tr("scanner.telemetry", "טלמטריה")}: {formatTelemetrySummaryHe(telemetry)}
              </p>
              <pre className="custom-scrollbar flex-1 overflow-auto rounded-xl border border-[color:var(--border-main)] bg-black/20 p-3 text-[10px] leading-relaxed">
                {resultJson || tr("scanner.noPreview", "אין תוצאה עדיין")}
              </pre>
            </Panel>
          </Group>
        )}

        {/* Engine status bar */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-[color:var(--border-main)] p-2 sm:gap-2">
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Zap size={14} className="mx-auto text-blue-500" />
            <div className="text-[9px] font-bold text-[color:var(--foreground-muted)]">
              {tr("scanner.engineActive", "מנוע")}
            </div>
            <div className="text-[10px] font-black truncate">{activeEngineLabel}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Bot size={14} className="mx-auto text-purple-500" />
            <div className="text-[9px] font-bold">
              {engineMeta?.configured.gemini ? "Gemini ✓" : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <FileText size={14} className="mx-auto text-emerald-500" />
            <div className="text-[9px] font-bold">
              {engineMeta?.configured.openai ? "OpenAI ✓" : "—"}
            </div>
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
