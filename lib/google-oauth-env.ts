/**
 * פיצול אופציונלי בין OAuth Client להתחברות (scopes בסיסיים בלבד)
 * לבין Client לאינטגרציות (Drive, Contacts) — מפחית אזהרת "אפליקציה לא מאומתת" בכניסה.
 *
 * אם GOOGLE_SIGNIN_* לא מוגדרים — משתמשים ב-GOOGLE_CLIENT_ID / SECRET לכל הזרימות (התנהגות קודמת).
 */

const CONTACTS_SCOPE_MARKER = "googleapis.com/auth/contacts";
const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function scopeListIncludesFullDrive(scope: string): boolean {
  return scope
    .split(/\s+/)
    .some((token) => token === FULL_DRIVE_SCOPE);
}

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

export function getGoogleSignInClientId(): string | undefined {
  return trimEnv("GOOGLE_SIGNIN_CLIENT_ID") ?? trimEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleSignInClientSecret(): string | undefined {
  return trimEnv("GOOGLE_SIGNIN_CLIENT_SECRET") ?? trimEnv("GOOGLE_CLIENT_SECRET");
}

export function getGoogleIntegrationsClientId(): string | undefined {
  return trimEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleIntegrationsClientSecret(): string | undefined {
  return trimEnv("GOOGLE_CLIENT_SECRET");
}

export function isGoogleSignInOAuthConfigured(): boolean {
  return Boolean(getGoogleSignInClientId() && getGoogleSignInClientSecret());
}

export function isGoogleIntegrationsOAuthConfigured(): boolean {
  return Boolean(getGoogleIntegrationsClientId() && getGoogleIntegrationsClientSecret());
}

export function accountUsesRestrictedGoogleScopes(scope: string | null | undefined): boolean {
  const s = scope ?? "";
  if (s.includes(CONTACTS_SCOPE_MARKER)) return true;
  return scopeListIncludesFullDrive(s);
}

export type GoogleOAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getGoogleIntegrationsCredentials(): GoogleOAuthClientCredentials | null {
  const clientId = getGoogleIntegrationsClientId();
  const clientSecret = getGoogleIntegrationsClientSecret();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGoogleSignInCredentials(): GoogleOAuthClientCredentials | null {
  const clientId = getGoogleSignInClientId();
  const clientSecret = getGoogleSignInClientSecret();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
