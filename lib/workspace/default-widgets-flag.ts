/**
 * Permanent (non-expiring) per-user flag: "we already auto-opened the starter
 * widgets (Finance hub + CRM table) for this browser at least once."
 *
 * Without this, the "first time" welcome-widgets flow re-triggers every time a
 * returning user's saved layout happens to be empty (e.g. after closing all
 * their windows) — `isFirstTime` in useWindowManager only reflects "no layout
 * saved right now", not "has never used the app before".
 */
const STORAGE_PREFIX = "bsd_ybm_defaults_opened_v1";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function hasOpenedDefaultWidgetsOnce(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markDefaultWidgetsOpened(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), "1");
  } catch {
    /* quota / private browsing — non-fatal, worst case the welcome flow can repeat */
  }
}
