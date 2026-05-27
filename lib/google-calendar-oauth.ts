import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";
import { GOOGLE_CALENDAR_SCOPES, GOOGLE_CALENDAR_SCOPE } from "@/lib/google-calendar-config";

export { GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_SCOPES };

const CALENDAR_SCOPE_MARKER = "googleapis.com/auth/calendar";

export function getGoogleCalendarCallbackUri(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/api/integrations/google/calendar/callback`;
}

export function accountHasCalendarScope(scope: string | null | undefined): boolean {
  return (scope ?? "").includes(CALENDAR_SCOPE_MARKER);
}

export function buildGoogleCalendarConnectUrl(callbackUrl: string): string {
  return `/api/integrations/google/calendar/connect?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
