import { geminiMultimodal } from "@/lib/tri-engine-gemini";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { normalizeDocAiResultWithGemini, processDocumentAiRawForScanMode } from "@/lib/ai-extract-docai";
import { assertProviderConfigured, isMistralConfigured, normalizeAiProviderId } from "@/lib/ai-providers";
import { mapDocAiEntitiesToInvoiceV5 } from "@/lib/docai-invoice-mapper";
import { getModelChainForScanMode } from "@/lib/gemini-model";
import { coerceLegacyAiToV5, type ScanExtractionV5, type ScanModeV5 } from "@/lib/scan-schema-v5";
import type { TriEngineProviderFns } from "@/lib/tri-engine-extract-single";
import type { TriEngineTelemetry } from "@/lib/tri-engine-types";

export async function runSequentialInvoiceScan(params: {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  fullInstruction: string;
  openAiModel?: string;
  telemetry: TriEngineTelemetry;
  emitTelemetry: () => Promise<void>;
  emitPartial: (v: ScanExtractionV5, stage: string) => Promise<void>;
  providers: TriEngineProviderFns;
}): Promise<ScanExtractionV5> {
  const {
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
  } = params;

  let v5: ScanExtractionV5 | undefined;
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
    return v5;
  }

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
      if (isMistralConfigured()) {
        const tM = Date.now();
        telemetry.mistral = { phase: "running", detail: "fallback_after_openai_error" };
        await emitTelemetry();
        try {
          v5 = await providers.runMistralOnly();
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
        }
      } else {
        telemetry.mistral = { phase: "skipped" };
      }

      if (!v5) {
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
  return v5!;
}
