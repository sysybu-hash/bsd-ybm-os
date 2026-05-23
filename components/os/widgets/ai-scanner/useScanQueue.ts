"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  clampScanModeForIndustry,
  defaultScanModeForIndustry,
  getScanModesForUi,
} from "@/lib/scan-modes-for-ui";
import {
  inferScreenTypeFromFileForIndustry,
  resolvePolicyForIndustry,
} from "@/lib/ai/screen-decode-policy";
import { runScanPostActions } from "@/lib/ai/scan-post-actions";
import {
  inferMimeFromFileName,
  isSupportedScanMime,
  MAX_SCAN_FILE_BYTES,
} from "@/lib/scan-mime";
import { canBrowserPreviewMime } from "@/lib/scan-preview";
import { LAST_SCAN_STORAGE_KEY } from "@/lib/notebooklm-from-scan";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";
import { formatMsg, mapV5ToAnalysis, readNdjsonStream } from "./constants";

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

  const scanSingleFile = async (file: File): Promise<DocumentAnalysis> => {
    setPendingAnalysis(null);
    setResultJson("");
    setTelemetry(null);
    setScanClassification(null);
    applyFilePreview(file);

    void import("@/lib/analytics/posthog-client").then(({ captureProductEvent }) => {
      captureProductEvent("scan_started", { engine: engineRunMode, fileType: file.type });
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const inferred = inferScreenTypeFromFileForIndustry(file.name, file.type || "", industryId);
      const policy = resolvePolicyForIndustry(inferred, industryId);
      const scanMode = clampScanModeForIndustry(
        engineRunMode === "AUTO" ? (policy.scanMode as ScanModeV5) : scanModeOverride,
        industryId,
      );
      formData.append("scanMode", scanMode);
      formData.append("persist", boundProjectId ? "true" : "false");
      if (boundProjectId) formData.append("projectId", boundProjectId);
      formData.append("engineRunMode", engineRunMode);
      if (userInstruction.trim()) formData.append("userInstruction", userInstruction.trim());

      const res = await fetch("/api/scan/tri-engine/stream", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String((err as { error?: string }).error ?? res.status));
      }

      let finalV5: ScanExtractionV5 | null = null;
      let finalAi: Record<string, unknown> | undefined;
      let lastTelemetry: TriEngineTelemetry | null = null;

      await readNdjsonStream(res, (obj) => {
        if (obj.type === "telemetry" && obj.telemetry) {
          lastTelemetry = obj.telemetry as TriEngineTelemetry;
          setTelemetry(lastTelemetry);
        }
        if (obj.type === "classification") {
          setScanClassification({
            scanMode: String(obj.scanMode ?? ""),
            confidence: Number(obj.confidence) || 0,
            rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
          });
        }
        if (obj.type === "partial_v5" && obj.v5) {
          finalV5 = obj.v5 as ScanExtractionV5;
          setResultJson(JSON.stringify(obj.v5, null, 2));
        }
        if (obj.type === "done" && obj.ok) {
          if (obj.aiData) finalAi = obj.aiData as Record<string, unknown>;
          if (obj.aiData && typeof obj.aiData === "object") {
            const nested = (obj.aiData as { v5?: ScanExtractionV5 }).v5;
            if (nested) finalV5 = nested;
          }
        }
        if (obj.type === "error" || (obj.error && !obj.ok)) {
          throw new Error(String(obj.error ?? "Scan failed"));
        }
      });

      if (finalV5) {
        const analysis = mapV5ToAnalysis(finalV5, finalAi);
        setPendingAnalysis(analysis);
        setResultJson(JSON.stringify(finalV5, null, 2));
        setLastScanV5(finalV5);
        setLastScanFileName(file.name);
        try {
          sessionStorage.setItem(
            LAST_SCAN_STORAGE_KEY,
            JSON.stringify({ fileName: file.name, v5: finalV5, telemetry: lastTelemetry }),
          );
        } catch {
          /* ignore */
        }
        void import("@/lib/analytics/posthog-client").then(({ captureProductEvent }) => {
          captureProductEvent("scan_completed", { engine: engineRunMode, fileType: file.type });
        });

        const postPolicy = resolvePolicyForIndustry(inferred, industryId);
        if (postPolicy.postActions.length > 0 && boundProjectId) {
          const post = await runScanPostActions({
            projectId: boundProjectId,
            v5: finalV5,
            policy: postPolicy,
            openWorkspaceWidget,
          });
          if (post.applied.length > 0) {
            toast.success(`פעולות הושלמו: ${post.applied.join(", ")}`);
          }
        } else if (postPolicy.postActions.length > 0 && !boundProjectId) {
          toast.message("נדרש projectId לפעולות אוטומטיות אחרי הסריקה");
        }

        return analysis;
      }
      throw new Error("No extraction result");
    } catch (err) {
      throw err instanceof Error ? err : new Error(tr("scanner.scanError", "שגיאה בסריקה"));
    }
  };

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
          const analysis = await scanSingleFile(file);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scanSingleFile stable enough for file queue
    [isProcessing, validateScanFile, tr],
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
      } catch {
        /* */
      }
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
    } catch {
      /* */
    }

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
    // queue state
    queue,
    isProcessing,
    queueProgress,
    // analysis
    pendingAnalysis,
    setPendingAnalysis,
    // history
    history,
    setHistory,
    // results
    telemetry,
    resultJson,
    scanClassification,
    // last scan
    lastScanV5,
    setLastScanV5,
    lastScanFileName,
    setLastScanFileName,
    savingNotebook,
    // preview
    previewUrl,
    previewMime,
    previewFileName,
    applyFilePreview,
    // actions
    runFileQueue,
    confirmAnalysis,
    saveToNotebook,
  };
}

// Re-export helpers used by callers
export { defaultScanModeForIndustry, getScanModesForUi };
