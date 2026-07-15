"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import { canBrowserPreviewMime } from "@/lib/scan-preview";
import type { QueueItem } from "./types";
import { formatMsg } from "./constants";
import { runScanQueueBatch } from "./runScanQueueBatch";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { DocumentAnalysis, ScanHistoryItem } from "./types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

export type ScanQueueExecutionState = {
  isProcessing: boolean;
  pendingFiles: File[];
  queue: QueueItem[];
  previewUrl: string | null;
  abortRef: MutableRefObject<AbortController | null>;
  engineRunMode: TriEngineRunMode;
  customEngines?: string[];
  scanModeOverride: ScanModeUiSelection;
  boundProjectId: string;
  userInstruction: string;
  industryId: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  tr: (key: string, fallback: string) => string;
  setSessionPhase: Dispatch<SetStateAction<"idle" | "intake" | "processing" | "review" | "save">>;
  setQueue: Dispatch<SetStateAction<QueueItem[]>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setQueueProgress: Dispatch<SetStateAction<{ current: number; total: number; name: string } | null>>;
  setPendingAnalysis: Dispatch<SetStateAction<DocumentAnalysis | null>>;
  setResultJson: Dispatch<SetStateAction<string>>;
  setTelemetry: Dispatch<SetStateAction<TriEngineTelemetry | null>>;
  setScanClassification: Dispatch<
    SetStateAction<{
      scanMode: string;
      confidence: number;
      rationale?: string;
      uncertain?: boolean;
    } | null>
  >;
  setLastScanV5: Dispatch<SetStateAction<ScanExtractionV5 | null>>;
  setLastScanFileName: Dispatch<SetStateAction<string>>;
  setActiveScanFile: Dispatch<SetStateAction<File | null>>;
  setShowBlueprintFork: Dispatch<SetStateAction<boolean>>;
  setHistory: Dispatch<SetStateAction<ScanHistoryItem[]>>;
  setPreviewUrl: Dispatch<SetStateAction<string | null>>;
  setPreviewMime: Dispatch<SetStateAction<string | null>>;
  setPreviewFileName: Dispatch<SetStateAction<string>>;
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
};

export function useScanQueueExecution(state: ScanQueueExecutionState) {
  const {
    isProcessing,
    pendingFiles,
    previewUrl,
    abortRef,
    tr,
    setIsProcessing,
    setQueue,
    setQueueProgress,
    setPendingFiles,
    setPreviewFileName,
    setPreviewMime,
    setPreviewUrl,
    ...batchState
  } = state;

  const applyFilePreview = useCallback(
    (file: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
      setPreviewFileName(file.name);
      setPreviewMime(mime);
      if (canBrowserPreviewMime(mime)) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }
    },
    [previewUrl, setPreviewFileName, setPreviewMime, setPreviewUrl],
  );

  const validateScanFile = useCallback(
    (file: File): string | null => {
      if (file.size > MAX_SCAN_FILE_BYTES) {
        return formatMsg(tr("scanner.fileTooLarge", "קובץ גדול מדי: {name}"), { name: file.name });
      }
      const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
      if (!isSupportedScanMime(mime)) {
        return formatMsg(tr("scanner.unsupportedFile", "לא נתמך: {name}"), { name: file.name });
      }
      return null;
    },
    [tr],
  );

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setQueueProgress(null);
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "processing"
          ? { ...q, status: "error", error: tr("scanner.scanStopped", "הסריקה הופסקה") }
          : q,
      ),
    );
    toast.message(tr("scanner.scanStopped", "הסריקה הופסקה"));
  }, [abortRef, setIsProcessing, setQueue, setQueueProgress, tr]);

  const runFileQueue = useCallback(
    async (files: File[], customInstructions?: string) => {
      if (!files.length || isProcessing) return;

      const valid: File[] = [];
      for (const file of files) {
        const err = validateScanFile(file);
        if (err) toast.error(err);
        else valid.push(file);
      }
      if (!valid.length) return;

      const initialQueue: QueueItem[] = valid.map((file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: "pending",
      }));

      await runScanQueueBatch({
        ...batchState,
        abortRef,
        tr,
        setQueue,
        setIsProcessing,
        setQueueProgress,
        applyFilePreview,
        valid,
        initialQueue,
        userInstruction: customInstructions ?? batchState.userInstruction,
      });
    },
    [
      abortRef,
      applyFilePreview,
      batchState,
      isProcessing,
      setIsProcessing,
      setQueue,
      setQueueProgress,
      tr,
      validateScanFile,
    ],
  );

  const startScan = useCallback(async () => {
    if (!pendingFiles.length || isProcessing) return;
    const files = pendingFiles;
    setPendingFiles([]);
    await runFileQueue(files);
  }, [pendingFiles, isProcessing, runFileQueue, setPendingFiles]);

  return {
    applyFilePreview,
    validateScanFile,
    runFileQueue,
    startScan,
    stopScan,
  };
}
