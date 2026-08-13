import { env } from "@/lib/env";

/**
 * קטלוג מודלי Gemini — עודכן 13/08/2026.
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://ai.google.dev/gemini-api/docs/deprecations
 */

export const AI_ENGINE_CATALOG_UPDATED_AT = "2026-08-13";

/** GA — יולי 2026 */
export const GEMINI_STABLE_TEXT_MODEL = "gemini-3.6-flash";

/** GA — יולי 2026; סיווג / throughput */
export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";

/** Flash הקודם — עדיין GA, fallback */
export const GEMINI_PREVIOUS_FLASH_MODEL = "gemini-3.5-flash";

/** Pro ל-CRM פרימיום / ניתוח עמוק */
export const GEMINI_PREMIUM_TEXT_MODEL = "gemini-3.1-pro-preview";

/** מיושן; נשמר לתאימות env */
export const GEMINI_LEGACY_PREVIEW_MODEL = "gemini-3-flash-preview";

/** גרמושקה / BOQ */
export const GEMINI_BLUEPRINT_PRIMARY_MODEL = GEMINI_STABLE_TEXT_MODEL;

/** Live API — המומלץ הרשמי */
export const GEMINI_LIVE_PRIMARY_MODEL = "gemini-3.1-flash-live-preview";

/** Live API — native audio (fallback עד כיבוי 2.5) */
export const GEMINI_LIVE_NATIVE_AUDIO_MODEL = "gemini-2.5-flash-native-audio-latest";

/** 3.1 Live ראשון; 2.5 native-audio כגיבוי ליציבות WebSocket. */
export const GEMINI_LIVE_MODEL_FALLBACK_CHAIN: readonly string[] = [
  GEMINI_LIVE_PRIMARY_MODEL,
  GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

/** שרשרת טקסט (צ'אט, מסמכים) — ללא דור 2.5 (כיבוי 16/10/2026) */
export const GEMINI_MODEL_FALLBACK_TIER: readonly string[] = [
  GEMINI_STABLE_TEXT_MODEL,
  GEMINI_PREVIOUS_FLASH_MODEL,
  GEMINI_LITE_MODEL,
  "gemini-3.1-flash-lite",
] as const;

export const GEMINI_NOTEBOOKLM_DEFAULT_MODEL = GEMINI_STABLE_TEXT_MODEL;

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-8b": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-002": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-latest": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-pro": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-3-flash-preview": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-pro": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-3.1-pro-stable": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-3.1-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-flash-stable": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-flash-live": GEMINI_LIVE_PRIMARY_MODEL,
  "gemini-3.1-flash-live-preview": GEMINI_LIVE_PRIMARY_MODEL,
  "gemini-2.5-flash-live-preview": GEMINI_LIVE_PRIMARY_MODEL,
  "gemini-2.5-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-2.5-pro": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-2.5-flash-lite": GEMINI_LITE_MODEL,
  "gemini-2.0-flash-001": GEMINI_STABLE_TEXT_MODEL,
  "gemini-2.0-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-2.0-flash-lite": GEMINI_LITE_MODEL,
  "gemini-2.0-flash-exp": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-2.0-pro-stable": GEMINI_PREMIUM_TEXT_MODEL,
  "gemini-2.0-flash-live-001": GEMINI_LIVE_PRIMARY_MODEL,
};

export function resolveGeminiModelId(raw: string): string {
  const id = raw.trim();
  return LEGACY_MODEL_ALIASES[id] ?? id;
}

export function getGeminiLiveModelId(): string {
  const fromEnv = env.GEMINI_LIVE_MODEL?.trim();
  if (fromEnv) return resolveGeminiModelId(fromEnv);
  return GEMINI_LIVE_PRIMARY_MODEL;
}

export function getGeminiLiveModelFallbackChain(): string[] {
  return dedupeModels([getGeminiLiveModelId(), ...GEMINI_LIVE_MODEL_FALLBACK_CHAIN]);
}

