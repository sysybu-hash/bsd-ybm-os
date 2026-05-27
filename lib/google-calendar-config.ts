/** גרסת טקסט האישור — עדכן כשמשנים את נוסח ההסכמה ב-UI */
export const GOOGLE_CALENDAR_CONSENT_VERSION = "2026-05-27";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_CALENDAR_SCOPE,
].join(" ");

export function mergeGoogleOAuthScopeStrings(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string {
  const parts = new Set<string>();
  for (const raw of [existing, incoming]) {
    if (!raw) continue;
    for (const token of raw.split(/\s+/)) {
      const t = token.trim();
      if (t) parts.add(t);
    }
  }
  return [...parts].join(" ");
}
