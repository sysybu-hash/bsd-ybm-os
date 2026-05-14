import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { normalizeDocAiResultWithGemini, processDocumentAiRawForScanMode } from "@/lib/ai-extract-docai";
import { assertProviderConfigured, normalizeAiProviderId } from "@/lib/ai-providers";
import { mapDocAiEntitiesToInvoiceV5 } from "@/lib/docai-invoice-mapper";
import {
  GEMINI_FLAGSHIP_MODEL,
  getGeminiModelFallbackChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import {
  buildV5JsonInstruction,
  coerceLegacyAiToV5,
  emptyV5Base,
  type ScanExtractionV5,
  type ScanModeV5,
  v5ToPersistableAiData,
} from "@/lib/scan-schema-v5";
import { getMergedIndustryConfig } from "@/lib/construction-trades";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import type { MessageTree } from "@/lib/i18n/keys";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";

/** מודלי Flash נתמכים ב-Gemini API — ללא 1.5-flash-002 (מחזיר 404 אצל רוב המפתחות) */
const GEMINI_FLASH_PREFERRED = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
] as const;

export type TriEngineTelemetry = {
  documentAI: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  gemini: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
  gpt: { phase: "idle" | "running" | "ok" | "error" | "skipped"; ms?: number; detail?: string };
};

/** אירועי סטרימינג ללקוח (NDJSON) — טלמטריה ופלטי ביניים */
export type TriEngineProgressEvent =
  | { type: "telemetry"; telemetry: TriEngineTelemetry }
  | { type: "partial_v5"; v5: ScanExtractionV5; stage: string };

function snapTriTelemetry(t: TriEngineTelemetry): TriEngineTelemetry {
  return {
    documentAI: { ...t.documentAI },
    gemini: { ...t.gemini },
    gpt: { ...t.gpt },
  };
}

export type TriEngineResult = {
  /** אובייקט לשמירה ב-ERP / persist (כולל שדות legacy metadata) */
  aiData: Record<string, unknown>;
  v5: ScanExtractionV5;
  telemetry: TriEngineTelemetry;
};

function localeLang(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  return LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
}

