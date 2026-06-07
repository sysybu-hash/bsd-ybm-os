import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { ScanValidationResult } from "@/lib/scan-validate";

export type TriEngineTelemetry = {
  documentAI: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  gemini: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  gpt: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  mistral: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  anthropic: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
};

/** אירועי סטרימינג ללקוח (NDJSON) — טלמטריה ופלטי ביניים */
export type TriEngineProgressEvent =
  | { type: "telemetry"; telemetry: TriEngineTelemetry }
  | { type: "partial_v5"; v5: ScanExtractionV5; stage: string };

export type TriEngineResult = {
  /** אובייקט לשמירה ב-ERP / persist (כולל שדות legacy metadata) */
  aiData: Record<string, unknown>;
  v5: ScanExtractionV5;
  telemetry: TriEngineTelemetry;
  /** תוצאת אימות sanity (שלב 3) — בעיות שנמצאו + ציון ביטחון. */
  validation?: ScanValidationResult;
};

export function snapTriTelemetry(t: TriEngineTelemetry): TriEngineTelemetry {
  return {
    documentAI: { ...t.documentAI },
    gemini: { ...t.gemini },
    gpt: { ...t.gpt },
    mistral: { ...t.mistral },
    anthropic: { ...t.anthropic },
  };
}

export function compactError(error: unknown, max = 320): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.slice(0, max);
}
