"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { WidgetType } from "@/hooks/use-window-manager";
import { defaultScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";
import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import { canBrowserPreviewMime } from "@/lib/scan-preview";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";
import { formatMsg } from "./constants";
import { runScanSingleFile } from "./runScanSingleFile";

export type UseScanQueueArgs = {
  engineRunMode: TriEngineRunMode;
  scanModeOverride: ScanModeV5;
  boundProjectId: string;
  userInstruction: string;
  industryId: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  tr: (key: string, fallback: string) => string;
};

export function useScanQueue({
  engineRunMode,
  scanModeOverride,
  boundProjectId,
  userInstruction,
  industryId,
  openWorkspaceWidget,
  tr,
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
  } | null>(null);
  const [lastScanV5, setLastScanV5] = useState<ScanExtractionV5 | null>(null);
  const [lastScanFileName, setLastScanFileName] = useState("");
  const [savingNotebook, setSavingNotebook] = useState(false);

  // preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");

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
    async (files: File[]) => {
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
      setQueue(initialQueue);
      setIsProcessing(true);

      let ok = 0;
      let fail = 0;

      for (let i = 0; i < valid.length; i++) {
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
            file, engineRunMode, scanModeOverride, boundProjectId,
            userInstruction, industryId, openWorkspaceWidget, tr,
            setPendingAnalysis, setResultJson, setTelemetry,
            setScanClassification, setLastScanV5, setLastScanFileName,
            applyFilePreview,
          });
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
        } catch (err) {
          fail++;
          const msg = err instanceof Error ? err.message : tr("scanner.scanError", "שגיאה");
          setQueue((prev) =>
            prev.map((q) => (q.id === qid ? { ...q, status: "error", error: msg } : q)),
          );
          toast.error(`${file.name}: ${msg}`);
        }
      }

      setQueueProgress(null);
      setIsProcessing(false);
      toast.success(
        formatMsg(tr("scanner.scanBatchDone", "הושלם: {ok} הצליחו, {fail} נכשלו"), { ok, fail }),
      );
    },
     
    [isProcessing, validateScanFile, engineRunMode, scanModeOverride, boundProjectId,
     userInstruction, industryId, openWorkspaceWidget, tr, applyFilePreview],
  );

  const confirmAnalysis = async () => {
    if (!pendingAnalysis) return;
    const raw = pendingAnalysis.rawAiData as DocumentAnalysis | undefined;
    const isCorrected =
      raw &&
      (pendingAnalysis.vendor !== raw.vendor ||
        pendingAnalysis.amount !== raw.amount ||
        pendingAnalysis.taxId !== raw.taxId ||
        pendingAnalysis.date !== raw.date);

    if (isCorrected && pendingAnalysis.documentId) {
      try {
        await fetch("/api/ai/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: pendingAnalysis.documentId,
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

    try {
      await fetch("/api/expenses/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: pendingAnalysis.amount,
          vendor: pendingAnalysis.vendor,
          projectName: pendingAnalysis.projectSuggestion,
        }),
      });
    } catch { /* */ }

    setHistory((prev) => [
      {
        id: Date.now().toString(),
        fileName: tr("scanner.results", "סריקה"),
        vendor: pendingAnalysis.vendor,
        amount: pendingAnalysis.amount,
        date: pendingAnalysis.date || new Date().toISOString().split("T")[0]!,
        status: "success",
      },
      ...prev,
    ]);
    setPendingAnalysis(null);
    toast.success(tr("scanner.confirmExpense", "ההוצאה נשמרה"));
  };

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

  return {
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
  };
}

// Re-export helpers used by callers
export { defaultScanModeForIndustry, getScanModesForUi };
