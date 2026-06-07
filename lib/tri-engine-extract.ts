import { geminiMultimodal, GEMINI_FLASH_PREFERRED } from "@/lib/tri-engine-gemini";
export { geminiMultimodal } from "@/lib/tri-engine-gemini";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { normalizeDocAiResultWithGemini, processDocumentAiRawForScanMode } from "@/lib/ai-extract-docai";
import { assertProviderConfigured, isMistralConfigured, normalizeAiProviderId } from "@/lib/ai-providers";
import { mapDocAiEntitiesToInvoiceV5 } from "@/lib/docai-invoice-mapper";
import {
  getBlueprintAnalysisModelChain,
  getGeminiModelFallbackChain,
  getModelChainForScanMode,
} from "@/lib/gemini-model";
import {
  buildV5JsonInstructionWithExtras,
  coerceLegacyAiToV5,
  emptyV5Base,
  type ScanExtractionV5,
  type ScanModeV5,
  v5ToPersistableAiData,
} from "@/lib/scan-schema-v5";
import type { MessageTree } from "@/lib/i18n/keys";
import { isAnthropicConfigured } from "@/lib/ai-providers";
import { analysePdfPages, buildMultiPagePromptPrefix } from "@/lib/scan-pdf-split";
import { industryInstructionExtras, localeLang } from "@/lib/tri-engine-extract-helpers";
import { createTriEngineProviders } from "@/lib/tri-engine-extract-providers";
import type { TriEngineRunMode } from "@/lib/tri-engine-parse";
import { enrichInvoiceV5, mergeScanResults } from "@/lib/tri-engine-merge";
import {
  compactError,
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
  userInstruction?: string | null;
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
    userInstruction,
    onProgress,
  } = params;

  const emitTelemetry = async () => {
    if (onProgress) await onProgress({ type: "telemetry", telemetry: snapTriTelemetry(telemetry) });
  };
  const emitPartial = async (v: ScanExtractionV5, stage: string) => {
    if (onProgress) await onProgress({ type: "partial_v5", v5: v, stage });
  };

  const lang = localeLang(locale);
  const extra = industryInstructionExtras(industry, orgTrade, messages);
  // buildV5JsonInstructionWithExtras — הוראות JSON schema + הנחיות ענף/מקצוע ייעודיות
  const v5Instruction = buildV5JsonInstructionWithExtras(lang, scanMode, industry, extra);
  const userInstructionBlock = userInstruction?.trim()
    ? `\n\n### USER REQUEST\nThe user added these extra instructions. Follow them when they do not conflict with the required JSON schema or safety constraints:\n${userInstruction.trim().slice(0, 1200)}`
    : "";

  // ── Multi-page PDF prefix (Step 6) ──────────────────────────────────────
  // For PDFs with ≥3 pages, prepend a text-enriched prompt prefix so the
  // model understands page structure and collects data across all pages.
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

  const telemetry: TriEngineTelemetry = {
    documentAI: { phase: "idle" },
    gemini: { phase: "idle" },
    gpt: { phase: "idle" },
    mistral: { phase: "idle" },
    anthropic: { phase: "idle" },
  };

  let v5: ScanExtractionV5;
  const runMode = engineRunMode === "AUTO" ? "MULTI_SEQUENTIAL" : engineRunMode;

  const { runDocAiOnly, runGeminiOnly, runOpenAiOnly, runMistralOnly, runAnthropicOnly } =
    createTriEngineProviders({
      base64,
      mimeType,
      fileName,
      scanMode,
      fullInstruction,
      openAiModel,
    });

  if (runMode === "SINGLE_ANTHROPIC") {
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gemini = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    telemetry.mistral = { phase: "skipped" };
    telemetry.anthropic = { phase: "running" };
    await emitTelemetry();
    const t0 = Date.now();
    try {
      v5 = await runAnthropicOnly();
      telemetry.anthropic = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "anthropic_single");
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
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
      v5 = await runDocAiOnly();
      telemetry.documentAI = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "document_ai");
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
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
      v5 = await runGeminiOnly();
      telemetry.gemini = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "gemini_single");
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
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
      v5 = await runMistralOnly();
      telemetry.mistral = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "mistral_single");
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
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
      v5 = await runOpenAiOnly();
      telemetry.gpt = { phase: "ok", ms: Date.now() - t0 };
      await emitTelemetry();
      await emitPartial(v5, "openai_single");
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
    } catch (e) {
      telemetry.gpt = { phase: "error", detail: compactError(e, 200) };
      await emitTelemetry();
      throw e;
    }
  }

  if (runMode === "MULTI_PARALLEL") {
    const startedAt = Date.now();
    const includeDocAi = scanMode === "INVOICE_FINANCIAL";
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

    v5 = fulfilled.reduce((acc, next) => mergeScanResults(acc, next, fileName, scanMode));
    v5.enginesUsed = fulfilled.flatMap((item) => item.enginesUsed ?? []);
    v5 = enrichInvoiceV5(v5);
    await emitPartial(v5, "merged_parallel");
    const aiData = v5ToPersistableAiData(v5);
    aiData._triEngineTelemetry = telemetry;
    return { aiData, v5, telemetry };
  }

  if (scanMode === "INVOICE_FINANCIAL") {
    let docAiV5: ScanExtractionV5 | null = null;
    try {
      const docErr = assertProviderConfigured("docai");
      if (docErr) throw new Error(docErr);
      const t0 = Date.now();
      telemetry.documentAI = { phase: "running" };
      await emitTelemetry();
      const raw = await processDocumentAiRawForScanMode(base64, mimeType, scanMode);
      if (raw.processorKind === "INVOICE" || raw.processorKind === "EXPENSE") {
        docAiV5 = mapDocAiEntitiesToInvoiceV5(raw.entities, raw.fullText, fileName, scanMode);
        docAiV5.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`];
      } else {
        const normalized = await normalizeDocAiResultWithGemini(raw, fileName, fullInstruction, scanMode);
        docAiV5 = coerceLegacyAiToV5(normalized, fileName, scanMode);
        docAiV5.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`, "gemini-normalizer"];
      }
      telemetry.documentAI = { phase: "ok", ms: Date.now() - t0, detail: `${raw.entities.length} entities` };
      await emitTelemetry();
      if (docAiV5) await emitPartial(docAiV5, "document_ai");
    } catch (e) {
      telemetry.documentAI = {
        phase: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      };
      await emitTelemetry();
    }

    if (docAiV5 && docAiV5.lineItems.length > 0) {
      v5 = docAiV5;
      telemetry.gpt = { phase: "skipped", detail: "document_ai sufficient" };
      telemetry.gemini = { phase: "skipped" };
      await emitTelemetry();
    } else {
      telemetry.gpt = { phase: "running" };
      await emitTelemetry();
      const t1 = Date.now();
      try {
        const oaErr = assertProviderConfigured(normalizeAiProviderId("openai"));
        if (oaErr) throw new Error(oaErr);
        const rawGpt = await extractDocumentWithOpenAI(
          base64,
          mimeType,
          fileName,
          fullInstruction,
          openAiModel,
        );
        v5 = coerceLegacyAiToV5(rawGpt, fileName, scanMode);
        v5.enginesUsed = [...(docAiV5 ? ["document_ai", "openai"] : ["openai"])];
        telemetry.gpt = { phase: "ok", ms: Date.now() - t1 };
        await emitTelemetry();
        await emitPartial(v5, "openai");
      } catch (e) {
        telemetry.gpt = {
          phase: "error",
          detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
        };
        await emitTelemetry();
        if (docAiV5) {
          v5 = docAiV5;
        } else {
          // Mistral fallback — לפני Gemini
          if (isMistralConfigured()) {
            const tM = Date.now();
            telemetry.mistral = { phase: "running", detail: "fallback_after_openai_error" };
            await emitTelemetry();
            try {
              v5 = await runMistralOnly();
              telemetry.mistral = { phase: "ok", ms: Date.now() - tM, detail: "fallback_after_openai_error" };
              telemetry.gemini = { phase: "skipped" };
              await emitTelemetry();
              await emitPartial(v5, "mistral_fallback");
            } catch (mistralError) {
              telemetry.mistral = {
                phase: "error",
                detail: mistralError instanceof Error ? mistralError.message.slice(0, 200) : String(mistralError),
              };
              await emitTelemetry();
              // ממשיכים ל-Gemini
            }
          } else {
            telemetry.mistral = { phase: "skipped" };
          }

          // Gemini — fallback אחרון אם Mistral נכשל / לא מוגדר
          if (!v5!) {
            const tG = Date.now();
            telemetry.gemini = { phase: "running", detail: "fallback_after_openai_mistral_error" };
            await emitTelemetry();
            try {
              const gErr = assertProviderConfigured("gemini");
              if (gErr) throw new Error(gErr);
              const rawGemini = await geminiMultimodal(base64, mimeType, fullInstruction, getModelChainForScanMode(scanMode));
              v5 = coerceLegacyAiToV5(rawGemini, fileName, scanMode);
              v5.enginesUsed = ["gemini-fallback"];
              telemetry.gemini = { phase: "ok", ms: Date.now() - tG, detail: "final_fallback" };
              await emitTelemetry();
              await emitPartial(v5, "gemini_fallback");
            } catch (geminiError) {
              telemetry.gemini = {
                phase: "error",
                detail: geminiError instanceof Error ? geminiError.message.slice(0, 200) : String(geminiError),
              };
              await emitTelemetry();
              const docAiDetail =
                telemetry.documentAI.phase === "error"
                  ? `Document AI: ${telemetry.documentAI.detail ?? "failed"}`
                  : "Document AI: no invoice line items extracted";
              const openAiDetail = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
              const mistralDetail = telemetry.mistral.detail ?? "skipped";
              const geminiDetail =
                geminiError instanceof Error
                  ? geminiError.message.slice(0, 500)
                  : String(geminiError).slice(0, 500);
              throw new Error(
                `All extraction engines failed. ${docAiDetail} | OpenAI: ${openAiDetail} | Mistral: ${mistralDetail} | Gemini: ${geminiDetail}`,
              );
            }
          }
        }
      }
      if (telemetry.gemini.phase === "idle") {
        telemetry.gemini = { phase: "skipped" };
      }
      await emitTelemetry();
    }
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
      return { aiData: v5ToPersistableAiData(v5), v5, telemetry };
    }

    const b = coerceLegacyAiToV5(gptRaw, fileName, scanMode);
    b.enginesUsed = ["gpt-5.4-turbo"];
    v5 = mergeScanResults(a, b, fileName, "DRAWING_BOQ");
    v5.enginesUsed = ["gemini", "openai"];
    await emitPartial(v5, "merged_gemini_openai");
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
      // Mistral fallback — כשGemini נכשל בנתיב הכללי
      if (!isMistralConfigured()) throw e;
      const tM2 = Date.now();
      telemetry.mistral = { phase: "running", detail: "fallback_after_gemini_error" };
      await emitTelemetry();
      try {
        v5 = await runMistralOnly();
        v5.enginesUsed = ["mistral-fallback"];
        telemetry.mistral = { phase: "ok", ms: Date.now() - tM2 };
        telemetry.documentAI = { phase: "skipped" };
        telemetry.gpt = { phase: "skipped" };
        telemetry.anthropic = { phase: "skipped" };
        await emitTelemetry();
        await emitPartial(v5, "mistral_fallback");
        const aiData = v5ToPersistableAiData(v5);
        aiData._triEngineTelemetry = telemetry;
        return { aiData, v5, telemetry };
      } catch (mistralErr) {
        telemetry.mistral = { phase: "error", detail: mistralErr instanceof Error ? mistralErr.message.slice(0, 200) : String(mistralErr) };
        await emitTelemetry();
        // Anthropic fallback — אחרי Gemini + Mistral נכשלו
        if (!isAnthropicConfigured()) throw e;
        const tA = Date.now();
        telemetry.anthropic = { phase: "running", detail: "fallback_after_gemini_mistral_error" };
        await emitTelemetry();
        try {
          v5 = await runAnthropicOnly();
          v5.enginesUsed = ["anthropic-fallback"];
          telemetry.anthropic = { phase: "ok", ms: Date.now() - tA };
          telemetry.documentAI = { phase: "skipped" };
          telemetry.gpt = { phase: "skipped" };
          await emitTelemetry();
          await emitPartial(v5, "anthropic_fallback");
          const aiDataA = v5ToPersistableAiData(v5);
          aiDataA._triEngineTelemetry = telemetry;
          return { aiData: aiDataA, v5, telemetry };
        } catch (anthropicErr) {
          telemetry.anthropic = { phase: "error", detail: anthropicErr instanceof Error ? anthropicErr.message.slice(0, 200) : String(anthropicErr) };
          await emitTelemetry();
          throw e; // זורקים את שגיאת ה-Gemini המקורית
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

  const aiData = v5ToPersistableAiData(v5);
  aiData._triEngineTelemetry = telemetry;
  return { aiData, v5, telemetry };
}
