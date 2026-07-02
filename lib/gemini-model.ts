import { env } from "@/lib/env";

/**
 * קטלוג מודלי Gemini — עודכן לפי Google I/O 2026 (19/05).
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://dev.to/googleai/gemini-35-flash-developer-guide-1i46
 */

export const AI_ENGINE_CATALOG_UPDATED_AT = "2026-05-26";

/** GA — Google I/O 2026 (19/05) */
export const GEMINI_STABLE_TEXT_MODEL = "gemini-3.5-flash";

/** מיושן; נשמר לתאימות env */
export const GEMINI_LEGACY_PREVIEW_MODEL = "gemini-3-flash-preview";


/** גרמושקה / BOQ — אותו מודל GA (קוד + סוכנים) */
export const GEMINI_BLUEPRINT_PRIMARY_MODEL = "gemini-3.5-flash";

/**
 * Live API — אודיו native.
 */
export const GEMINI_LIVE_NATIVE_AUDIO_MODEL = "gemini-2.5-flash-native-audio-latest";

/** יציב ראשון — preview models עלולים להחזיר Internal error ב-WebSocket. */
export const GEMINI_LIVE_MODEL_FALLBACK_CHAIN: readonly string[] = [
  GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
  "gemini-3.1-flash-live-preview",
] as const;

/** שרשרת טקסט (צ'אט, מסמכים) */
export const GEMINI_MODEL_FALLBACK_TIER: readonly string[] = [
  GEMINI_STABLE_TEXT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

export const GEMINI_NOTEBOOKLM_DEFAULT_MODEL = GEMINI_STABLE_TEXT_MODEL;

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-8b": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-002": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-latest": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-3-flash-preview": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-3.1-pro-stable": "gemini-2.5-pro",
  "gemini-3.1-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-flash-stable": GEMINI_STABLE_TEXT_MODEL,
  "gemini-3.1-flash-live": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-3.1-flash-live-preview": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.0-flash-001": "gemini-2.5-flash",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.0-flash-exp": "gemini-2.5-pro",
  "gemini-2.0-pro-stable": "gemini-2.5-pro",
  "gemini-2.0-flash-live-001": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
};

export function getGeminiLiveModelId(): string {
  const fromEnv = env.GEMINI_LIVE_MODEL?.trim();
  if (fromEnv) {
    if (fromEnv.includes("live")) return fromEnv;
    return LEGACY_MODEL_ALIASES[fromEnv] ?? fromEnv;
  }
  return GEMINI_LIVE_MODEL_FALLBACK_CHAIN[0] ?? GEMINI_LIVE_NATIVE_AUDIO_MODEL;
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
  return LEGACY_MODEL_ALIASES[raw] ?? raw;
}

export function getGeminiModelFallbackChain(): string[] {
  const primary = getGeminiModelId();
  return dedupeModels([primary, ...GEMINI_MODEL_FALLBACK_TIER]);
}

/** שרשרת לפענוח גרמושקה / תוכניות ביצוע */
export function getBlueprintAnalysisModelChain(): string[] {
  const flashOnly = env.BLUEPRINT_USE_FLASH_ONLY === true;
  const fromEnv = env.GEMINI_BLUEPRINT_MODEL?.trim();
  const primary = flashOnly ? "gemini-2.5-flash-lite" : GEMINI_BLUEPRINT_PRIMARY_MODEL;
  return dedupeModels([
    ...(fromEnv ? [fromEnv] : []),
    primary,
    ...GEMINI_MODEL_FALLBACK_TIER,
  ]);
}

/** שרשרות לפי סוג סריקה — ניתנות לדריסה דרך env vars */
export function getInvoiceModelChain(): string[] {
  const fromEnv = env.GEMINI_INVOICE_MODEL?.trim();
  return dedupeModels([...(fromEnv ? [fromEnv] : []), GEMINI_STABLE_TEXT_MODEL, ...GEMINI_MODEL_FALLBACK_TIER]);
}

export function getQuoteModelChain(): string[] {
  const fromEnv = env.GEMINI_QUOTE_MODEL?.trim();
  return dedupeModels([...(fromEnv ? [fromEnv] : []), GEMINI_STABLE_TEXT_MODEL, ...GEMINI_MODEL_FALLBACK_TIER]);
}

export function getSiteLogModelChain(): string[] {
  const fromEnv = env.GEMINI_SITE_LOG_MODEL?.trim();
  return dedupeModels([...(fromEnv ? [fromEnv] : []), GEMINI_STABLE_TEXT_MODEL, ...GEMINI_MODEL_FALLBACK_TIER]);
}

export function getProgressBillModelChain(): string[] {
  const fromEnv = env.GEMINI_PROGRESS_BILL_MODEL?.trim();
  return dedupeModels([...(fromEnv ? [fromEnv] : []), GEMINI_STABLE_TEXT_MODEL, ...GEMINI_MODEL_FALLBACK_TIER]);
}

export function getGeneralModelChain(): string[] {
  const fromEnv = env.GEMINI_GENERAL_MODEL?.trim();
  return dedupeModels([...(fromEnv ? [fromEnv] : []), GEMINI_STABLE_TEXT_MODEL, ...GEMINI_MODEL_FALLBACK_TIER]);
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
