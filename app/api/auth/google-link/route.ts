import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { getGoogleSignInCredentials } from "@/lib/google-oauth-env";
import {
  getGoogleLinkCallbackUri,
  googleLinkScopes,
  signGoogleLinkState,
} from "@/lib/google-link-account";
import { safeOAuthCallbackUrl } from "@/lib/google-reconnect-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent("/api/auth/google-link")}`, request.url),
    );
  }

  const creds = getGoogleSignInCredentials();
  if (!creds) {
    return NextResponse.json({ error: "Google OAuth לא מוגדר בשרת" }, { status: 503 });
  }

  const callbackUrl = safeOAuthCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
  const state = signGoogleLinkState({ userId, email, callbackUrl });

  const oauth2 = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    getGoogleLinkCallbackUri(),
  );
  const url = oauth2.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: googleLinkScopes(),
    state,
  });

  return NextResponse.redirect(url);
}
