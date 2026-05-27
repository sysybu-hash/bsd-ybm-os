import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { mergeGoogleOAuthScopeStrings } from "@/lib/google-calendar-config";
import { getGoogleCalendarCallbackUri } from "@/lib/google-calendar-oauth";
import { persistGoogleAccountTokens } from "@/lib/google-account-tokens";
import { getGoogleIntegrationsCredentials } from "@/lib/google-oauth-env";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { safeOAuthCallbackUrl, verifyGoogleReconnectState } from "@/lib/google-reconnect-state";
import { upsertUserCalendarSettingsRow } from "@/lib/google-calendar-sync";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const log = createLogger("google-calendar-callback");

export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, "google:calendar-callback", 30, 60_000);
  if (limited) return limited;

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(new URL("/?w=settings&calendar=denied", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateRaw = request.nextUrl.searchParams.get("state");
  const state = verifyGoogleReconnectState(stateRaw);
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?w=settings&calendar=invalid_state", request.url));
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.id !== state.userId) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(state.callbackUrl)}`, request.url),
    );
  }

  const creds = getGoogleIntegrationsCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL("/?w=settings&calendar=server_config", request.url));
  }

  const redirectUri = getGoogleCalendarCallbackUri();
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();
    const providerAccountId = profile.id?.trim();
    if (!providerAccountId) {
      return NextResponse.redirect(new URL("/?w=settings&calendar=no_profile", request.url));
    }

    const existing = await prisma.account.findFirst({
      where: { userId: state.userId, provider: "google" },
      select: { scope: true, refresh_token: true },
    });

    const mergedScope = mergeGoogleOAuthScopeStrings(existing?.scope, tokens.scope ?? null);

    await persistGoogleAccountTokens(
      state.userId,
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? existing?.refresh_token ?? null,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        scope: mergedScope,
        token_type: tokens.token_type,
        id_token: tokens.id_token,
      },
      { providerAccountId, type: "oauth" },
    );

    const orgId = session.user.organizationId;
    if (orgId) {
      await upsertUserCalendarSettingsRow(state.userId, orgId);
    }

    const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
    dest.searchParams.set("calendar_connected", "1");
    return NextResponse.redirect(dest);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("calendar OAuth callback failed", { message });
    const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
    dest.searchParams.set("calendar", "error");
    if (/redirect_uri_mismatch/i.test(message)) {
      dest.searchParams.set("hint", "redirect_uri");
    }
    return NextResponse.redirect(dest);
  }
}
