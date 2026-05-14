/**
 * Gemini engine catalog, reviewed 2026-05-01.
 * GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY stay server-side only.
 */

export const AI_ENGINE_CATALOG_UPDATED_AT = "2026-05-01";
export const GEMINI_FLAGSHIP_MODEL = "gemini-3-flash-preview";
export const GEMINI_LIVE_NATIVE_AUDIO_MODEL = "gemini-3.1-flash-live-preview";

export const GEMINI_MODEL_FALLBACK_TIER: readonly string[] = [
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-3.1-pro-stable": "gemini-2.5-pro",
  "gemini-3.1-flash": GEMINI_FLAGSHIP_MODEL,
  "gemini-3.1-flash-stable": GEMINI_FLAGSHIP_MODEL,
  "gemini-3.1-flash-live": GEMINI_LIVE_NATIVE_AUDIO_MODEL,
  "gemini-2.0-pro-stable": "gemini-2.5-pro",
  "gemini-2.0-flash-001": "gemini-2.0-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash",
  "gemini-2.0-flash-exp": "gemini-2.5-pro",
  "gemini-1.5-flash-8b": "gemini-2.5-flash",
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-flash-002": "gemini-2.5-flash",
  "gemini-1.5-flash-latest": "gemini-2.5-flash",
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
  const raw = fromEnv || GEMINI_FLAGSHIP_MODEL;
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
