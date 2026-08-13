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
 * ספקי AI נתמכים לפי מפתחות ב-.env / Vercel.
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
      description: "סריקת מסמכים רב-ממדית, ניתוח נתונים משולב ו-vision",
      configured: isGeminiConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "openai",
      label: "OpenAI GPT",
      description: "מנוע שיחה וניתוח כללי עם תמיכה במסמכים מתקדמים",
      configured: isOpenAiConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      description: "מנוע ניתוח וכתיבה ארגונית לעומק",
      configured: isAnthropicConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "mistral",
      label: "Mistral",
      description: "Mistral Medium 3.5 — multimodal לסריקה, עברית, ו-fallback",
      configured: isMistralConfigured(),
      supportsDocumentScan: true,
    },
    {
      id: "groq",
      label: "Groq",
      description: "מנוע מהיר לטקסט ול-fallback בזמן עומס (GPT-OSS)",
      configured: isGroqConfigured(),
      supportsDocumentScan: false,
    },
    {
      id: "docai",
      label: "Google Document AI",
      description: "OCR מוסדי ברמת דיוק גבוהה למסמכים מורכבים",
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

/** לפחות מנוע צ'אט אחד — Gemini / OpenAI / Anthropic / Groq */
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
      return isGeminiConfigured() ? null : "חסר GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY";
    case "openai":
      return isOpenAiConfigured() ? null : "חסר OPENAI_API_KEY";
    case "anthropic":
      return isAnthropicConfigured() ? null : "חסר ANTHROPIC_API_KEY";
    case "groq":
      return isGroqConfigured() ? null : "חסר GROQ_API_KEY";
    case "mistral":
      return isMistralConfigured() ? null : "חסר MISTRAL_API_KEY";
    case "docai":
      return isDocAiConfigured()
        ? null
        : "חסר GOOGLE_DOCUMENT_AI_PROCESSOR_ID ו־אחד מ: GOOGLE_DOCUMENT_AI_CREDENTIALS או GOOGLE_APPLICATION_CREDENTIALS_JSON";
    default:
      return "ספק לא ידוע";
  }
}

/** אוגוסט 2026 — GPT-5.6 Sol (alias gpt-5.6) */
export const OPENAI_FLAGSHIP_MODEL = "gpt-5.6-sol";

export const OPENAI_VISION_FALLBACK_CHAIN: readonly string[] = [
  "gpt-5.6-sol",
  "gpt-5.6",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
] as const;

const OPENAI_MODEL_ALIASES: Record<string, string> = {
  "gpt-4o": OPENAI_FLAGSHIP_MODEL,
  "gpt-4o-mini": "gpt-5.6-luna",
  "gpt-4-turbo": OPENAI_FLAGSHIP_MODEL,
  "gpt-5.4": "gpt-5.6-terra",
  "gpt-5.4-mini": "gpt-5.6-luna",
  "gpt-5.4-turbo": OPENAI_FLAGSHIP_MODEL,
};

export const ANTHROPIC_FLAGSHIP_MODEL = "claude-sonnet-5";

export const ANTHROPIC_FALLBACK_CHAIN: readonly string[] = [
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
] as const;

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "claude-3-5-sonnet-20241022": ANTHROPIC_FLAGSHIP_MODEL,
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-3-opus-20240229": "claude-opus-5",
};

export const GROQ_FLAGSHIP_MODEL = "openai/gpt-oss-120b";

const GROQ_MODEL_ALIASES: Record<string, string> = {
  "llama-3.3-70b-versatile": GROQ_FLAGSHIP_MODEL,
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
};

function resolveOpenAiModelId(raw: string): string {
  const id = raw.trim();
  return OPENAI_MODEL_ALIASES[id] ?? id;
}

function resolveAnthropicModelId(raw: string): string {
  const id = raw.trim();
  return ANTHROPIC_MODEL_ALIASES[id] ?? id;
}

function resolveGroqModelId(raw: string): string {
  const id = raw.trim();
  return GROQ_MODEL_ALIASES[id] ?? id;
}