function dedupeModels(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const m = id?.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

export function getGeminiModelId(): string {
  const fromEnv =
    env.GEMINI_MODEL?.trim() ||
    env.GOOGLE_GENERATIVE_AI_MODEL?.trim();
  const raw = fromEnv || GEMINI_STABLE_TEXT_MODEL;
  return resolveGeminiModelId(raw);
}

export function getGeminiModelFallbackChain(): string[] {
  const primary = getGeminiModelId();
  return dedupeModels([primary, ...GEMINI_MODEL_FALLBACK_TIER]);
}

function chainWithOptionalEnv(fromEnv: string | undefined, extras: string[]): string[] {
  return dedupeModels([
    ...(fromEnv ? [resolveGeminiModelId(fromEnv)] : []),
    ...extras,
  ]);
}

/** שרשרת לפענוח גרמושקה / תוכניות ביצוע */
export function getBlueprintAnalysisModelChain(): string[] {
  const flashOnly = env.BLUEPRINT_USE_FLASH_ONLY === true;
  const fromEnv = env.GEMINI_BLUEPRINT_MODEL?.trim();
  const primary = flashOnly ? GEMINI_LITE_MODEL : GEMINI_BLUEPRINT_PRIMARY_MODEL;
  return chainWithOptionalEnv(fromEnv, [primary, ...GEMINI_MODEL_FALLBACK_TIER]);
}

/** שרשרות לפי סוג סריקה — ניתנות לדריסה דרך env vars */
export function getInvoiceModelChain(): string[] {
  return chainWithOptionalEnv(env.GEMINI_INVOICE_MODEL?.trim(), [
    GEMINI_STABLE_TEXT_MODEL,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

export function getQuoteModelChain(): string[] {
  return chainWithOptionalEnv(env.GEMINI_QUOTE_MODEL?.trim(), [
    GEMINI_STABLE_TEXT_MODEL,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

export function getSiteLogModelChain(): string[] {
  return chainWithOptionalEnv(env.GEMINI_SITE_LOG_MODEL?.trim(), [
    GEMINI_STABLE_TEXT_MODEL,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

export function getProgressBillModelChain(): string[] {
  return chainWithOptionalEnv(env.GEMINI_PROGRESS_BILL_MODEL?.trim(), [
    GEMINI_STABLE_TEXT_MODEL,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

export function getGeneralModelChain(): string[] {
  return chainWithOptionalEnv(env.GEMINI_GENERAL_MODEL?.trim(), [
    GEMINI_STABLE_TEXT_MODEL,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

/** בוחר שרשרת מודל לפי סוג סריקה */
export function getModelChainForScanMode(scanMode: string): string[] {
  switch (scanMode) {
    case "INVOICE_FINANCIAL": return getInvoiceModelChain();
    case "DRAWING_BOQ":       return getBlueprintAnalysisModelChain();
    case "QUOTE_BOQ":         return getQuoteModelChain();
    case "SITE_LOG":          return getSiteLogModelChain();
    case "PROGRESS_BILL":     return getProgressBillModelChain();
    default:                  return getGeneralModelChain();
  }
}

export function isGeminiLiveModalityCombinationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("response modalities") ||
    lower.includes("response_modalities") ||
    (lower.includes("not supported") &&
      lower.includes("audio") &&
      (lower.includes("text") || lower.includes("modality")))
  );
}

export function isLikelyGeminiModelUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    isGeminiLiveModalityCombinationError(err) ||
    lower.includes("404") ||
    lower.includes("429") ||
    lower.includes("not found") ||
    lower.includes("not available") ||
    lower.includes("invalid model") ||
    lower.includes("503") ||
    lower.includes("resource exhausted") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("does not exist") ||
    // 400 מה-API יכול להיות כשל זמני/ספציפי-למודל בעיבוד תמונה — כדאי לנסות
    // מודל אחר בשרשרת לפני שנכשלים לגמרי.
    (lower.includes("400") &&
      (lower.includes("unable to process input image") ||
        lower.includes("bad request")))
  );
}

export function isGeminiApiKeyError(err: unknown): boolean {
  const blob = `${err instanceof Error ? err.message : String(err)} ${JSON.stringify(err)}`.toLowerCase();
  return (
    blob.includes("api_key_invalid") ||
    blob.includes("api key expired") ||
    blob.includes("invalid api key") ||
    blob.includes("please renew the api key")
  );
}
