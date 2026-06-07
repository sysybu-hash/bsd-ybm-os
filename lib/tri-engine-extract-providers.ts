import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import { normalizeDocAiResultWithGemini, processDocumentAiRawForScanMode } from "@/lib/ai-extract-docai";
import { extractDocumentWithMistral } from "@/lib/ai-extract-mistral";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { assertProviderConfigured, normalizeAiProviderId } from "@/lib/ai-providers";
import { mapDocAiEntitiesToInvoiceV5 } from "@/lib/docai-invoice-mapper";
import { getModelChainForScanMode } from "@/lib/gemini-model";
import { coerceLegacyAiToV5, type ScanExtractionV5, type ScanModeV5 } from "@/lib/scan-schema-v5";
import { geminiMultimodal } from "@/lib/tri-engine-gemini";

export type TriEngineProviderCtx = {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  fullInstruction: string;
  openAiModel?: string;
};

export function createTriEngineProviders(ctx: TriEngineProviderCtx) {
  const { base64, mimeType, fileName, scanMode, fullInstruction, openAiModel } = ctx;

  const runDocAiOnly = async (): Promise<ScanExtractionV5> => {
    const docErr = assertProviderConfigured("docai");
    if (docErr) throw new Error(docErr);
    const raw = await processDocumentAiRawForScanMode(base64, mimeType, scanMode);
    if (scanMode === "INVOICE_FINANCIAL" && (raw.processorKind === "INVOICE" || raw.processorKind === "EXPENSE")) {
      const out = mapDocAiEntitiesToInvoiceV5(raw.entities, raw.fullText, fileName, scanMode);
      out.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`];
      return out;
    }
    const normalized = await normalizeDocAiResultWithGemini(raw, fileName, fullInstruction, scanMode);
    const out = coerceLegacyAiToV5(normalized, fileName, scanMode);
    out.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`, "gemini-normalizer"];
    return out;
  };

  const runGeminiOnly = async (): Promise<ScanExtractionV5> => {
    const gErr = assertProviderConfigured("gemini");
    if (gErr) throw new Error(gErr);
    const modelChain = getModelChainForScanMode(scanMode);
    const raw = await geminiMultimodal(base64, mimeType, fullInstruction, modelChain);
    const out = coerceLegacyAiToV5(raw, fileName, scanMode);
    out.enginesUsed = [scanMode === "DRAWING_BOQ" ? "gemini-pro" : "gemini-flash"];
    return out;
  };

  const runOpenAiOnly = async (): Promise<ScanExtractionV5> => {
    const oaErr = assertProviderConfigured(normalizeAiProviderId("openai"));
    if (oaErr) throw new Error(oaErr);
    const raw = await extractDocumentWithOpenAI(base64, mimeType, fileName, fullInstruction, openAiModel);
    const out = coerceLegacyAiToV5(raw, fileName, scanMode);
    out.enginesUsed = ["openai"];
    return out;
  };

  const runMistralOnly = async (): Promise<ScanExtractionV5> => {
    const mErr = assertProviderConfigured("mistral");
    if (mErr) throw new Error(mErr);
    const raw = await extractDocumentWithMistral(base64, mimeType, fileName, fullInstruction, scanMode);
    const out = coerceLegacyAiToV5(raw, fileName, scanMode);
    out.enginesUsed = ["mistral-pixtral"];
    return out;
  };

  const runAnthropicOnly = async (): Promise<ScanExtractionV5> => {
    const aErr = assertProviderConfigured("anthropic");
    if (aErr) throw new Error(aErr);
    const raw = await extractDocumentWithAnthropic(base64, mimeType, fileName, fullInstruction);
    const out = coerceLegacyAiToV5(raw, fileName, scanMode);
    out.enginesUsed = ["claude-sonnet"];
    return out;
  };

  return { runDocAiOnly, runGeminiOnly, runOpenAiOnly, runMistralOnly, runAnthropicOnly };
}
