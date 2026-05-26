import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";

export const GOOGLE_CONTACTS_READONLY_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";

export const GOOGLE_CONTACTS_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_CONTACTS_READONLY_SCOPE,
].join(" ");

export function getGoogleContactsCallbackUri(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/api/integrations/google/contacts/callback`;
}

export function buildGoogleContactsConnectUrl(callbackUrl: string): string {
  return `/api/integrations/google/contacts/connect?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function accountHasContactsScope(scope: string | null | undefined): boolean {
  return (scope ?? "").includes(GOOGLE_CONTACTS_READONLY_SCOPE);
}
