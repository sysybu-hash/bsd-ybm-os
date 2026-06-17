import { runTriEngineExtractionValidated } from "@/lib/tri-engine-extract-validated";
import {
  buildTriEngineAiDataRecord,
  loadTriEngineExtractionInput,
  type TriEngineRunMode,
} from "@/lib/tri-engine-api-common";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import { inferScreenTypeFromFileForIndustry, resolvePolicyForIndustry } from "@/lib/ai/screen-decode-policy";
import { clampScanModeForIndustry } from "@/lib/scan-modes-for-ui";
import { enrichDrawingBoqWithBlueprintAnalyzer } from "@/lib/scan/blueprint-v5-enrich";
import type { UnifiedExtractInput, UnifiedExtractResult } from "@/lib/scan/unified-scan-types";
import {
  mapLegacyAnalysisTypeToScanMode,
  mapLegacyProviderToEngineRunMode,
} from "@/lib/scan/legacy-map";

export { mapLegacyAnalysisTypeToScanMode, mapLegacyProviderToEngineRunMode };

export type UnifiedExtractFromFileParams = {
  file: File;
  userId: string;
  scanMode?: ScanModeV5;
  engineRunMode?: TriEngineRunMode;
  userInstruction?: string | null;
  industry?: string;
  openAiModel?: string;
};

/**
 * מריץ Tri-Engine מאוחד מקובץ (שרת) — משמש Drive, analyze-queue, process-document wrapper.
 */
export async function unifiedExtractFromFile(
  params: UnifiedExtractFromFileParams,
): Promise<UnifiedExtractResult> {
  const industry = params.industry ?? "CONSTRUCTION";
  const inferred = inferScreenTypeFromFileForIndustry(
    params.file.name,
    params.file.type || "application/octet-stream",
    industry,
  );
  const policy = resolvePolicyForIndustry(inferred, industry);
  const engineRunMode = params.engineRunMode ?? "AUTO";
  const scanMode =
    params.scanMode ??
    clampScanModeForIndustry(
      engineRunMode === "AUTO" ? policy.scanMode : (params.scanMode ?? policy.scanMode),
      industry,
    );

  const input = await loadTriEngineExtractionInput(
    params.file,
    scanMode,
    params.userId,
    params.openAiModel,
    engineRunMode,
    params.userInstruction,
  );

  return unifiedExtractFromInput(input);
}

/** מריץ Tri-Engine מפרמטרים גולמיים (base64) */
export async function unifiedExtractFromInput(
  input: UnifiedExtractInput,
): Promise<UnifiedExtractResult> {
  const result = await runTriEngineExtractionValidated({
    base64: input.base64,
    mimeType: input.mimeType,
    fileName: input.fileName,
    scanMode: input.scanMode,
    locale: input.locale,
    industry: input.industry,
    orgTrade: input.orgTrade,
    messages: input.messages,
    openAiModel: input.openAiModel,
    engineRunMode: input.engineRunMode ?? "AUTO",
    userInstruction: input.userInstruction,
  });

  let v5 = result.v5;
  if (input.scanMode === "DRAWING_BOQ") {
    v5 = await enrichDrawingBoqWithBlueprintAnalyzer(input.base64, input.mimeType, v5);
  }

  const aiData = buildTriEngineAiDataRecord(v5, result.telemetry);
  if (result.validation) {
    aiData._validation = result.validation;
  }

  return {
    v5,
    aiData,
    telemetry: result.telemetry,
    validation: result.validation,
  };
}

