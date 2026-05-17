import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";

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
  return {
    scanMode,
    effectiveRunMode: "SINGLE_GEMINI",
    providerChain: ["gemini"],
  };
}
