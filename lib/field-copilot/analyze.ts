import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { createLogger } from "@/lib/logger";
import { GEMINI_MODEL_FALLBACK_TIER } from "@/lib/gemini-model";
import { isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import {
  coerceLegacyAiToV5,
  computePriceAlertPending,
  type LineItemV5,
  type ScanExtractionV5,
} from "@/lib/scan-schema-v5";
import { buildFieldCopilotInstruction } from "@/lib/field-copilot/instruction";
import type { MessageTree } from "@/lib/i18n/keys";

const log = createLogger("field-copilot-analyze");

export type FieldCopilotAnalyzeInput = {
  locale: string;
  localeLang: string;
  industry: string;
  trade: string | null;
  messages: MessageTree;
  transcript?: string | null;
  userNotes?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  images: { base64: string; mimeType: string }[];
};

export type FieldCopilotAnalyzeResult = {
  extraction: ScanExtractionV5;
  assumptions: string[];
  scopeSummary: string;
};

function stripPricesForManualEntry(items: LineItemV5[]): LineItemV5[] {
  return items.map((row) => ({
    ...row,
    unitPrice: 0,
    lineTotal: 0,
  }));
}

function parseAssumptions(raw: Record<string, unknown>): string[] {
  const a = raw.assumptions;
  if (!Array.isArray(a)) return [];
  return a
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 12);
}

export async function analyzeFieldCapture(
  input: FieldCopilotAnalyzeInput,
): Promise<FieldCopilotAnalyzeResult> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error("חסר מפתח Gemini");

  const instruction = buildFieldCopilotInstruction({
    localeLang: input.localeLang,
    industry: input.industry,
    trade: input.trade,
    messages: input.messages,
    transcript: input.transcript,
    userNotes: input.userNotes,
    projectName: input.projectName,
    clientName: input.clientName,
  });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: `${instruction}\nReturn a single JSON object only, no markdown.` },
  ];
  for (const img of input.images.slice(0, 10)) {
    parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;
  let raw: Record<string, unknown> | null = null;

  for (const modelId of GEMINI_MODEL_FALLBACK_TIER) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(parts);
      raw = parseModelJsonText(result.response.text());
      break;
    } catch (err: unknown) {
      lastErr = err;
      log.warn("Gemini analyze attempt failed", {
        modelId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }

  if (!raw) {
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  const assumptions = parseAssumptions(raw);
  const fileName = "field-capture";
  let extraction = coerceLegacyAiToV5(raw, fileName, "QUOTE_BOQ");
  extraction.lineItems = stripPricesForManualEntry(extraction.lineItems);
  extraction.priceAlertPending = true;
  extraction.total = extraction.lineItems.reduce(
    (sum, row) => sum + (row.lineTotal ?? 0),
    0,
  );
  extraction.priceAlertPending = computePriceAlertPending(extraction.lineItems);

  if (input.projectName && !extraction.documentMetadata.project) {
    extraction.documentMetadata.project = input.projectName;
  }
  if (input.clientName && !extraction.documentMetadata.client) {
    extraction.documentMetadata.client = input.clientName;
  }

  const scopeSummary =
    typeof raw.scopeSummary === "string" && raw.scopeSummary.trim()
      ? raw.scopeSummary.trim()
      : extraction.summary || assumptions.join("; ");

  return { extraction, assumptions, scopeSummary };
}
