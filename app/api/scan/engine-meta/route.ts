import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonUnauthorized } from "@/lib/api-json";
import {
  ANTHROPIC_FLAGSHIP_MODEL,
  getOpenAiResponsesModelCandidates,
  getOpenAiVisionModel,
  isDocAiConfigured,
  isGeminiConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";
import { getDocAiProcessorConfigs } from "@/lib/ai-extract-docai";
import {
  AI_ENGINE_CATALOG_UPDATED_AT,
  GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  GEMINI_STABLE_TEXT_MODEL,
  GEMINI_FLAGSHIP_PREVIEW_MODEL,
  getGeminiModelId,
} from "@/lib/gemini-model";

export const dynamic = "force-dynamic";

function openAiUiLabel(id: string): string {
  const t = id.trim();
  if (t === "gpt-5.5") return "GPT-5.5";
  if (t === "gpt-5.5-2026-04-23") return "GPT-5.5 Snapshot";
  if (t === "gpt-5.4") return "GPT-5.4";
  if (t === "gpt-5.4-mini") return "GPT-5.4 Mini";
  if (t === "gpt-4o-mini") return "GPT-4o mini";
  if (t === "gpt-4o") return "GPT-4o";
  if (t.startsWith("gpt-")) return t;
  return t;
}

function geminiUiLabel(id: string): string {
  if (id === "gemini-2.5-flash-native-audio-latest") return "Gemini 2.5 Live (Native Audio)";
  if (id === "gemini-3.1-flash-live-preview") return "Gemini 3.1 Live Preview";
  if (id === "gemini-3-flash-preview") return "Gemini 3 Flash Preview";
  if (id === "gemini-2.5-pro") return "Gemini 2.5 Pro";
  if (id === "gemini-2.5-flash") return "Gemini 2.5 Flash";
  return id.replace(/^gemini-/, "");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return jsonUnauthorized("לא מחובר.");
  }

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
    },
    documentAI: {
      processors: getDocAiProcessorConfigs(),
    },
    gemini: {
      stableTextModelId: GEMINI_STABLE_TEXT_MODEL,
      previewModelId: GEMINI_FLAGSHIP_PREVIEW_MODEL,
      liveModelId: GEMINI_LIVE_NATIVE_AUDIO_MODEL,
      liveLabel: geminiUiLabel(GEMINI_LIVE_NATIVE_AUDIO_MODEL),
      primaryModelId: geminiPrimaryModelId,
      primaryLabel: geminiUiLabel(geminiPrimaryModelId),
    },
    anthropic: {
      flagshipModelId: ANTHROPIC_FLAGSHIP_MODEL,
    },
    openai: {
      defaultModelId: openaiDefaultModelId,
      modelOptions,
    },
  });
}
