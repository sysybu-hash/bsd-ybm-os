import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getGoogleContactsCallbackUri } from "@/lib/google-contacts-oauth";
import { getGoogleIntegrationsCredentials } from "@/lib/google-oauth-env";
import { persistGoogleAccountTokens } from "@/lib/google-account-tokens";
import { safeOAuthCallbackUrl, verifyGoogleReconnectState } from "@/lib/google-reconnect-state";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const log = createLogger("google-contacts-callback");

export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, "google:contacts-callback", 30, 60_000);
  if (limited) return limited;

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(new URL("/?w=crmTable&google_contacts=denied", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateRaw = request.nextUrl.searchParams.get("state");
  const state = verifyGoogleReconnectState(stateRaw);
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?w=crmTable&google_contacts=invalid_state", request.url));
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.id !== state.userId) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(state.callbackUrl)}`, request.url),
    );
  }

  const creds = getGoogleIntegrationsCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL("/?w=crmTable&google_contacts=server_config", request.url));
  }

  const oauth2 = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    getGoogleContactsCallbackUri(),
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();
    const providerAccountId = profile.id?.trim();
    if (!providerAccountId) {
      return NextResponse.redirect(new URL("/?w=crmTable&google_contacts=no_profile", request.url));
    }

    await persistGoogleAccountTokens(
      state.userId,
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        scope: tokens.scope,
        token_type: tokens.token_type,
        id_token: tokens.id_token,
      },
      { providerAccountId, type: "oauth" },
    );

    const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
    dest.searchParams.set("google_contacts_connected", "1");
    return NextResponse.redirect(dest);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("callback failed", { error: msg });
    return NextResponse.redirect(new URL("/?w=crmTable&google_contacts=error", request.url));
  }
}
