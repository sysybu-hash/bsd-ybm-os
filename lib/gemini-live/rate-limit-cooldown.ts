/** מפתח sessionStorage — חסימת auto-start לכל מופעי Gemini Live בלשונית */
const STORAGE_KEY = "bsd:gemini-live-rate-until";

export function getGeminiLiveRateLimitCooldownUntilMs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return until;
  } catch {
    return null;
  }
}

export function isGeminiLiveRateLimited(): boolean {
  return getGeminiLiveRateLimitCooldownUntilMs() !== null;
}

export function setGeminiLiveRateLimitCooldown(until: Date): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(until.getTime()));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearGeminiLiveRateLimitCooldown(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
