import { toast } from "sonner";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { WidgetType } from "@/hooks/use-window-manager";
import { clampScanModeForIndustry } from "@/lib/scan-modes-for-ui";
import {
  inferScreenTypeFromFileForIndustry,
  resolvePolicyForIndustry,
} from "@/lib/ai/screen-decode-policy";
import { runScanPostActions } from "@/lib/ai/scan-post-actions";
import { LAST_SCAN_STORAGE_KEY } from "@/lib/notebooklm-from-scan";
import type { DocumentAnalysis } from "./types";
import { mapV5ToAnalysis, readNdjsonStream } from "./constants";

export type RunScanArgs = {
  file: File;
  engineRunMode: TriEngineRunMode;
  scanModeOverride: ScanModeV5;
  boundProjectId: string;
  userInstruction: string;
  industryId: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  tr: (key: string, fallback: string) => string;
  // setters
  setPendingAnalysis: (a: DocumentAnalysis | null) => void;
  setResultJson: (s: string) => void;
  setTelemetry: (t: TriEngineTelemetry | null) => void;
  setScanClassification: (c: { scanMode: string; confidence: number; rationale?: string } | null) => void;
  setLastScanV5: (v: ScanExtractionV5 | null) => void;
  setLastScanFileName: (n: string) => void;
  applyFilePreview: (file: File) => void;
};

export async function runScanSingleFile({
  file,
  engineRunMode,
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
}: RunScanArgs): Promise<DocumentAnalysis> {
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
      } catch { /* ignore */ }

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
}
