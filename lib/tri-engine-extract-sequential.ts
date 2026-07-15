import { geminiMultimodal } from "@/lib/tri-engine-gemini";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { assertProviderConfigured, isAnthropicConfigured, isMistralConfigured, normalizeAiProviderId } from "@/lib/ai-providers";
import { getBlueprintAnalysisModelChain, getModelChainForScanMode } from "@/lib/gemini-model";
import { coerceLegacyAiToV5, type ScanExtractionV5, type ScanModeV5 } from "@/lib/scan-schema-v5";
import { packTriEngineResult } from "@/lib/tri-engine-extract-result";
import { runSequentialInvoiceScan } from "@/lib/tri-engine-extract-invoice-sequential";
import type { TriEngineProviderFns } from "@/lib/tri-engine-extract-single";
import { mergeScanResults } from "@/lib/tri-engine-merge";
import type { TriEngineResult, TriEngineTelemetry } from "@/lib/tri-engine-types";

export async function runSequentialScanMode(params: {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  fullInstruction: string;
  openAiModel?: string;
  allowPremiumEngines: boolean;
  telemetry: TriEngineTelemetry;
  emitTelemetry: () => Promise<void>;
  emitPartial: (v: ScanExtractionV5, stage: string) => Promise<void>;
  providers: TriEngineProviderFns;
}): Promise<TriEngineResult> {
  const {
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
  } = params;

  let v5: ScanExtractionV5;

  if (scanMode === "INVOICE_FINANCIAL") {
    v5 = await runSequentialInvoiceScan({
      base64,
      mimeType,
      fileName,
      scanMode,
      fullInstruction,
      openAiModel,
      telemetry,
      emitTelemetry,
      emitPartial,
      providers,
    });
  } else if (scanMode === "DRAWING_BOQ") {
    const flagshipFirst = getBlueprintAnalysisModelChain();

    const tG = Date.now();
    telemetry.gemini = { phase: "running" };
    await emitTelemetry();
    let geminiRaw: Record<string, unknown>;
    try {
      const gErr = assertProviderConfigured("gemini");
      if (gErr) throw new Error(gErr);
      geminiRaw = await geminiMultimodal(base64, mimeType, fullInstruction, flagshipFirst);
      telemetry.gemini = { phase: "ok", ms: Date.now() - tG };
      await emitTelemetry();
    } catch (e) {
      telemetry.gemini = {
        phase: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      };
      await emitTelemetry();
      throw e;
    }

    const a = coerceLegacyAiToV5(geminiRaw, fileName, scanMode);
    a.enginesUsed = ["gemini-3.1-pro-stable"];
    await emitPartial(a, "gemini");

    const tP = Date.now();
    telemetry.gpt = { phase: "running" };
    await emitTelemetry();
    let gptRaw: Record<string, unknown>;
    try {
      const oaErr2 = assertProviderConfigured(normalizeAiProviderId("openai"));
      if (oaErr2) throw new Error(oaErr2);
      gptRaw = await extractDocumentWithOpenAI(
        base64,
        mimeType,
        fileName,
        fullInstruction,
        openAiModel,
      );
      telemetry.gpt = { phase: "ok", ms: Date.now() - tP };
      await emitTelemetry();
    } catch (e) {
      telemetry.gpt = {
        phase: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      };
      await emitTelemetry();
      v5 = coerceLegacyAiToV5(geminiRaw, fileName, scanMode);
      v5.enginesUsed = ["gemini"];
      return packTriEngineResult(v5, scanMode, telemetry);
    }

    const b = coerceLegacyAiToV5(gptRaw, fileName, scanMode);
    b.enginesUsed = ["gpt-5.4-turbo"];
    v5 = mergeScanResults(a, b, fileName, "DRAWING_BOQ");
    v5.enginesUsed = ["gemini", "openai"];
    await emitPartial(v5, "merged_gemini_openai");
  } else if (scanMode === "CONTRACT" && allowPremiumEngines && isAnthropicConfigured()) {
    const tA = Date.now();
    telemetry.anthropic = { phase: "running" };
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    telemetry.mistral = { phase: "skipped" };
    await emitTelemetry();
    try {
      v5 = await providers.runAnthropicOnly();
      telemetry.anthropic = { phase: "ok", ms: Date.now() - tA };
      telemetry.gemini = { phase: "skipped" };
      await emitTelemetry();
      await emitPartial(v5, "anthropic_contract");
    } catch (e) {
      telemetry.anthropic = { phase: "error", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
      await emitTelemetry();
      const tG = Date.now();
      telemetry.gemini = { phase: "running", detail: "fallback_after_anthropic_error" };
      await emitTelemetry();
      const gErr = assertProviderConfigured("gemini");
      if (gErr) throw new Error(gErr);
      const raw = await geminiMultimodal(base64, mimeType, fullInstruction, getModelChainForScanMode(scanMode));
      v5 = coerceLegacyAiToV5(raw, fileName, scanMode);
      v5.enginesUsed = ["gemini-fallback"];
      telemetry.gemini = { phase: "ok", ms: Date.now() - tG };
      await emitTelemetry();
      await emitPartial(v5, "gemini_fallback");
    }
  } else {
    const tF = Date.now();
    telemetry.gemini = { phase: "running" };
    await emitTelemetry();
    let raw: Record<string, unknown>;
    try {
      const gErr2 = assertProviderConfigured("gemini");
      if (gErr2) throw new Error(gErr2);
      raw = await geminiMultimodal(base64, mimeType, fullInstruction, getModelChainForScanMode(scanMode));
      telemetry.gemini = { phase: "ok", ms: Date.now() - tF };
      await emitTelemetry();
    } catch (e) {
      telemetry.gemini = {
        phase: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      };
      await emitTelemetry();
      if (!isMistralConfigured()) throw e;
      const tM2 = Date.now();
      telemetry.mistral = { phase: "running", detail: "fallback_after_gemini_error" };
      await emitTelemetry();
      try {
        v5 = await providers.runMistralOnly();
        v5.enginesUsed = ["mistral-fallback"];
        telemetry.mistral = { phase: "ok", ms: Date.now() - tM2 };
        telemetry.documentAI = { phase: "skipped" };
        telemetry.gpt = { phase: "skipped" };
        telemetry.anthropic = { phase: "skipped" };
        await emitTelemetry();
        await emitPartial(v5, "mistral_fallback");
        return packTriEngineResult(v5, scanMode, telemetry);
      } catch (mistralErr) {
        telemetry.mistral = { phase: "error", detail: mistralErr instanceof Error ? mistralErr.message.slice(0, 200) : String(mistralErr) };
        await emitTelemetry();
        if (!isAnthropicConfigured()) throw e;
        const tA = Date.now();
        telemetry.anthropic = { phase: "running", detail: "fallback_after_gemini_mistral_error" };
        await emitTelemetry();
        try {
          v5 = await providers.runAnthropicOnly();
          v5.enginesUsed = ["anthropic-fallback"];
          telemetry.anthropic = { phase: "ok", ms: Date.now() - tA };
          telemetry.documentAI = { phase: "skipped" };
          telemetry.gpt = { phase: "skipped" };
          await emitTelemetry();
          await emitPartial(v5, "anthropic_fallback");
          return packTriEngineResult(v5, scanMode, telemetry);
        } catch (anthropicErr) {
          telemetry.anthropic = { phase: "error", detail: anthropicErr instanceof Error ? anthropicErr.message.slice(0, 200) : String(anthropicErr) };
          await emitTelemetry();
          throw e;
        }
      }
    }
    v5 = coerceLegacyAiToV5(raw, fileName, scanMode);
    v5.enginesUsed = ["gemini-flash"];
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    telemetry.mistral = { phase: "skipped" };
    telemetry.anthropic = { phase: "skipped" };
    await emitTelemetry();
    await emitPartial(v5, "gemini_flash");
  }

  return packTriEngineResult(v5, scanMode, telemetry);
}