async function geminiMultimodal(
  base64: string,
  mimeType: string,
  instruction: string,
  modelChain: readonly string[],
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error("חסר מפתח Gemini");
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;
  for (const modelId of modelChain) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([
        `${instruction}\nReturn a single JSON object only, no markdown.`,
        { inlineData: { data: base64, mimeType } },
      ]);
      return parseModelJsonText(result.response.text());
    } catch (err: unknown) {
      lastErr = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function industryInstructionExtras(
  industry: string,
  trade: string | null,
  messages: MessageTree,
): string {
  const cfg = getMergedIndustryConfig(industry, trade, messages);
  const cols = cfg.scanner.resultColumns
    .map((c: { key: string; label: string }) => `- "${c.key}": string | null (${c.label})`)
    .join("\n");
  return `### DYNAMIC FIELDS\nInclude at root if missing:\n${cols}\n\n### CONTEXT\nIndustry: ${cfg.label}\n${cfg.aiInstructions}`;
}

function mergeDrawingResults(a: ScanExtractionV5, b: ScanExtractionV5, fileName: string): ScanExtractionV5 {
  const boqMap = new Map<string, (typeof a.billOfQuantities)[0]>();
  for (const row of [...a.billOfQuantities, ...b.billOfQuantities]) {
    const k = `${row.description}::${row.unit ?? ""}`;
    if (!boqMap.has(k)) boqMap.set(k, row);
  }
  const liMap = new Map<string, (typeof a.lineItems)[0]>();
  for (const row of [...a.lineItems, ...b.lineItems]) {
    const k = `${row.description}::${row.quantity ?? ""}`;
    if (!liMap.has(k)) liMap.set(k, row);
  }
  return emptyV5Base(fileName, "DRAWING_BOQ", {
    documentMetadata: {
      ...a.documentMetadata,
      project: a.documentMetadata.project ?? b.documentMetadata.project,
      client: a.documentMetadata.client ?? b.documentMetadata.client,
      documentDate: a.documentMetadata.documentDate ?? b.documentMetadata.documentDate,
      drawingRefs: [
        ...(a.documentMetadata.drawingRefs ?? []),
        ...(b.documentMetadata.drawingRefs ?? []),
      ],
      discipline: a.documentMetadata.discipline ?? b.documentMetadata.discipline,
    },
    billOfQuantities: [...boqMap.values()],
    lineItems: [...liMap.values()],
    vendor: a.vendor || b.vendor,
    total: Math.max(a.total, b.total),
    date: a.date ?? b.date,
    docType: a.docType || b.docType,
    summary: `${a.summary}\n---\n${b.summary}`.slice(0, 4000),
    enginesUsed: ["gemini", "openai"],
  });
}

function mergeScanResults(
  primary: ScanExtractionV5,
  secondary: ScanExtractionV5,
  fileName: string,
  scanMode: ScanModeV5,
): ScanExtractionV5 {
  if (scanMode === "DRAWING_BOQ") return mergeDrawingResults(primary, secondary, fileName);
  const lineMap = new Map<string, (typeof primary.lineItems)[0]>();
  for (const row of [...primary.lineItems, ...secondary.lineItems]) {
    const key = `${row.description}::${row.quantity ?? ""}::${row.lineTotal ?? ""}`;
    if (!lineMap.has(key)) lineMap.set(key, row);
  }
  const boqMap = new Map<string, (typeof primary.billOfQuantities)[0]>();
  for (const row of [...primary.billOfQuantities, ...secondary.billOfQuantities]) {
    const key = `${row.itemRef ?? ""}::${row.description}::${row.quantity ?? ""}`;
    if (!boqMap.has(key)) boqMap.set(key, row);
  }
  return emptyV5Base(fileName, scanMode, {
    documentMetadata: {
      ...primary.documentMetadata,
      project: primary.documentMetadata.project ?? secondary.documentMetadata.project,
      client: primary.documentMetadata.client ?? secondary.documentMetadata.client,
      documentDate: primary.documentMetadata.documentDate ?? secondary.documentMetadata.documentDate,
      drawingRefs: [
        ...(primary.documentMetadata.drawingRefs ?? []),
        ...(secondary.documentMetadata.drawingRefs ?? []),
      ],
      discipline: primary.documentMetadata.discipline ?? secondary.documentMetadata.discipline,
      sheetIndex: primary.documentMetadata.sheetIndex ?? secondary.documentMetadata.sheetIndex,
    },
    billOfQuantities: [...boqMap.values()],
    lineItems: [...lineMap.values()],
    vendor: primary.vendor !== "לא צוין" ? primary.vendor : secondary.vendor,
    total: Math.max(primary.total, secondary.total),
    date: primary.date ?? secondary.date,
    docType: primary.docType !== "UNKNOWN" ? primary.docType : secondary.docType,
    summary: [primary.summary, secondary.summary].filter(Boolean).join("\n---\n").slice(0, 4000),
    enginesUsed: [...(primary.enginesUsed ?? []), ...(secondary.enginesUsed ?? [])],
  });
}

function compactError(error: unknown, max = 320): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.slice(0, max);
}

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
  const v5Instruction = buildV5JsonInstruction(lang, scanMode);
  const extra = industryInstructionExtras(industry, orgTrade, messages);
  const userInstructionBlock = userInstruction?.trim()
    ? `\n\n### USER REQUEST\nThe user added these extra instructions. Follow them when they do not conflict with the required JSON schema or safety constraints:\n${userInstruction.trim().slice(0, 1200)}`
    : "";
  const fullInstruction = `${v5Instruction}\n\n${extra}${userInstructionBlock}`;

  const telemetry: TriEngineTelemetry = {
    documentAI: { phase: "idle" },
    gemini: { phase: "idle" },
    gpt: { phase: "idle" },
  };

  let v5: ScanExtractionV5;
  const runMode = engineRunMode === "AUTO" ? "MULTI_SEQUENTIAL" : engineRunMode;

  const runDocAiOnly = async (): Promise<ScanExtractionV5> => {
    const docErr = assertProviderConfigured("docai");
    if (docErr) throw new Error(docErr);
    const raw = await processDocumentAiRawForScanMode(base64, mimeType, scanMode);
    if (scanMode === "INVOICE_FINANCIAL" && (raw.processorKind === "INVOICE" || raw.processorKind === "EXPENSE")) {
      const out = mapDocAiEntitiesToInvoiceV5(raw.entities, raw.fullText, fileName, scanMode);
      out.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`];
      return out;
    }
    const normalized = await normalizeDocAiResultWithGemini(raw, fileName, fullInstruction);
    const out = coerceLegacyAiToV5(normalized, fileName, scanMode);
    out.enginesUsed = [`document_ai_${raw.processorKind.toLowerCase()}`, "gemini-normalizer"];
    return out;
  };

  const runGeminiOnly = async (): Promise<ScanExtractionV5> => {
    const gErr = assertProviderConfigured("gemini");
    if (gErr) throw new Error(gErr);
    const modelChain =
      scanMode === "DRAWING_BOQ"
        ? [GEMINI_FLAGSHIP_MODEL, ...getGeminiModelFallbackChain().filter((m) => m !== GEMINI_FLAGSHIP_MODEL)]
        : [...GEMINI_FLASH_PREFERRED, ...getGeminiModelFallbackChain()];
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
    telemetry.documentAI = includeDocAi ? { phase: "running" } : { phase: "skipped" };
    telemetry.gemini = { phase: "running" };
    telemetry.gpt = { phase: "running" };
    await emitTelemetry();

    const [docAiResult, geminiResult, openAiResult] = await Promise.allSettled([
      includeDocAi ? runDocAiOnly() : Promise.reject(new Error("Document AI skipped for this scan mode.")),
      runGeminiOnly(),
      runOpenAiOnly(),
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
    await emitTelemetry();

    if (!fulfilled.length) {
      throw new Error(`All selected engines failed. ${failures.join(" | ")}`);
    }

    v5 = fulfilled.reduce((acc, next) => mergeScanResults(acc, next, fileName, scanMode));
    v5.enginesUsed = fulfilled.flatMap((item) => item.enginesUsed ?? []);
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
        const normalized = await normalizeDocAiResultWithGemini(raw, fileName, fullInstruction);
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
          const tG = Date.now();
          telemetry.gemini = { phase: "running", detail: "fallback_after_openai_error" };
          await emitTelemetry();
          try {
            const gErr = assertProviderConfigured("gemini");
            if (gErr) throw new Error(gErr);
            const rawGemini = await geminiMultimodal(base64, mimeType, fullInstruction, [
              ...GEMINI_FLASH_PREFERRED,
              ...getGeminiModelFallbackChain(),
            ]);
            v5 = coerceLegacyAiToV5(rawGemini, fileName, scanMode);
            v5.enginesUsed = ["gemini-fallback"];
            telemetry.gemini = { phase: "ok", ms: Date.now() - tG, detail: "fallback_after_openai_error" };
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
            const geminiDetail =
              geminiError instanceof Error
                ? geminiError.message.slice(0, 500)
                : String(geminiError).slice(0, 500);
            throw new Error(
              `All extraction engines failed. ${docAiDetail} | OpenAI: ${openAiDetail} | Gemini fallback: ${geminiDetail}`,
            );
          }
        }
      }
      if (telemetry.gemini.phase === "idle") {
        telemetry.gemini = { phase: "skipped" };
      }
      await emitTelemetry();
    }
  } else if (scanMode === "DRAWING_BOQ") {
    const flagshipFirst = [GEMINI_FLAGSHIP_MODEL, ...getGeminiModelFallbackChain().filter((m) => m !== GEMINI_FLAGSHIP_MODEL)];

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
    v5 = mergeDrawingResults(a, b, fileName);
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
      raw = await geminiMultimodal(base64, mimeType, fullInstruction, [
        ...GEMINI_FLASH_PREFERRED,
        ...getGeminiModelFallbackChain(),
      ]);
      telemetry.gemini = { phase: "ok", ms: Date.now() - tF };
      await emitTelemetry();
    } catch (e) {
      telemetry.gemini = {
        phase: "error",
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      };
      await emitTelemetry();
      throw e;
    }
    v5 = coerceLegacyAiToV5(raw, fileName, scanMode);
    v5.enginesUsed = ["gemini-flash"];
    telemetry.documentAI = { phase: "skipped" };
    telemetry.gpt = { phase: "skipped" };
    await emitTelemetry();
    await emitPartial(v5, "gemini_flash");
  }

  const aiData = v5ToPersistableAiData(v5);
  aiData._triEngineTelemetry = telemetry;
  return { aiData, v5, telemetry };
}
