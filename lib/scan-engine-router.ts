import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import { scanModeFavorsAnthropic } from "@/lib/tri-engine-parse";
import { isAnthropicConfigured } from "@/lib/ai-providers";

export type ResolvedEnginePlan = {
  scanMode: ScanModeV5;
  effectiveRunMode: TriEngineRunMode;
  /** סדר מנועים לוגי — משמש לתיעוד בטלמטריה */
  providerChain: string[];
};

/**
 * כש-engineRunMode הוא AUTO — בוחרים מסלול לפי scanMode אחרי classify.
 * מצבים ידניים (SINGLE_*, MULTI_*) לא נדרסים.
 */
export function resolveTriEnginePlan(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): ResolvedEnginePlan {
  if (engineRunMode !== "AUTO") {
    return {
      scanMode,
      effectiveRunMode: engineRunMode,
      providerChain: [engineRunMode],
    };
  }

  if (scanMode === "INVOICE_FINANCIAL") {
    return {
      scanMode,
      effectiveRunMode: "MULTI_PARALLEL",
      providerChain: ["docai", "gemini", "openai"],
    };
  }
  if (scanMode === "DRAWING_BOQ") {
    return {
      scanMode,
      effectiveRunMode: "MULTI_SEQUENTIAL",
      providerChain: ["gemini", "openai"],
    };
  }
  // Contracts → Claude primary (native PDF, long narrative). MULTI_SEQUENTIAL so the
  // per-scanMode CONTRACT branch in runTriEngineExtraction is reached; billed premium.
  // Falls back to Gemini at extract time if premium credit was downgraded.
  if (scanModeFavorsAnthropic(scanMode) && isAnthropicConfigured()) {
    return {
      scanMode,
      effectiveRunMode: "MULTI_SEQUENTIAL",
      providerChain: ["anthropic", "gemini"],
    };
  }
  return {
    scanMode,
    effectiveRunMode: "SINGLE_GEMINI",
    providerChain: ["gemini"],
  };
}
