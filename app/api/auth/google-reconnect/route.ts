import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { googleOAuthScopes, getGoogleReconnectCallbackUri } from "@/lib/google-account-tokens";
import { signGoogleReconnectState, safeOAuthCallbackUrl } from "@/lib/google-reconnect-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent("/")}`, request.url),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth לא מוגדר בשרת" }, { status: 503 });
  }

  const callbackUrl = safeOAuthCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
  const state = signGoogleReconnectState({ userId, callbackUrl });

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, getGoogleReconnectCallbackUri());
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: googleOAuthScopes(),
    state,
  });

  return NextResponse.redirect(url);
}
