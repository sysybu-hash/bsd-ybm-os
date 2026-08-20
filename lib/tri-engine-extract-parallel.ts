import { isAnthropicConfigured, isDocAiConfigured, isMistralConfigured } from "@/lib/ai-providers";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineRunMode } from "@/lib/tri-engine-parse";
import { mergeScanResultsMany } from "@/lib/tri-engine-merge";
import { compactError, type TriEngineResult, type TriEngineTelemetry } from "@/lib/tri-engine-types";
import { packTriEngineResult } from "@/lib/tri-engine-extract-result";
import type { TriEngineProviderFns } from "@/lib/tri-engine-extract-single";

export async function tryRunParallelEngineMode(params: {
  runMode: TriEngineRunMode;
  telemetry: TriEngineTelemetry;
  scanMode: ScanModeV5;
  fileName: string;
  customEngines?: string[];
  emitTelemetry: () => Promise<void>;
  emitPartial: (v: ScanExtractionV5, stage: string) => Promise<void>;
  providers: TriEngineProviderFns;
}): Promise<TriEngineResult | null> {
  const {
    runMode,
    telemetry,
    scanMode,
    fileName,
    customEngines,
    emitTelemetry,
    emitPartial,
    providers,
  } = params;
  const { runDocAiOnly, runGeminiOnly, runOpenAiOnly, runMistralOnly, runAnthropicOnly } = providers;

  if (runMode === "CUSTOM_PARALLEL") {
    const selected = (customEngines ?? []).filter(Boolean);
    const includeDocAi = selected.includes("docai") && isDocAiConfigured();
    const includeGemini = selected.includes("gemini");
    const includeOpenAi = selected.includes("openai");
    const includeMistral = selected.includes("mistral") && isMistralConfigured();
    const includeAnthropic = selected.includes("anthropic") && isAnthropicConfigured();
    const startedAt = Date.now();
    telemetry.documentAI = includeDocAi ? { phase: "running" } : { phase: "skipped" };
    telemetry.gemini = includeGemini ? { phase: "running" } : { phase: "skipped" };
    telemetry.gpt = includeOpenAi ? { phase: "running" } : { phase: "skipped" };
    telemetry.mistral = includeMistral ? { phase: "running" } : { phase: "skipped" };
    telemetry.anthropic = includeAnthropic ? { phase: "running" } : { phase: "skipped" };
    await emitTelemetry();

    const [docAiResult, geminiResult, openAiResult, mistralResult, anthropicResult] = await Promise.allSettled([
      includeDocAi ? runDocAiOnly() : Promise.reject(new Error("skipped")),
      includeGemini ? runGeminiOnly() : Promise.reject(new Error("skipped")),
      includeOpenAi ? runOpenAiOnly() : Promise.reject(new Error("skipped")),
      includeMistral ? runMistralOnly() : Promise.reject(new Error("skipped")),
      includeAnthropic ? runAnthropicOnly() : Promise.reject(new Error("skipped")),
    ]);

    const fulfilled: ScanExtractionV5[] = [];
    const failures: string[] = [];

    if (includeDocAi && docAiResult.status === "fulfilled") {
      telemetry.documentAI = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(docAiResult.value);
      await emitPartial(docAiResult.value, "document_ai");
    } else if (includeDocAi) {
      failures.push(`Document AI: ${compactError(docAiResult.status === "rejected" ? docAiResult.reason : "failed")}`);
      telemetry.documentAI = { phase: "error", detail: compactError(docAiResult.status === "rejected" ? docAiResult.reason : "failed", 200) };
    }
    if (includeGemini && geminiResult.status === "fulfilled") {
      telemetry.gemini = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(geminiResult.value);
      await emitPartial(geminiResult.value, "gemini_parallel");
    } else if (includeGemini) {
      failures.push(`Gemini: ${compactError(geminiResult.status === "rejected" ? geminiResult.reason : "failed")}`);
      telemetry.gemini = { phase: "error", detail: compactError(geminiResult.status === "rejected" ? geminiResult.reason : "failed", 200) };
    }
    if (includeOpenAi && openAiResult.status === "fulfilled") {
      telemetry.gpt = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(openAiResult.value);
      await emitPartial(openAiResult.value, "openai_parallel");
    } else if (includeOpenAi) {
      failures.push(`OpenAI: ${compactError(openAiResult.status === "rejected" ? openAiResult.reason : "failed")}`);
      telemetry.gpt = { phase: "error", detail: compactError(openAiResult.status === "rejected" ? openAiResult.reason : "failed", 200) };
    }
    if (includeMistral && mistralResult.status === "fulfilled") {
      telemetry.mistral = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(mistralResult.value);
      await emitPartial(mistralResult.value, "mistral_parallel");
    } else if (includeMistral) {
      failures.push(`Mistral: ${compactError(mistralResult.status === "rejected" ? mistralResult.reason : "failed")}`);
      telemetry.mistral = { phase: "error", detail: compactError(mistralResult.status === "rejected" ? mistralResult.reason : "failed", 200) };
    }
    if (includeAnthropic && anthropicResult.status === "fulfilled") {
      telemetry.anthropic = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(anthropicResult.value);
      await emitPartial(anthropicResult.value, "anthropic_parallel");
    } else if (includeAnthropic) {
      failures.push(`Anthropic: ${compactError(anthropicResult.status === "rejected" ? anthropicResult.reason : "failed")}`);
      telemetry.anthropic = { phase: "error", detail: compactError(anthropicResult.status === "rejected" ? anthropicResult.reason : "failed", 200) };
    }
    await emitTelemetry();

    if (!fulfilled.length) {
      throw new Error(`All selected engines failed. ${failures.join(" | ")}`);
    }
    const v5 = mergeScanResultsMany(fulfilled, fileName, scanMode);
    await emitPartial(v5, "merged_custom_parallel");
    return packTriEngineResult(v5, scanMode, telemetry);
  }

  if (runMode === "MULTI_PARALLEL") {
    const startedAt = Date.now();
    const includeDocAi = isDocAiConfigured();
    const includeAnthropic = isAnthropicConfigured();
    telemetry.documentAI = includeDocAi ? { phase: "running" } : { phase: "skipped" };
    telemetry.gemini = { phase: "running" };
    telemetry.gpt = { phase: "running" };
    telemetry.anthropic = includeAnthropic ? { phase: "running" } : { phase: "skipped" };
    await emitTelemetry();

    const [docAiResult, geminiResult, openAiResult, anthropicResult] = await Promise.allSettled([
      includeDocAi ? runDocAiOnly() : Promise.reject(new Error("Document AI skipped for this scan mode.")),
      runGeminiOnly(),
      runOpenAiOnly(),
      includeAnthropic ? runAnthropicOnly() : Promise.reject(new Error("Anthropic not configured.")),
    ]);

    const fulfilled: ScanExtractionV5[] = [];
    const failures: string[] = [];

    if (includeDocAi && docAiResult.status === "fulfilled") {
      telemetry.documentAI = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(docAiResult.value);
      await emitPartial(docAiResult.value, "document_ai");
    } else if (includeDocAi) {
      failures.push(`Document AI: ${compactError(docAiResult.status === "rejected" ? docAiResult.reason : "failed")}`);
      telemetry.documentAI = {
        phase: "error",
        detail: compactError(docAiResult.status === "rejected" ? docAiResult.reason : "failed", 200),
      };
    }

    if (geminiResult.status === "fulfilled") {
      telemetry.gemini = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(geminiResult.value);
      await emitPartial(geminiResult.value, "gemini_parallel");
    } else {
      failures.push(`Gemini: ${compactError(geminiResult.reason)}`);
      telemetry.gemini = { phase: "error", detail: compactError(geminiResult.reason, 200) };
    }

    if (openAiResult.status === "fulfilled") {
      telemetry.gpt = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(openAiResult.value);
      await emitPartial(openAiResult.value, "openai_parallel");
    } else {
      failures.push(`OpenAI: ${compactError(openAiResult.reason)}`);
      telemetry.gpt = { phase: "error", detail: compactError(openAiResult.reason, 200) };
    }

    if (includeAnthropic && anthropicResult.status === "fulfilled") {
      telemetry.anthropic = { phase: "ok", ms: Date.now() - startedAt };
      fulfilled.push(anthropicResult.value);
      await emitPartial(anthropicResult.value, "anthropic_parallel");
    } else if (includeAnthropic) {
      failures.push(`Anthropic: ${compactError(anthropicResult.status === "rejected" ? anthropicResult.reason : "failed")}`);
      telemetry.anthropic = { phase: "error", detail: compactError(anthropicResult.status === "rejected" ? anthropicResult.reason : "failed", 200) };
    }
    await emitTelemetry();

    if (!fulfilled.length) {
      throw new Error(`All selected engines failed. ${failures.join(" | ")}`);
    }

    const v5 = mergeScanResultsMany(fulfilled, fileName, scanMode);
    await emitPartial(v5, "merged_parallel");
    return packTriEngineResult(v5, scanMode, telemetry);
  }

  return null;
}
