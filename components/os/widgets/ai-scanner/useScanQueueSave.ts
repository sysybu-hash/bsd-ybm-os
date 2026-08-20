"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { WidgetType } from "@/hooks/use-window-manager";
import { unifiedSaveFromClient } from "@/lib/scan/unified-save-client";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { DocumentAnalysis, QueueItem, ScanHistoryItem } from "./types";

export type ScanQueueSaveState = {
  pendingAnalysis: DocumentAnalysis | null;
  activeScanFile: File | null;
  queue: QueueItem[];
  lastScanFileName: string;
  lastScanV5: ScanExtractionV5 | null;
  saveTargets: UnifiedSaveTarget[];
  defaultSaveTargets: UnifiedSaveTarget[];
  lockedSaveTargets?: UnifiedSaveTarget[];
  boundProjectId: string;
  telemetry: TriEngineTelemetry | null;
  tr: (key: string, fallback: string) => string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  onSaveComplete?: () => void;
  setSavingNotebook: Dispatch<SetStateAction<boolean>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setHistory: Dispatch<SetStateAction<ScanHistoryItem[]>>;
  setPendingAnalysis: Dispatch<SetStateAction<DocumentAnalysis | null>>;
  setShowBlueprintFork: Dispatch<SetStateAction<boolean>>;
  setSessionPhase: Dispatch<SetStateAction<"idle" | "intake" | "processing" | "review" | "save">>;
  setSaveTargets: Dispatch<SetStateAction<UnifiedSaveTarget[]>>;
};

export function useScanQueueSave(state: ScanQueueSaveState) {
  const {
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
  } = state;

  const saveToNotebook = useCallback(
    async (onOpen?: (type: WidgetType, data?: Record<string, unknown> | null) => void) => {
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
    [lastScanV5, lastScanFileName, openWorkspaceWidget, telemetry, tr, setSavingNotebook],
  );

  const goToSaveStep = useCallback(() => {
    if (!pendingAnalysis) return;
    setSessionPhase("save");
  }, [pendingAnalysis, setSessionPhase]);

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
      ...new Set(rawTargets.map((t) => (t === "project" && !boundProjectId ? "erp" : t))),
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
        } catch {
          /* */
        }
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
    setHistory,
    setIsSaving,
    setPendingAnalysis,
    setShowBlueprintFork,
    setSessionPhase,
  ]);

  const confirmAnalysis = useCallback(async () => {
    await executeUnifiedSave();
  }, [executeUnifiedSave]);

  const approveBlueprintBoq = useCallback(async () => {
    setSaveTargets([boundProjectId ? "project" : "erp"]);
    setShowBlueprintFork(false);
    setSessionPhase("save");
  }, [boundProjectId, setSaveTargets, setShowBlueprintFork, setSessionPhase]);

  return {
    saveToNotebook,
    goToSaveStep,
    executeUnifiedSave,
    confirmAnalysis,
    approveBlueprintBoq,
  };
}
