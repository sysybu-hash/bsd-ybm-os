"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { DocumentAnalysis, QueueItem } from "./types";

export type ScanQueueNavigationArgs = {
  defaultSaveTargets: import("@/lib/scan/unified-scan-types").UnifiedSaveTarget[];
  previewUrl: string | null;
  sessionPhase: "idle" | "intake" | "processing" | "review" | "save";
  pendingAnalysis: DocumentAnalysis | null;
  lastScanV5: import("@/lib/scan-schema-v5").ScanExtractionV5 | null;
  lastScanFileName: string;
  queue: QueueItem[];
  isProcessing: boolean;
  boundProjectId: string;
  tr: (key: string, fallback: string) => string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  abortRef: React.MutableRefObject<AbortController | null>;
  validateScanFile: (file: File) => string | null;
  applyFilePreview: (file: File) => void;
  runFileQueue: (files: File[], customInstructions?: string) => Promise<void>;
  setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setQueueProgress: React.Dispatch<
    React.SetStateAction<{ current: number; total: number; name: string } | null>
  >;
  setPendingAnalysis: React.Dispatch<React.SetStateAction<DocumentAnalysis | null>>;
  setResultJson: React.Dispatch<React.SetStateAction<string>>;
  setTelemetry: React.Dispatch<
    React.SetStateAction<import("@/lib/tri-engine-extract").TriEngineTelemetry | null>
  >;
  setScanClassification: React.Dispatch<
    React.SetStateAction<{
      scanMode: string;
      confidence: number;
      rationale?: string;
      uncertain?: boolean;
    } | null>
  >;
  setLastScanV5: React.Dispatch<
    React.SetStateAction<import("@/lib/scan-schema-v5").ScanExtractionV5 | null>
  >;
  setLastScanFileName: React.Dispatch<React.SetStateAction<string>>;
  setPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewMime: React.Dispatch<React.SetStateAction<string | null>>;
  setPreviewFileName: React.Dispatch<React.SetStateAction<string>>;
  setSessionPhase: React.Dispatch<
    React.SetStateAction<"idle" | "intake" | "processing" | "review" | "save">
  >;
  setSaveTargets: React.Dispatch<
    React.SetStateAction<import("@/lib/scan/unified-scan-types").UnifiedSaveTarget[]>
  >;
  setActiveScanFile: React.Dispatch<React.SetStateAction<File | null>>;
  setShowBlueprintFork: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useScanQueueNavigation(args: ScanQueueNavigationArgs) {
  const {
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
  } = args;

  const resetScanState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQueue([]);
    setPendingFiles([]);
    setIsProcessing(false);
    setQueueProgress(null);
    setPendingAnalysis(null);
    setResultJson("");
    setTelemetry(null);
    setScanClassification(null);
    setLastScanV5(null);
    setLastScanFileName("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewFileName("");
    setSessionPhase("idle");
    setSaveTargets(defaultSaveTargets);
    setActiveScanFile(null);
    setShowBlueprintFork(false);
    setIsSaving(false);
  }, [
    abortRef,
    defaultSaveTargets,
    previewUrl,
    setActiveScanFile,
    setIsProcessing,
    setIsSaving,
    setLastScanFileName,
    setLastScanV5,
    setPendingAnalysis,
    setPendingFiles,
    setPreviewFileName,
    setPreviewMime,
    setPreviewUrl,
    setQueue,
    setQueueProgress,
    setResultJson,
    setSaveTargets,
    setScanClassification,
    setSessionPhase,
    setShowBlueprintFork,
    setTelemetry,
  ]);

  const goBackScanStep = useCallback(() => {
    if (sessionPhase === "save") {
      setSessionPhase("review");
      return;
    }
    if (pendingAnalysis) {
      setPendingAnalysis(null);
      setSessionPhase("idle");
      return;
    }
    if (lastScanV5) {
      setLastScanV5(null);
      setLastScanFileName("");
      setResultJson("");
      setSessionPhase("idle");
    }
  }, [
    lastScanV5,
    pendingAnalysis,
    sessionPhase,
    setLastScanFileName,
    setLastScanV5,
    setPendingAnalysis,
    setResultJson,
    setSessionPhase,
  ]);

  const rescanLastFile = useCallback(
    async (instruction: string) => {
      if (!instruction.trim()) return;
      const file =
        queue.find((q) => q.file.name === lastScanFileName)?.file ?? queue[queue.length - 1]?.file;
      if (!file) {
        toast.error(tr("scanner.noScanYet", "אין סריקה לשמירה"));
        return;
      }
      await runFileQueue([file], instruction.trim());
    },
    [lastScanFileName, queue, runFileQueue, tr],
  );

  const dismissBlueprintFork = useCallback(() => setShowBlueprintFork(false), [setShowBlueprintFork]);

  const openTakeoffForBlueprint = useCallback(() => {
    setShowBlueprintFork(false);
    if (!boundProjectId) {
      toast.info(tr("scanner.blueprintNoProject", "בחרו פרויקט ופתחו את לשונית כתב הכמויות"));
      return;
    }
    openWorkspaceWidget?.("project", {
      projectId: boundProjectId,
      tab: "financial",
      takeoff: true,
      blueprintFileName: lastScanFileName || undefined,
    });
  }, [boundProjectId, lastScanFileName, openWorkspaceWidget, setShowBlueprintFork, tr]);

  const addFiles = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      for (const f of files) {
        const err = validateScanFile(f);
        if (err) toast.error(err);
        else valid.push(f);
      }
      if (!valid.length) return;
      setPendingFiles((prev) => {
        const next = [...prev, ...valid];
        const previewFile = next[next.length - 1];
        if (previewFile) applyFilePreview(previewFile);
        return next;
      });
      setSessionPhase("intake");
    },
    [applyFilePreview, setPendingFiles, setSessionPhase, validateScanFile],
  );

  const removePendingFile = useCallback(
    (idx: number) => {
      setPendingFiles((prev) => {
        const next = prev.filter((_, i) => i !== idx);
        const previewFile = next[next.length - 1];
        if (previewFile) applyFilePreview(previewFile);
        else if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
          setPreviewMime(null);
          setPreviewFileName("");
        }
        return next;
      });
    },
    [applyFilePreview, previewUrl, setPendingFiles, setPreviewFileName, setPreviewMime, setPreviewUrl],
  );

  const clearPending = useCallback(() => {
    setPendingFiles([]);
    if (previewUrl && !isProcessing && !pendingAnalysis && !lastScanV5) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewMime(null);
      setPreviewFileName("");
    }
    setSessionPhase("idle");
  }, [
    isProcessing,
    lastScanV5,
    pendingAnalysis,
    previewUrl,
    setPendingFiles,
    setPreviewFileName,
    setPreviewMime,
    setPreviewUrl,
    setSessionPhase,
  ]);

  return {
    resetScanState,
    goBackScanStep,
    startNewScan: resetScanState,
    rescanLastFile,
    dismissBlueprintFork,
    openTakeoffForBlueprint,
    addFiles,
    removePendingFile,
    clearPending,
  };
}
