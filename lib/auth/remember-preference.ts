export const AUTH_REMEMBER_COOKIE = "auth-remember-preference";

export function readRememberPreference(): boolean {
  if (typeof document === "undefined") return true;
  const m = document.cookie.match(new RegExp(`(?:^|; )${AUTH_REMEMBER_COOKIE}=([^;]*)`));
  return m?.[1] === "1";
}

export function writeRememberPreference(remember: boolean): void {
  if (typeof document === "undefined") return;
  const maxAge = remember ? 60 * 60 * 24 * 365 : 60 * 60 * 24;
  document.cookie = `${AUTH_REMEMBER_COOKIE}=${remember ? "1" : "0"}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export const SESSION_MAX_AGE_REMEMBER_SEC = 90 * 24 * 60 * 60;
export const SESSION_MAX_AGE_DEFAULT_SEC = 24 * 60 * 60;
