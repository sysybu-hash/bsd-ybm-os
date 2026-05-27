import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import {
  getGoogleCalendarCallbackUri,
  GOOGLE_CALENDAR_SCOPES,
} from "@/lib/google-calendar-oauth";
import { getGoogleIntegrationsCredentials } from "@/lib/google-oauth-env";
import { signGoogleReconnectState, safeOAuthCallbackUrl } from "@/lib/google-reconnect-state";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, "google:calendar-connect", 20, 60_000);
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/?w=settings", request.url));
  }

  const creds = getGoogleIntegrationsCredentials();
  if (!creds) {
    return NextResponse.json({ error: "Google OAuth לא מוגדר בשרת" }, { status: 503 });
  }

  const callbackUrl = safeOAuthCallbackUrl(
    request.nextUrl.searchParams.get("callbackUrl") ?? "/?w=settings&calendar=wizard",
  );
  const state = signGoogleReconnectState({ userId, callbackUrl });

  const oauth2 = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    getGoogleCalendarCallbackUri(),
  );
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
  });

  return NextResponse.redirect(url);
}
