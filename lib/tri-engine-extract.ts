import { geminiMultimodal } from "@/lib/tri-engine-gemini";
export { geminiMultimodal } from "@/lib/tri-engine-gemini";
import {
  buildV5JsonInstructionWithExtras,
  type ScanExtractionV5,
  type ScanModeV5,
} from "@/lib/scan-schema-v5";
import type { MessageTree } from "@/lib/i18n/keys";
import { analysePdfPages, buildMultiPagePromptPrefix } from "@/lib/scan-pdf-split";
import { industryInstructionExtras, localeLang } from "@/lib/tri-engine-extract-helpers";
import { createTriEngineProviders } from "@/lib/tri-engine-extract-providers";
import { tryRunParallelEngineMode } from "@/lib/tri-engine-extract-parallel";
import { runSequentialScanMode } from "@/lib/tri-engine-extract-sequential";
import { tryRunSingleEngineMode } from "@/lib/tri-engine-extract-single";
import type { TriEngineRunMode } from "@/lib/tri-engine-parse";
import {
  snapTriTelemetry,
  type TriEngineProgressEvent,
  type TriEngineResult,
  type TriEngineTelemetry,
} from "@/lib/tri-engine-types";

export type { TriEngineProgressEvent, TriEngineResult, TriEngineTelemetry } from "@/lib/tri-engine-types";

export async function runTriEngineExtraction(params: {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  locale: string;
  industry: string;
  orgTrade: string | null;
  messages: MessageTree;
  openAiModel?: string;
  engineRunMode?: TriEngineRunMode;
  /** מנועים לבחירה ידנית — בשימוש עם CUSTOM_PARALLEL */
  customEngines?: string[];
  userInstruction?: string | null;
  /** false כשירדנו לחיוב זול — מדלגים על מנועי פרמיום (Anthropic) ב-AUTO. */
  allowPremiumEngines?: boolean;
  /** עדכוני ביניים לסטרימינג (טלמטריה + V5 חלקי) */
  onProgress?: (e: TriEngineProgressEvent) => void | Promise<void>;
}): Promise<TriEngineResult> {
  const {
    base64,
    mimeType,
    fileName,
    scanMode,
    locale,
    industry,
    orgTrade,
    messages,
    openAiModel,
    engineRunMode = "AUTO",
    customEngines,
    userInstruction,
    allowPremiumEngines = true,
    onProgress,
  } = params;

  const telemetry: TriEngineTelemetry = {
    documentAI: { phase: "idle" },
    gemini: { phase: "idle" },
    gpt: { phase: "idle" },
    mistral: { phase: "idle" },
    anthropic: { phase: "idle" },
  };

  const emitTelemetry = async () => {
    if (onProgress) await onProgress({ type: "telemetry", telemetry: snapTriTelemetry(telemetry) });
  };
  const emitPartial = async (v: ScanExtractionV5, stage: string) => {
    if (onProgress) await onProgress({ type: "partial_v5", v5: v, stage });
  };

  const lang = localeLang(locale);
  const extra = industryInstructionExtras(industry, orgTrade, messages);
  const v5Instruction = buildV5JsonInstructionWithExtras(lang, scanMode, industry, extra);
  const userInstructionBlock = userInstruction?.trim()
    ? `\n\n### USER REQUEST\nThe user added these extra instructions. Follow them when they do not conflict with the required JSON schema or safety constraints:\n${userInstruction.trim().slice(0, 1200)}`
    : "";

  let multiPagePrefix = "";
  if (mimeType === "application/pdf") {
    try {
      const buffer = Buffer.from(base64, "base64");
      const pageInfo = await analysePdfPages(buffer);
      multiPagePrefix = buildMultiPagePromptPrefix(pageInfo);
    } catch {
      // non-blocking — proceed without prefix
    }
  }

  const fullInstruction = `${multiPagePrefix}${v5Instruction}${userInstructionBlock}`;
  const runMode = engineRunMode === "AUTO" ? "MULTI_SEQUENTIAL" : engineRunMode;

  const providers = createTriEngineProviders({
    base64,
    mimeType,
    fileName,
    scanMode,
    fullInstruction,
    openAiModel,
  });

  const singleResult = await tryRunSingleEngineMode({
    runMode,
    telemetry,
    scanMode,
    emitTelemetry,
    emitPartial,
    providers,
  });
  if (singleResult) return singleResult;

  const parallelResult = await tryRunParallelEngineMode({
    runMode,
    telemetry,
    scanMode,
    fileName,
    customEngines,
    emitTelemetry,
    emitPartial,
    providers,
  });
  if (parallelResult) return parallelResult;

  return runSequentialScanMode({
    base64,
    mimeType,
    fileName,
    scanMode,
    fullInstruction,
    openAiModel,
    allowPremiumEngines,
    telemetry,
    emitTelemetry,
    emitPartial,
    providers,
  });
}
