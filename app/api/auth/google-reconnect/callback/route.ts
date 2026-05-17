import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import {
  getGoogleReconnectCallbackUri,
  persistGoogleAccountTokens,
} from "@/lib/google-account-tokens";
import { safeOAuthCallbackUrl, verifyGoogleReconnectState } from "@/lib/google-reconnect-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/?google_reconnect=denied`, request.url),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateRaw = request.nextUrl.searchParams.get("state");
  const state = verifyGoogleReconnectState(stateRaw);
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?google_reconnect=invalid_state", request.url));
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.id !== state.userId) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(state.callbackUrl)}`, request.url),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?google_reconnect=server_config", request.url));
  }

  const redirectUri = getGoogleReconnectCallbackUri();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();
    const providerAccountId = profile.id?.trim();
    if (!providerAccountId) {
      return NextResponse.redirect(new URL("/?google_reconnect=no_profile", request.url));
    }

    if (!tokens.refresh_token) {
      const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
      dest.searchParams.set("google_reconnect", "missing_refresh");
      return NextResponse.redirect(dest);
    }

    await persistGoogleAccountTokens(
      state.userId,
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : null,
        scope: tokens.scope,
        token_type: tokens.token_type,
        id_token: tokens.id_token,
      },
      { providerAccountId, type: "oauth" },
    );

    const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
    dest.searchParams.set("google_reconnected", "1");
    return NextResponse.redirect(dest);
  } catch (err) {
    console.error("[google-reconnect] callback failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    const dest = new URL(safeOAuthCallbackUrl(state.callbackUrl), request.url);
    dest.searchParams.set("google_reconnect", "error");
    if (/redirect_uri_mismatch/i.test(msg)) {
      dest.searchParams.set("hint", "redirect_uri");
    }
    return NextResponse.redirect(dest);
  }
}
