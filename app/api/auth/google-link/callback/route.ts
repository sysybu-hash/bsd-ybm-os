import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { getGoogleSignInCredentials } from "@/lib/google-oauth-env";
import {
  assertGoogleLinkEmailMatch,
  getGoogleLinkCallbackUri,
  googleLinkScopes,
  verifyGoogleLinkState,
} from "@/lib/google-link-account";
import { persistGoogleAccountTokens } from "@/lib/google-account-tokens";
import { safeOAuthCallbackUrl } from "@/lib/google-reconnect-state";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { readClientRequestMeta } from "@/lib/admin/login-presence";

const log = createLogger("auth-google-link-callback");

export const dynamic = "force-dynamic";

function redirectWith(
  request: NextRequest,
  callbackUrl: string,
  status: string,
): NextResponse {
  const dest = new URL(safeOAuthCallbackUrl(callbackUrl), request.url);
  dest.searchParams.set("google_link", status);
  return NextResponse.redirect(dest);
}

export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return redirectWith(request, "/", "denied");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = verifyGoogleLinkState(request.nextUrl.searchParams.get("state"));
  if (!code || !state) {
    return redirectWith(request, "/", "invalid_state");
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.id !== state.userId) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(state.callbackUrl)}`, request.url),
    );
  }

  const sessionEmail = (session.user.email ?? "").trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== state.email) {
    return redirectWith(request, state.callbackUrl, "session_mismatch");
  }

  const creds = getGoogleSignInCredentials();
  if (!creds) {
    return redirectWith(request, state.callbackUrl, "server_config");
  }

  const redirectUri = getGoogleLinkCallbackUri();
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();
    const providerAccountId = profile.id?.trim();
    if (!providerAccountId) {
      return redirectWith(request, state.callbackUrl, "no_profile");
    }

    const match = assertGoogleLinkEmailMatch({
      sessionEmail,
      googleEmail: profile.email,
      emailVerified: profile.verified_email,
    });
    if (!match.ok) {
      log.warn("google-link email gate failed", { reason: match.reason, userId: state.userId });
      return redirectWith(request, state.callbackUrl, match.reason);
    }

    const taken = await prisma.account.findFirst({
      where: {
        provider: "google",
        providerAccountId,
        NOT: { userId: state.userId },
      },
      select: { id: true },
    });
    if (taken) {
      return redirectWith(request, state.callbackUrl, "already_linked_other");
    }

    await persistGoogleAccountTokens(
      state.userId,
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : null,
        scope: tokens.scope ?? googleLinkScopes(),
        token_type: tokens.token_type,
        id_token: tokens.id_token,
      },
      { providerAccountId, type: "oauth" },
    );

    const meta = await readClientRequestMeta();
    await prisma.loginEvent.create({
      data: {
        userId: state.userId,
        organizationId: session.user.organizationId ?? null,
        email: match.email,
        provider: "google-link",
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    log.info("google account linked for sign-in", { userId: state.userId, email: match.email });
    return redirectWith(request, state.callbackUrl, "ok");
  } catch (err) {
    log.error("google-link callback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return redirectWith(request, state.callbackUrl, "error");
  }
}