function resolveMistralModelId(raw: string): string {
  const id = raw.trim();
  return MISTRAL_MODEL_ALIASES[id] ?? id;
}

function dedupeStrings(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const resolved = p?.trim() ? resolveOpenAiModelId(p.trim()) : "";
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function getOpenAiVisionModel(): string {
  return resolveOpenAiModelId(env.OPENAI_VISION_MODEL?.trim() || OPENAI_FLAGSHIP_MODEL);
}

/** סדר ניסיונות ל־Chat Completions (תמונה / קובץ שאינו PDF בנתיב הישן) */
export function getOpenAiChatVisionModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    env.OPENAI_VISION_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

/** סדר ניסיונות ל־Responses API (PDF) */
export function getOpenAiResponsesModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    env.OPENAI_RESPONSES_MODEL?.trim(),
    env.OPENAI_VISION_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

export function isOpenAiModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return (
    b.includes("model_not_found") ||
    b.includes("does not exist") ||
    b.includes("invalid_model") ||
    (b.includes("the model") && b.includes("not found"))
  );
}

/** 404 / דגם לא קיים / מגבלת קצב — מעבר למודל הבא */
export function isOpenAiEligibleForModelFallback(status: number, body: string): boolean {
  if (isOpenAiModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}

/** צ'אט טקסט בלבד (ללא vision) — fallback דומה לסריקה */
export function getOpenAiChatTextModelCandidates(): string[] {
  return dedupeStrings([
    env.OPENAI_CHAT_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

export function getAnthropicModel(): string {
  return resolveAnthropicModelId(env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_FLAGSHIP_MODEL);
}

export function getAnthropicModelCandidates(uiOverride?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [uiOverride, env.ANTHROPIC_MODEL?.trim(), ...ANTHROPIC_FALLBACK_CHAIN]) {
    const s = p?.trim() ? resolveAnthropicModelId(p.trim()) : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isAnthropicModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return (
    (b.includes("invalid_request_error") && b.includes("model")) ||
    b.includes("model_not_found") ||
    (b.includes("model") && b.includes("not found"))
  );
}

export function isAnthropicEligibleForModelFallback(status: number, body: string): boolean {
  if (isAnthropicModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}

export function getGroqModel(): string {
  return resolveGroqModelId(env.GROQ_MODEL?.trim() || GROQ_FLAGSHIP_MODEL);
}

/** Mistral Medium 3.5 — מחליף את Pixtral Large (retired) */
export const MISTRAL_VISION_FLAGSHIP = "mistral-medium-3-5";
export const MISTRAL_TEXT_FLAGSHIP = "mistral-small-latest";

const MISTRAL_MODEL_ALIASES: Record<string, string> = {
  "pixtral-large-latest": MISTRAL_VISION_FLAGSHIP,
  "pixtral-large-2411": MISTRAL_VISION_FLAGSHIP,
  "pixtral-12b-2409": MISTRAL_TEXT_FLAGSHIP,
  "mistral-large-latest": MISTRAL_VISION_FLAGSHIP,
  "mistral-medium-latest": MISTRAL_VISION_FLAGSHIP,
};

/** מודל ל-vision / סריקת מסמכים */
export function getMistralVisionModel(): string {
  return resolveMistralModelId(env.MISTRAL_VISION_MODEL?.trim() || MISTRAL_VISION_FLAGSHIP);
}

/** מודל לצ'אט טקסט */
export function getMistralModel(): string {
  return resolveMistralModelId(env.MISTRAL_MODEL?.trim() || MISTRAL_TEXT_FLAGSHIP);
}

export function getMistralVisionModelCandidates(uiOverride?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [
    uiOverride,
    env.MISTRAL_VISION_MODEL?.trim(),
    MISTRAL_VISION_FLAGSHIP,
    "mistral-medium-latest",
    MISTRAL_TEXT_FLAGSHIP,
  ]) {
    const s = p?.trim() ? resolveMistralModelId(p.trim()) : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isMistralModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return b.includes("model not found") || b.includes("unknown model");
}

export function isMistralEligibleForModelFallback(status: number, body: string): boolean {
  if (isMistralModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}
