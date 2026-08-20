import type { DocumentScanJobStatus } from "@prisma/client";
import { env } from "@/lib/env";

export type PublicAnalyzeJobStatus = "pending" | "processing" | "completed" | "failed";

export function toPublicJobStatus(status: DocumentScanJobStatus): PublicAnalyzeJobStatus {
  switch (status) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

export type InlineScanFilePayload = {
  kind: "inline";
  base64: string;
  fileName: string;
  mimeType: string;
  provider: string;
  analysisType: string;
  industry: string;
  language: string;
  model: string;
  persist: boolean;
  scanMode?: import("@/lib/scan-schema-v5").ScanModeV5;
  engineRunMode?: import("@/lib/tri-engine-api-common").TriEngineRunMode;
};

export type UrlScanFilePayload = {
  kind: "url";
  url: string;
  fileName: string;
  mimeType: string;
  provider: string;
  analysisType: string;
  industry: string;
  language: string;
  model: string;
  persist: boolean;
  scanMode?: import("@/lib/scan-schema-v5").ScanModeV5;
  engineRunMode?: import("@/lib/tri-engine-api-common").TriEngineRunMode;
};

export type DocumentScanFilePayload = InlineScanFilePayload | UrlScanFilePayload;

export function parseJobFileData(raw: string): DocumentScanFilePayload {
  const j = JSON.parse(raw) as Record<string, unknown>;
  const kind = j.kind === "url" ? "url" : "inline";
  const fileName = String(j.fileName ?? "document");
  const mimeType = String(j.mimeType ?? "application/octet-stream");
  const provider = String(j.provider ?? "gemini");
  const analysisType = String(j.analysisType ?? "INVOICE");
  const industry = String(j.industry ?? "CONSTRUCTION");
  const language = String(j.language ?? "auto");
  const model = String(j.model ?? "");
  const persist = j.persist === true || j.persist === "true";
  const scanModeRaw = typeof j.scanMode === "string" ? j.scanMode : undefined;
  const engineRunModeRaw = typeof j.engineRunMode === "string" ? j.engineRunMode : undefined;

  if (kind === "url") {
    const url = String(j.url ?? "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("כתובת URL לא חוקית ב-fileData");
    }
    return {
      kind: "url",
      url,
      fileName,
      mimeType,
      provider,
      analysisType,
      industry,
      language,
      model,
      persist,
      ...(scanModeRaw ? { scanMode: scanModeRaw as import("@/lib/scan-schema-v5").ScanModeV5 } : {}),
      ...(engineRunModeRaw
        ? { engineRunMode: engineRunModeRaw as import("@/lib/tri-engine-api-common").TriEngineRunMode }
        : {}),
    };
  }

  const base64 = String(j.base64 ?? "");
  if (!base64) {
    throw new Error("חסר base64 ב-fileData");
  }

  return {
    kind: "inline",
    base64,
    fileName,
    mimeType,
    provider,
    analysisType,
    industry,
    language,
    model,
    persist,
    ...(scanModeRaw ? { scanMode: scanModeRaw as import("@/lib/scan-schema-v5").ScanModeV5 } : {}),
    ...(engineRunModeRaw
      ? { engineRunMode: engineRunModeRaw as import("@/lib/tri-engine-api-common").TriEngineRunMode }
      : {}),
  };
}

/** זיהוי מגבלת קצב Google / Gemini / Document AI — להשאיר את המשימה ב־pending */
export function isDocumentScanRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("429")) return true;
  if (lower.includes("resource_exhausted")) return true;
  if (lower.includes("too many requests")) return true;
  if (lower.includes("quota") && (lower.includes("exceed") || lower.includes("exceeded"))) return true;
  if (lower.includes("rate limit")) return true;
  const rec = err as { status?: number; code?: number; error?: { code?: number } };
  if (rec?.status === 429) return true;
  if (rec?.code === 429) return true;
  if (rec?.error?.code === 429) return true;
  return false;
}

/**
 * אימות קריאה ל-worker:
 * - `Authorization: Bearer <CRON_SECRET>` — Cron של Vercel (GET), כמו /api/cron/financial-insights
 * - `x-analyze-queue-secret: <ANALYZE_QUEUE_SECRET>` — טריגר פנימי (POST)
 * - בפיתוח בלי ANALYZE_QUEUE_SECRET — מותר (נוחות מקומית)
 */
export function assertAnalyzeQueueProcessAuthorized(req: Request): boolean {
  const cronSecret = env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return true;
  }

  const queueSecret = env.ANALYZE_QUEUE_SECRET?.trim();
  if (!queueSecret) {
    return process.env.NODE_ENV === "development";
  }
  return req.headers.get("x-analyze-queue-secret") === queueSecret;
}
