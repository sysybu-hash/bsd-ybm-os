import { isAnyDocAiProcessorConfigured } from "@/lib/ai-extract-docai";

/**
 * ספקי AI נתמכים לפי מפתחות ב-.env / Vercel.
 * שים לב: MindStudio נשאר כסוג שמור לאחור, אבל לא נחשף ב-UI עד שתהיה אינטגרציית runtime אמיתית.
 */

export type AiProviderId = "gemini" | "openai" | "anthropic" | "groq" | "mindstudio" | "docai";

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
  return has(process.env.GOOGLE_GENERATIVE_AI_API_KEY) || has(process.env.GEMINI_API_KEY);
}

export function isOpenAiConfigured(): boolean {
  return has(process.env.OPENAI_API_KEY);
}

export function isAnthropicConfigured(): boolean {
  return has(process.env.ANTHROPIC_API_KEY);
}

export function isGroqConfigured(): boolean {
  return has(process.env.GROQ_API_KEY);
}

export function isMindStudioConfigured(): boolean {
  return has(process.env.MIND_STUDIO_API_KEY);
}

export function isDocAiConfigured(): boolean {
  const creds =
    has(process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS) ||
    has(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
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
      id: "groq",
      label: "Groq (Llama)",
      description: "מנוע מהיר במיוחד לטקסט ול-fallback בזמן עומס",
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
    value === "mindstudio" ||
    value === "docai"
  ) {
    return value as AiProviderId;
  }
  return "gemini";
}

/** לפחות מנוע צ'אט אחד — Gemini / OpenAI / Anthropic / Groq */
export function isAnyAiChatProviderConfigured(): boolean {
  return (
    isGeminiConfigured() ||
    isOpenAiConfigured() ||
    isAnthropicConfigured() ||
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
    case "mindstudio":
      return "MindStudio עדיין לא מחובר ב-runtime בפרויקט הזה";
    case "docai":
      return isDocAiConfigured()
        ? null
        : "חסר GOOGLE_DOCUMENT_AI_PROCESSOR_ID ו־אחד מ: GOOGLE_DOCUMENT_AI_CREDENTIALS או GOOGLE_APPLICATION_CREDENTIALS_JSON";
    default:
      return "ספק לא ידוע";
  }
}

/** April 2026 — flagship ויזואלי/הנדסי */
export const OPENAI_FLAGSHIP_MODEL = "gpt-5.5";

export const OPENAI_VISION_FALLBACK_CHAIN: readonly string[] = [
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-4o-mini",
  "gpt-4o",
] as const;

export const ANTHROPIC_FLAGSHIP_MODEL = "claude-sonnet-4-6";

export const ANTHROPIC_FALLBACK_CHAIN: readonly string[] = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
] as const;

function dedupeStrings(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const s = p?.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function getOpenAiVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL?.trim() || OPENAI_FLAGSHIP_MODEL;
}

/** סדר ניסיונות ל־Chat Completions (תמונה / קובץ שאינו PDF בנתיב הישן) */
export function getOpenAiChatVisionModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    process.env.OPENAI_VISION_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

/** סדר ניסיונות ל־Responses API (PDF) */
export function getOpenAiResponsesModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    process.env.OPENAI_RESPONSES_MODEL?.trim(),
    process.env.OPENAI_VISION_MODEL?.trim(),
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
    process.env.OPENAI_CHAT_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_FLAGSHIP_MODEL;
}

export function getAnthropicModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    process.env.ANTHROPIC_MODEL?.trim(),
    ...ANTHROPIC_FALLBACK_CHAIN,
  ]);
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
  return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
}
