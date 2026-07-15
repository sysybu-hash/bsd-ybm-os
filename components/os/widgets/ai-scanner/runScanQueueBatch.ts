"use client";

import { toast } from "sonner";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { WidgetType } from "@/hooks/use-window-manager";
import { enqueueScan, isNetworkError } from "@/lib/offline/scan-outbox";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";
import { formatMsg } from "./constants";
import { runScanSingleFile } from "./runScanSingleFile";
import type { ScanQueueExecutionState } from "./useScanQueueExecution";

type BatchRunnerArgs = Pick<
  ScanQueueExecutionState,
  | "engineRunMode"
  | "customEngines"
  | "scanModeOverride"
  | "boundProjectId"
  | "userInstruction"
  | "industryId"
  | "openWorkspaceWidget"
  | "tr"
  | "abortRef"
  | "setSessionPhase"
  | "setQueue"
  | "setIsProcessing"
  | "setQueueProgress"
  | "setPendingAnalysis"
  | "setResultJson"
  | "setTelemetry"
  | "setScanClassification"
  | "setLastScanV5"
  | "setLastScanFileName"
  | "setActiveScanFile"
  | "setShowBlueprintFork"
  | "setHistory"
> & {
  applyFilePreview: (file: File) => void;
  valid: File[];
  initialQueue: QueueItem[];
};

export async function runScanQueueBatch(args: BatchRunnerArgs): Promise<{ ok: number; fail: number }> {
  const {
    valid,
    initialQueue,
    engineRunMode,
    customEngines,
    scanModeOverride,
    boundProjectId,
    userInstruction,
    industryId,
    openWorkspaceWidget,
    tr,
    abortRef,
    applyFilePreview,
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
  } = args;

  setSessionPhase("processing");
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
          file,
          engineRunMode,
          customEngines,
          scanModeOverride,
          boundProjectId,
          userInstruction,
          industryId,
          openWorkspaceWidget,
          tr,
          setPendingAnalysis,
          setResultJson,
          setTelemetry,
          setScanClassification,
          setLastScanV5,
          setLastScanFileName,
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
        if (isNetworkError(err)) {
          try {
            await enqueueScan({
              fileBlob: file,
              fileName: file.name,
              fileType: file.type,
              scanMode: String(scanModeOverride),
              engineRunMode: String(engineRunMode),
              projectId: boundProjectId || null,
              userInstruction: userInstruction?.trim() || null,
            });
            setQueue((prev) =>
              prev.map((q) => (q.id === qid ? { ...q, status: "queued" } : q)),
            );
            toast.info(
              tr("scanner.outboxSaved", "אין רשת — הסריקה נשמרה ותסתנכרן כשהחיבור יחזור"),
            );
            continue;
          } catch {
            /* full outbox or no IndexedDB */
          }
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
      setSessionPhase(ok > 0 ? "review" : "idle");
    }
  }

  return { ok, fail };
}

export type { DocumentAnalysis, QueueItem, ScanHistoryItem };
