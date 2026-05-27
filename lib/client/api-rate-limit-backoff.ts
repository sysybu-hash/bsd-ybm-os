/** cooldown לפי מפתח endpoint — מונע סערת 429 בלולאות poll / useEffect */

const cooldownUntil = new Map<string, number>();

export function isApiCooldown(key: string): boolean {
  const until = cooldownUntil.get(key);
  if (until == null) return false;
  if (Date.now() >= until) {
    cooldownUntil.delete(key);
    return false;
  }
  return true;
}

export function markApiCooldownMs(key: string, ms: number): void {
  if (ms <= 0) return;
  const prev = cooldownUntil.get(key) ?? 0;
  const next = Date.now() + ms;
  cooldownUntil.set(key, Math.max(prev, next));
}

export function markApiCooldownFromResponse(key: string, res: Response): boolean {
  if (res.status !== 429) return false;
  const header = res.headers.get("Retry-After");
  const parsed = header != null ? Number(header) : NaN;
  const sec = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
  markApiCooldownMs(key, sec * 1000);
  return true;
}

export function getApiCooldownRemainingMs(key: string): number {
  const until = cooldownUntil.get(key);
  if (until == null) return 0;
  return Math.max(0, until - Date.now());
}
