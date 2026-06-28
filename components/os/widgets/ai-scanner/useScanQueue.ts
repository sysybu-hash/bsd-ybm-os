"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ScanUiPhase } from "./ScanControlBar";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { WidgetType } from "@/hooks/use-window-manager";
import { defaultScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";
import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import { canBrowserPreviewMime } from "@/lib/scan-preview";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";
import { formatMsg } from "./constants";
import { runScanSingleFile } from "./runScanSingleFile";
import { unifiedSaveFromClient } from "@/lib/scan/unified-save-client";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";

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
  // Staged files — selected but NOT scanned until the user presses "Scan".
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // preview state
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
  }, [defaultSaveTargets, previewUrl]);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setQueueProgress(null);
    setQueue((prev) =>
      prev.map((q) => (q.status === "processing" ? { ...q, status: "error", error: tr("scanner.scanStopped", "הסריקה הופסקה") } : q)),
    );
    toast.message(tr("scanner.scanStopped", "הסריקה הופסקה"));
  }, [tr]);

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
  }, [pendingAnalysis, lastScanV5, sessionPhase]);

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
    [previewUrl],
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

  const runFileQueue = useCallback(
    async (files: File[], customInstructions?: string) => {
      if (!files.length || isProcessing) return;
      const isRescan = !!customInstructions?.trim();

      const valid: File[] = [];
      for (const file of files) {
        const err = validateScanFile(file);
        if (err) toast.error(err);
        else valid.push(file);
      }
      if (!valid.length) return;

      setSessionPhase("processing");
      const initialQueue: QueueItem[] = valid.map((file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: "pending",
      }));
      setQueue(initialQueue);
      setIsProcessing(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let ok = 0;
      let fail = 0;

      try {
        for (let i = 0; i < valid.length; i++) {
          if (controller.signal.aborted) break;
          const file = valid[i]!;
          const qid = initialQueue[i]!.id;
          setQueueProgress({ current: i + 1, total: valid.length, name: file.name });
          setQueue((prev) => prev.map((q) => (q.id === qid ? { ...q, status: "processing" } : q)));
          toast.info(
            formatMsg(tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}"), {
              current: i + 1,
              total: valid.length,
              name: file.name,
            }),
          );

          try {
            const analysis = await runScanSingleFile({
              file, engineRunMode, customEngines, scanModeOverride, boundProjectId,
              userInstruction, customInstructions, industryId, openWorkspaceWidget, tr,
              setPendingAnalysis, setResultJson, setTelemetry,
              setScanClassification, setLastScanV5, setLastScanFileName,
              applyFilePreview,
              signal: controller.signal,
            });
            setActiveScanFile(file);
            setSessionPhase("review");
            if (analysis.v5?.documentMetadata.scanMode === "DRAWING_BOQ") {
              setShowBlueprintFork(true);
            }
            ok++;
            setQueue((prev) => prev.map((q) => (q.id === qid ? { ...q, status: "done" } : q)));
            setHistory((prev) => [
              {
                id: qid,
                fileName: file.name,
                vendor: analysis.vendor,
                amount: analysis.amount,
                date: analysis.date || new Date().toISOString().split("T")[0]!,
                status: "success",
              },
              ...prev,
            ]);
          } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
              break;
            }
            fail++;
            const msg = err instanceof Error ? err.message : tr("scanner.scanError", "שגיאה");
            setQueue((prev) =>
              prev.map((q) => (q.id === qid ? { ...q, status: "error", error: msg } : q)),
            );
            toast.error(`${file.name}: ${msg}`);
          }
        }

        if (!controller.signal.aborted) {
          toast.success(
            formatMsg(tr("scanner.scanBatchDone", "הושלם: {ok} הצליחו, {fail} נכשלו"), { ok, fail }),
          );
        }
      } finally {
        setQueueProgress(null);
        setIsProcessing(false);
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) {
          // If all scans failed, return to idle — don't leave stuck in "processing"
          setSessionPhase(ok > 0 ? "review" : "idle");
        }
      }
    },
     
    [isProcessing, validateScanFile, engineRunMode, customEngines, scanModeOverride, boundProjectId,
     userInstruction, industryId, openWorkspaceWidget, tr, applyFilePreview],
  );

  const saveToNotebook = useCallback(
    async (
      onOpen?: (type: WidgetType, data?: Record<string, unknown> | null) => void,
    ) => {
      if (!lastScanV5 || !lastScanFileName) {
        toast.error(tr("scanner.noScanYet", "אין סריקה לשמירה"));
        return;
      }
      setSavingNotebook(true);
      try {
        const res = await fetch("/api/notebooklm/from-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileName: lastScanFileName, v5: lastScanV5, telemetry }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        (onOpen ?? openWorkspaceWidget)?.("notebookLM", {
          notebookId: data.notebookId,
          title: data.title,
        });
        toast.success(tr("scanner.saveToNotebookDone", "נשמר במחברת"));
      } catch {
        toast.error(tr("scanner.saveToNotebookFailed", "שמירה נכשלה"));
      } finally {
        setSavingNotebook(false);
      }
    },
    [lastScanV5, lastScanFileName, openWorkspaceWidget, telemetry, tr],
  );

  const goToSaveStep = useCallback(() => {
    if (!pendingAnalysis) return;
    setSessionPhase("save");
  }, [pendingAnalysis]);

  const startNewScan = useCallback(() => {
    resetScanState();
  }, [resetScanState]);

  const executeUnifiedSave = useCallback(async () => {
    if (!pendingAnalysis?.v5) {
      toast.error(tr("scanner.noScanYet", "אין סריקה לשמירה"));
      return;
    }
    const file =
      activeScanFile ??
      queue.find((q) => q.file.name === lastScanFileName)?.file ??
      queue[queue.length - 1]?.file;
    if (!file) {
      toast.error(tr("scanner.noScanYet", "אין קובץ לשמירה"));
      return;
    }

    const rawTargets = lockedSaveTargets?.length
      ? lockedSaveTargets
      : saveTargets.length
        ? saveTargets
        : defaultSaveTargets;
    const targets = [
      ...new Set(
        rawTargets.map((t) => (t === "project" && !boundProjectId ? "erp" : t)),
      ),
    ];

    if (!targets.length) {
      toast.error(tr("workspaceWidgets.documentScan.savePickOne", "בחרו לפחות יעד שמירה אחד"));
      return;
    }

    setIsSaving(true);
    let savedCount = 0;
  try {
    for (const target of targets) {
      if (target === "notebook") {
        await saveToNotebook();
        savedCount++;
        continue;
      }

      const result = await unifiedSaveFromClient(file, {
        target,
        fileName: lastScanFileName || file.name,
        v5: pendingAnalysis.v5,
        aiData: pendingAnalysis.rawAiData,
        projectId: boundProjectId || undefined,
        documentId: pendingAnalysis.documentId,
      });

      if (!result.ok) {
        toast.error(result.error ?? tr("scanner.saveFailed", "שמירה נכשלה"));
        return;
      }

      savedCount++;
    }

    const raw = pendingAnalysis.rawAiData;
    const isCorrected =
      raw &&
      (pendingAnalysis.vendor !== (raw as unknown as DocumentAnalysis).vendor ||
        pendingAnalysis.amount !== (raw as unknown as DocumentAnalysis).amount);

    const lastDocId = pendingAnalysis.documentId;
    if (isCorrected && lastDocId) {
      try {
        await fetch("/api/ai/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: lastDocId,
            originalAiData: raw,
            correctedData: {
              vendor: pendingAnalysis.vendor,
              amount: pendingAnalysis.amount,
              taxId: pendingAnalysis.taxId,
              date: pendingAnalysis.date,
            },
            correctionSource: "USER_MANUAL",
          }),
        });
      } catch { /* */ }
    }

    setHistory((prev) => [
      {
        id: Date.now().toString(),
        fileName: lastScanFileName || file.name,
        vendor: pendingAnalysis.vendor,
        amount: pendingAnalysis.amount,
        date: pendingAnalysis.date || new Date().toISOString().split("T")[0]!,
        status: "success",
      },
      ...prev,
    ]);
    setPendingAnalysis(null);
    setShowBlueprintFork(false);
    setSessionPhase("idle");
    toast.success(
      savedCount > 1
        ? tr("workspaceWidgets.documentScan.saveMultiSuccess", "נשמר ל-{count} יעדים").replace(
            "{count}",
            String(savedCount),
          )
        : tr("scanner.saveSuccess", "המסמך נשמר בהצלחה"),
    );
    onSaveComplete?.();
  } finally {
    setIsSaving(false);
  }
  }, [
    pendingAnalysis,
    activeScanFile,
    queue,
    lastScanFileName,
    saveTargets,
    boundProjectId,
    defaultSaveTargets,
    lockedSaveTargets,
    saveToNotebook,
    onSaveComplete,
    tr,
  ]);

  const confirmAnalysis = useCallback(async () => {
    await executeUnifiedSave();
  }, [executeUnifiedSave]);

  const continueToSaveStep = useCallback(() => {
    goToSaveStep();
  }, [goToSaveStep]);

  const rescanLastFile = useCallback(
    async (instruction: string) => {
      if (!instruction.trim()) return;
      const file =
        queue.find((q) => q.file.name === lastScanFileName)?.file ??
        queue[queue.length - 1]?.file;
      if (!file) {
        toast.error(tr("scanner.noScanYet", "אין סריקה לשמירה"));
        return;
      }
      await runFileQueue([file], instruction.trim());
    },
    [queue, lastScanFileName, runFileQueue, tr],
  );

  const dismissBlueprintFork = useCallback(() => setShowBlueprintFork(false), []);

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
  }, [boundProjectId, openWorkspaceWidget, tr, lastScanFileName]);

  const approveBlueprintBoq = useCallback(async () => {
    setSaveTargets([boundProjectId ? "project" : "erp"]);
    setShowBlueprintFork(false);
    setSessionPhase("save");
  }, [boundProjectId]);

  // ── Staged-files flow: select → review → press "Scan" ──────────────────────
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
    [applyFilePreview, validateScanFile],
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
    [applyFilePreview, previewUrl],
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
  }, [isProcessing, lastScanV5, pendingAnalysis, previewUrl]);

  const startScan = useCallback(async () => {
    if (!pendingFiles.length || isProcessing) return;
    const files = pendingFiles;
    setPendingFiles([]);
    await runFileQueue(files);
  }, [pendingFiles, isProcessing, runFileQueue]);

  /** True when at least one queue item has status "error" — drives the retry button */
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

// Re-export helpers used by callers
export { defaultScanModeForIndustry, getScanModesForUi };
