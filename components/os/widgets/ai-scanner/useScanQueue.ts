"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ScanUiPhase } from "./ScanControlBar";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { WidgetType } from "@/hooks/use-window-manager";
import { defaultScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";
import { useScanQueueExecution } from "./useScanQueueExecution";
import { useScanQueueSave } from "./useScanQueueSave";
import { useScanQueueNavigation } from "./useScanQueueNavigation";

export type UseScanQueueArgs = {
  engineRunMode: TriEngineRunMode;
  customEngines?: string[];
  scanModeOverride: ScanModeUiSelection;
  boundProjectId: string;
  userInstruction: string;
  industryId: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  tr: (key: string, fallback: string) => string;
  defaultSaveTargets?: UnifiedSaveTarget[];
  lockedSaveTargets?: UnifiedSaveTarget[];
  onSaveComplete?: () => void;
};

export function useScanQueue({
  engineRunMode,
  customEngines,
  scanModeOverride,
  boundProjectId,
  userInstruction,
  industryId,
  openWorkspaceWidget,
  tr,
  defaultSaveTargets = ["erp"],
  lockedSaveTargets,
  onSaveComplete,
}: UseScanQueueArgs) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueProgress, setQueueProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<DocumentAnalysis | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [telemetry, setTelemetry] = useState<TriEngineTelemetry | null>(null);
  const [resultJson, setResultJson] = useState<string>("");
  const [scanClassification, setScanClassification] = useState<{
    scanMode: string;
    confidence: number;
    rationale?: string;
    uncertain?: boolean;
  } | null>(null);
  const [lastScanV5, setLastScanV5] = useState<ScanExtractionV5 | null>(null);
  const [lastScanFileName, setLastScanFileName] = useState("");
  const [savingNotebook, setSavingNotebook] = useState(false);
  const [sessionPhase, setSessionPhase] = useState<"idle" | "intake" | "processing" | "review" | "save">("idle");
  const [saveTargets, setSaveTargets] = useState<UnifiedSaveTarget[]>(defaultSaveTargets);
  const [activeScanFile, setActiveScanFile] = useState<File | null>(null);
  const [showBlueprintFork, setShowBlueprintFork] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const scanUiPhase: ScanUiPhase = useMemo(() => {
    if (sessionPhase === "save") return "save";
    if (isProcessing || sessionPhase === "processing") return "processing";
    if (pendingAnalysis || sessionPhase === "review") return "review";
    if (lastScanV5) return "results";
    return "idle";
  }, [isProcessing, pendingAnalysis, lastScanV5, sessionPhase]);

  const { applyFilePreview, validateScanFile, runFileQueue, startScan, stopScan } = useScanQueueExecution({
    isProcessing,
    pendingFiles,
    queue,
    previewUrl,
    abortRef,
    engineRunMode,
    customEngines,
    scanModeOverride,
    boundProjectId,
    userInstruction,
    industryId,
    openWorkspaceWidget,
    tr,
    setSessionPhase,
    setQueue,
    setIsProcessing,
    setQueueProgress,
    setPendingAnalysis,
    setResultJson,
    setTelemetry,
    setScanClassification,
    setLastScanV5,
    setLastScanFileName,
    setActiveScanFile,
    setShowBlueprintFork,
    setHistory,
    setPreviewUrl,
    setPreviewMime,
    setPreviewFileName,
    setPendingFiles,
  });

  const {
    resetScanState,
    goBackScanStep,
    startNewScan,
    rescanLastFile,
    dismissBlueprintFork,
    openTakeoffForBlueprint,
    addFiles,
    removePendingFile,
    clearPending,
  } = useScanQueueNavigation({
    defaultSaveTargets,
    previewUrl,
    sessionPhase,
    pendingAnalysis,
    lastScanV5,
    lastScanFileName,
    queue,
    isProcessing,
    boundProjectId,
    tr,
    openWorkspaceWidget,
    abortRef,
    validateScanFile,
    applyFilePreview,
    runFileQueue,
    setQueue,
    setPendingFiles,
    setIsProcessing,
    setQueueProgress,
    setPendingAnalysis,
    setResultJson,
    setTelemetry,
    setScanClassification,
    setLastScanV5,
    setLastScanFileName,
    setPreviewUrl,
    setPreviewMime,
    setPreviewFileName,
    setSessionPhase,
    setSaveTargets,
    setActiveScanFile,
    setShowBlueprintFork,
    setIsSaving,
  });

  const { saveToNotebook, goToSaveStep, executeUnifiedSave, confirmAnalysis, approveBlueprintBoq } =
    useScanQueueSave({
      pendingAnalysis,
      activeScanFile,
      queue,
      lastScanFileName,
      lastScanV5,
      saveTargets,
      defaultSaveTargets,
      lockedSaveTargets,
      boundProjectId,
      telemetry,
      tr,
      openWorkspaceWidget,
      onSaveComplete,
      setSavingNotebook,
      setIsSaving,
      setHistory,
      setPendingAnalysis,
      setShowBlueprintFork,
      setSessionPhase,
      setSaveTargets,
    });

  const continueToSaveStep = useCallback(() => {
    goToSaveStep();
  }, [goToSaveStep]);

  const hasFailedItems = queue.some((q) => q.status === "error");

  return {
    pendingFiles,
    addFiles,
    removePendingFile,
    clearPending,
    startScan,
    queue,
    isProcessing,
    queueProgress,
    pendingAnalysis,
    setPendingAnalysis,
    history,
    setHistory,
    telemetry,
    resultJson,
    scanClassification,
    lastScanV5,
    setLastScanV5,
    lastScanFileName,
    setLastScanFileName,
    savingNotebook,
    previewUrl,
    previewMime,
    previewFileName,
    applyFilePreview,
    runFileQueue,
    confirmAnalysis,
    saveToNotebook,
    scanUiPhase,
    stopScan,
    goBackScanStep,
    continueToSaveStep,
    resetScanState,
    sessionPhase,
    setSessionPhase,
    saveTargets,
    setSaveTargets,
    startNewScan,
    goToSaveStep,
    executeUnifiedSave,
    showBlueprintFork,
    dismissBlueprintFork,
    openTakeoffForBlueprint,
    approveBlueprintBoq,
    lockedSaveTargets,
    isSaving,
    rescanLastFile,
    hasFailedItems,
  };
}

export { defaultScanModeForIndustry, getScanModesForUi };
