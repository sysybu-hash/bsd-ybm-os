/**
 * קטלוג מודלי Gemini — עודכן לפי Models API, 2026-05-15.
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://ai.google.dev/gemini-api/docs/multimodal-live
 */

export const AI_ENGINE_CATALOG_UPDATED_AT = "2026-05-15";

/** מודל טקסט יציב (GA) — ברירת מחדל לפרודקשן */
export const GEMINI_STABLE_TEXT_MODEL = "gemini-2.5-flash";

/** מודל טקסט חדיש (preview) — אופציונלי דרך GEMINI_MODEL */
export const GEMINI_FLAGSHIP_PREVIEW_MODEL = "gemini-3-flash-preview";

/** @deprecated השתמשו ב-GEMINI_STABLE_TEXT_MODEL או GEMINI_FLAGSHIP_PREVIEW_MODEL */
export const GEMINI_FLAGSHIP_MODEL = GEMINI_STABLE_TEXT_MODEL;

/**
 * Live API — אודיו native (מומלץ Google AI Studio, מאי 2026).
 * ראשון: `gemini-2.5-flash-native-audio-latest` (זמין ב-Models API).
 */
export const GEMINI_LIVE_NATIVE_AUDIO_MODEL = "gemini-2.5-flash-native-audio-latest";

/** מודלים ל-Gemini Live — ניסיון לפי סדר */
export const GEMINI_LIVE_MODEL_FALLBACK_CHAIN: readonly string[] = [
  GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-09-2025",
] as const;

/** שרשרת טקסט (צ'אט, מסמכים) */
export const GEMINI_MODEL_FALLBACK_TIER: readonly string[] = [
  GEMINI_STABLE_TEXT_MODEL,
  GEMINI_FLAGSHIP_PREVIEW_MODEL,
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

/** NotebookLM / צ'אט מהיר */
export const GEMINI_NOTEBOOKLM_DEFAULT_MODEL = "gemini-2.5-flash";

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-8b": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-002": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-flash-latest": GEMINI_STABLE_TEXT_MODEL,
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-3.1-pro-stable": "gemini-2.5-pro",
  "gemini-3.1-flash": GEMINI_FLAGSHIP_PREVIEW_MODEL,
  "gemini-3.1-flash-stable": GEMINI_FLAGSHIP_PREVIEW_MODEL,
  "gemini-3.1-flash-live": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-3.1-flash-live-preview": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.0-flash-001": GEMINI_STABLE_TEXT_MODEL,
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.0-flash-exp": "gemini-2.5-pro",
  "gemini-2.0-pro-stable": "gemini-2.5-pro",
  "gemini-2.0-flash-live-001": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
};

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
    process.env.GEMINI_MODEL?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim();
  const raw = fromEnv || GEMINI_STABLE_TEXT_MODEL;
  return LEGACY_MODEL_ALIASES[raw] ?? raw;
}

export function getGeminiModelFallbackChain(): string[] {
  const primary = getGeminiModelId();
  return dedupeModels([primary, ...GEMINI_MODEL_FALLBACK_TIER]);
}

export function isLikelyGeminiModelUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("404") ||
    lower.includes("429") ||
    lower.includes("not found") ||
    lower.includes("not available") ||
    lower.includes("invalid model") ||
    lower.includes("503") ||
    lower.includes("resource exhausted") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("does not exist")
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
