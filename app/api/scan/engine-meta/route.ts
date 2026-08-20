import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  ANTHROPIC_FLAGSHIP_MODEL,
  MISTRAL_VISION_FLAGSHIP,
  getMistralVisionModel,
  getOpenAiResponsesModelCandidates,
  getOpenAiVisionModel,
  isDocAiConfigured,
  isGeminiConfigured,
  isAnthropicConfigured,
  isMistralConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";
import { getDocAiProcessorConfigs } from "@/lib/ai-extract-docai";
import {
  AI_ENGINE_CATALOG_UPDATED_AT,
  GEMINI_LIVE_PRIMARY_MODEL,
  GEMINI_STABLE_TEXT_MODEL,
  GEMINI_LEGACY_PREVIEW_MODEL,
  getGeminiModelId,
} from "@/lib/gemini-model";

export const dynamic = "force-dynamic";

function openAiUiLabel(id: string): string {
  const t = id.trim();
  if (t === "gpt-5.6-sol" || t === "gpt-5.6") return "GPT-5.6 Sol";
  if (t === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (t === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (t === "gpt-5.5") return "GPT-5.5";
  if (t === "gpt-5.5-2026-04-23") return "GPT-5.5 Snapshot";
  if (t.startsWith("gpt-")) return t;
  return t;
}

function geminiUiLabel(id: string): string {
  if (id === "gemini-3.6-flash") return "Gemini 3.6 Flash";
  if (id === "gemini-3.5-flash") return "Gemini 3.5 Flash";
  if (id === "gemini-3.5-flash-lite") return "Gemini 3.5 Flash-Lite";
  if (id === "gemini-3.1-pro-preview") return "Gemini 3.1 Pro Preview";
  if (id === "gemini-2.5-flash-native-audio-latest") return "Gemini 2.5 Live (Native Audio)";
  if (id === "gemini-3.1-flash-live-preview") return "Gemini 3.1 Live Preview";
  if (id === "gemini-3-flash-preview") return "Gemini 3 Flash Preview";
  return id.replace(/^gemini-/, "");
}

function docAiMissingConfig(): string[] {
  const missing: string[] = [];
  const creds = process.env["GOOGLE_DOCUMENT_AI_CREDENTIALS"] || process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"];
  if (!creds) missing.push("GOOGLE_DOCUMENT_AI_CREDENTIALS");
  const hasProcessor =
    process.env["GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID"] ||
    process.env["GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID"] ||
    process.env["GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID"] ||
    process.env["GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_ID"] ||
    process.env["GOOGLE_DOCUMENT_AI_PROCESSOR_ID"];
  if (!hasProcessor) missing.push("GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID");
  return missing;
}

export const GET = withWorkspacesAuth(async () => {
  const geminiPrimaryModelId = getGeminiModelId();
  const openaiDefaultModelId = getOpenAiVisionModel();
  const rawCandidates = getOpenAiResponsesModelCandidates(undefined);
  const modelOptions = rawCandidates.slice(0, 12).map((id) => ({
    id,
    label: openAiUiLabel(id),
  }));

  return NextResponse.json({
    catalogUpdatedAt: AI_ENGINE_CATALOG_UPDATED_AT,
    configured: {
      documentAI: isDocAiConfigured(),
      gemini: isGeminiConfigured(),
      openai: isOpenAiConfigured(),
      mistral: isMistralConfigured(),
      anthropic: isAnthropicConfigured(),
    },
    missingConfig: {
      documentAI: isDocAiConfigured() ? [] : docAiMissingConfig(),
      gemini: isGeminiConfigured() ? [] : ["GOOGLE_GENERATIVE_AI_API_KEY"],
      openai: isOpenAiConfigured() ? [] : ["OPENAI_API_KEY"],
      mistral: isMistralConfigured() ? [] : ["MISTRAL_API_KEY"],
      anthropic: isAnthropicConfigured() ? [] : ["ANTHROPIC_API_KEY"],
    },
    documentAI: {
      processors: getDocAiProcessorConfigs(),
    },
    gemini: {
      stableTextModelId: GEMINI_STABLE_TEXT_MODEL,
      previewModelId: GEMINI_LEGACY_PREVIEW_MODEL,
      liveModelId: GEMINI_LIVE_PRIMARY_MODEL,
      liveLabel: geminiUiLabel(GEMINI_LIVE_PRIMARY_MODEL),
      primaryModelId: geminiPrimaryModelId,
      primaryLabel: geminiUiLabel(geminiPrimaryModelId),
    },
    anthropic: {
      flagshipModelId: ANTHROPIC_FLAGSHIP_MODEL,
    },
    mistral: {
      flagshipModelId: MISTRAL_VISION_FLAGSHIP,
      primaryModelId: getMistralVisionModel(),
      primaryLabel: getMistralVisionModel()
        .replace("mistral-medium-3-5", "Mistral Medium 3.5")
        .replace("mistral-medium-latest", "Mistral Medium")
        .replace("mistral-small-latest", "Mistral Small")
        .replace("pixtral-large-latest", "Mistral Medium 3.5")
        .replace("pixtral-12b-2409", "Mistral Small")
        .replace("mistral-large-latest", "Mistral Medium 3.5"),
    },
    openai: {
      defaultModelId: openaiDefaultModelId,
      modelOptions,
    },
  });
});
