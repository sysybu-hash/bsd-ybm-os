import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-parse";
import { compactError, type TriEngineResult, type TriEngineTelemetry } from "@/lib/tri-engine-types";
import { packTriEngineResult } from "@/lib/tri-engine-extract-result";

export type TriEngineProviderFns = {
  runDocAiOnly: () => Promise<ScanExtractionV5>;
  runGeminiOnly: () => Promise<ScanExtractionV5>;
  runOpenAiOnly: () => Promise<ScanExtractionV5>;
  runMistralOnly: () => Promise<ScanExtractionV5>;
  runAnthropicOnly: () => Promise<ScanExtractionV5>;
};

export async function tryRunSingleEngineMode(params: {
  runMode: TriEngineRunMode;
  telemetry: TriEngineTelemetry;
  scanMode: ScanModeV5;
  emitTelemetry: () => Promise<void>;
  emitPartial: (v: ScanExtractionV5, stage: string) => Promise<void>;
  providers: TriEngineProviderFns;
}): Promise<TriEngineResult | null> {
  const { runMode, telemetry, scanMode, emitTelemetry, emitPartial, providers } = params;
  const { runDocAiOnly, runGeminiOnly, runOpenAiOnly, runMistralOnly, runAnthropicOnly } = providers;

  if (runMode === "SINGLE_ANTHROPIC") {
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gemini = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    telemetry.mistral = { phase: "skipped" };
    telemetry.anthropic = { phase: "running" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      const v5 = await runAnthropicOnly();
      telemetry.anthropic = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "anthropic_single");
      return packTriEngineResult(v5, scanMode, telemetry);
    } catch (e) {
      telemetry.anthropic = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  if (runMode === "SINGLE_DOCUMENT_AI") {
    telemetry.documentAI = { phase: "running" };
    telemetry.gemini = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      const v5 = await runDocAiOnly();
      telemetry.documentAI = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "document_ai");
      return packTriEngineResult(v5, scanMode, telemetry);
    } catch (e) {
      telemetry.documentAI = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  if (runMode === "SINGLE_GEMINI") {
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gemini = { phase: "running" };
    telemetry.gpt = { phase: "skipped" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      const v5 = await runGeminiOnly();
      telemetry.gemini = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "gemini_single");
      return packTriEngineResult(v5, scanMode, telemetry);
    } catch (e) {
      telemetry.gemini = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  if (runMode === "SINGLE_MISTRAL") {
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gemini = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    telemetry.mistral = { phase: "running" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      const v5 = await runMistralOnly();
      telemetry.mistral = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "mistral_single");
      return packTriEngineResult(v5, scanMode, telemetry);
    } catch (e) {
      telemetry.mistral = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  if (runMode === "SINGLE_OPENAI") {
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gemini = { phase: "skipped" };
    telemetry.gpt = { phase: "running" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      const v5 = await runOpenAiOnly();
      telemetry.gpt = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "openai_single");
      return packTriEngineResult(v5, scanMode, telemetry);
    } catch (e) {
      telemetry.gpt = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  return null;
}
