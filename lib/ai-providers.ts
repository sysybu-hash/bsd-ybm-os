import { isAnyDocAiProcessorConfigured } from "@/lib/ai-extract-docai";
import { env } from "@/lib/env";

export {
  AI_SERVICE_UNAVAILABLE_CODE,
  AI_SERVICE_UNAVAILABLE_MESSAGE,
  AiServiceUnavailableError,
  assertAiServicesAvailable,
  checkAiServicesAvailable,
  isAiFallbackDisabled,
} from "@/lib/ai-kill-switch";

/**
 * ׳¡׳₪׳§׳™ AI ׳ ׳×׳׳›׳™׳ ׳׳₪׳™ ׳׳₪׳×׳—׳•׳× ׳‘-.env / Vercel.
 */

export type AiProviderId = "gemini" | "openai" | "anthropic" | "groq" | "mistral" | "docai";

export type AiProviderPublic = {
  id: AiProviderId;
  label: string;
  description: string;
  configured: boolean;
  supportsDocumentScan: boolean;
};

export type AiProviderWithPlan = AiProviderPublic & {
  allowedByPlan: boolean;
};

function has(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isGeminiConfigured(): boolean {
  return has(env.GOOGLE_GENERATIVE_AI_API_KEY) || has(env.GEMINI_API_KEY);
}

export function isOpenAiConfigured(): boolean {
  return has(env.OPENAI_API_KEY);
}

export function isAnthropicConfigured(): boolean {
  return has(env.ANTHROPIC_API_KEY);
}

export function isGroqConfigured(): boolean {
  return has(env.GROQ_API_KEY);
}

export function isMistralConfigured(): boolean {
  return has(env.MISTRAL_API_KEY);
}

export function isDocAiConfigured(): boolean {
  const creds =
    has(env.GOOGLE_DOCUMENT_AI_CREDENTIALS) ||
    has(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  return isAnyDocAiProcessorConfigured() && creds;
}

export function getAiProvidersPublic(): AiProviderPublic[] {
  return [
    {
      id: "gemini",
      label: "Google Gemini",
      description: "׳¡׳¨׳™׳§׳× ׳׳¡׳׳›׳™׳ ׳¨׳‘-׳׳׳“׳™׳×, ׳ ׳™׳×׳•׳— ׳ ׳×׳•׳ ׳™׳ ׳׳©׳•׳׳‘ ׳•-vision",
      configured: isGeminiConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "openai",
      label: "OpenAI GPT",
      description: "׳׳ ׳•׳¢ ׳©׳™׳—׳” ׳•׳ ׳™׳×׳•׳— ׳›׳׳׳™ ׳¢׳ ׳×׳׳™׳›׳” ׳‘׳׳¡׳׳›׳™׳ ׳׳×׳§׳“׳׳™׳",
      configured: isOpenAiConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      description: "׳׳ ׳•׳¢ ׳ ׳™׳×׳•׳— ׳•׳›׳×׳™׳‘׳” ׳׳¨׳’׳•׳ ׳™׳× ׳׳¢׳•׳׳§",
      configured: isAnthropicConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "mistral",
      label: "Mistral",
      description: "Mistral Medium 3.5 ג€” multimodal ׳׳¡׳¨׳™׳§׳”, ׳¢׳‘׳¨׳™׳×, ׳•-fallback",
      configured: isMistralConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "groq",
      label: "Groq",
      description: "׳׳ ׳•׳¢ ׳׳”׳™׳¨ ׳׳˜׳§׳¡׳˜ ׳•׳-fallback ׳‘׳–׳׳ ׳¢׳•׳׳¡ (GPT-OSS)",
      configured: isGroqConfigured(),
      supportsDocumentScan: false,
    },
    {
      id: "docai",
      label: "Google Document AI",
      description: "OCR ׳׳•׳¡׳“׳™ ׳‘׳¨׳׳× ׳“׳™׳•׳§ ׳’׳‘׳•׳”׳” ׳׳׳¡׳׳›׳™׳ ׳׳•׳¨׳›׳‘׳™׳",
      configured: isDocAiConfigured(),
      supportsDocumentScan: true,
    },
  ];
}

export function normalizeAiProviderId(raw: string | null | undefined): AiProviderId {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    value === "openai" ||
    value === "anthropic" ||
    value === "groq" ||
    value === "gemini" ||
    value === "mistral" ||
    value === "docai"
  ) {
    return value as AiProviderId;
  }
  if (value === "mindstudio") return "gemini";
  return "gemini";
}

/** ׳׳₪׳—׳•׳× ׳׳ ׳•׳¢ ׳¦'׳׳˜ ׳׳—׳“ ג€” Gemini / OpenAI / Anthropic / Groq */
export function isAnyAiChatProviderConfigured(): boolean {
  return (
    isGeminiConfigured() ||
    isOpenAiConfigured() ||
    isAnthropicConfigured() ||
    isMistralConfigured() ||
    isGroqConfigured()
  );
}

export function assertProviderConfigured(id: AiProviderId): string | null {
  switch (id) {
    case "gemini":
      return isGeminiConfigured() ? null : "׳—׳¡׳¨ GOOGLE_GENERATIVE_AI_API_KEY ׳׳• GEMINI_API_KEY";
    case "openai":
      return isOpenAiConfigured() ? null : "׳—׳¡׳¨ OPENAI_API_KEY";
    case "anthropic":
      return isAnthropicConfigured() ? null : "׳—׳¡׳¨ ANTHROPIC_API_KEY";
    case "groq":
      return isGroqConfigured() ? null : "׳—׳¡׳¨ GROQ_API_KEY";
    case "mistral":
      return isMistralConfigured() ? null : "׳—׳¡׳¨ MISTRAL_API_KEY";
    case "docai":
      return isDocAiConfigured()
        ? null
        : "׳—׳¡׳¨ GOOGLE_DOCUMENT_AI_PROCESSOR_ID ׳•ײ¾׳׳—׳“ ׳: GOOGLE_DOCUMENT_AI_CREDENTIALS ׳׳• GOOGLE_APPLICATION_CREDENTIALS_JSON";
    default:
      return "׳¡׳₪׳§ ׳׳ ׳™׳“׳•׳¢";
  }
}

/** קטלוג מודלים ושרשראות fallback — פוצל ל-ai-provider-models.ts (נשמר re-export לתאימות) */
export * from "@/lib/ai-provider-models";

