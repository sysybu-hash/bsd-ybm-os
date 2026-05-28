import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { GEMINI_MODEL_FALLBACK_TIER, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import {
  coerceLegacyAiToV5,
  type ScanExtractionV5,
} from "@/lib/scan-schema-v5";
import type { AppLocale } from "@/lib/i18n/config";

const log = createLogger("marketing-demo-scan");

export type MarketingDemoScanAnalyzeInput = Readonly<{
  locale: AppLocale;
  fileName: string;
  mimeType: string;
  imageBase64: string;
}>;

export type MarketingDemoScanAnalyzeResult = Readonly<{
  extraction: ScanExtractionV5;
  summary: string;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
}>;

function localeLang(locale: AppLocale): string {
  if (locale === "en") return "English";
  if (locale === "ru") return "Russian";
  return "Hebrew";
}

function buildInstruction(locale: AppLocale): string {
  const lang = localeLang(locale);
  return [
    "You analyze ONE business document image for a public marketing demo of BSD-YBM OS.",
    `Reply language for summary and labels: ${lang}.`,
    "CRITICAL: Extract ONLY data that is clearly visible in the document. Do NOT invent vendors, amounts, or projects.",
    "If a field is missing or illegible, use null or empty and lower confidence.",
    "Return a single JSON object (no markdown) with keys:",
    "docType, vendor, client, project, documentDate (YYYY-MM-DD or null), total (number), currency (ILS|USD|EUR), taxId,",
    "lineItems (array of {description, quantity, lineTotal, unitPrice}), summary (2-3 sentences in the reply language),",
    "confidence (high|medium|low), assumptions (array of short strings, max 6).",
    "Prefer scan mode INVOICE_FINANCIAL for invoices/receipts.",
  ].join("\n");
}

function parseConfidence(raw: Record<string, unknown>): "high" | "medium" | "low" {
  const c = typeof raw.confidence === "string" ? raw.confidence.toLowerCase() : "";
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

function parseAssumptions(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.assumptions)) return [];
  return raw.assumptions
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

export async function analyzeMarketingDemoDocument(
  input: MarketingDemoScanAnalyzeInput,
): Promise<MarketingDemoScanAnalyzeResult> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error("חסר מפתח Gemini");

  const instruction = buildInstruction(input.locale);
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: `${instruction}\nFile: ${input.fileName}` },
    { inlineData: { data: input.imageBase64, mimeType: input.mimeType } },
  ];

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
      log.warn("marketing demo scan model failed", {
        modelId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }

  if (!raw) {
    throw lastErr instanceof Error ? lastErr : new Error("ניתוח המסמך נכשל");
  }

  const extraction = coerceLegacyAiToV5(raw, input.fileName, "INVOICE_FINANCIAL");
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : extraction.summary;

  return {
    extraction,
    summary,
    confidence: parseConfidence(raw),
    assumptions: parseAssumptions(raw),
  };
}
