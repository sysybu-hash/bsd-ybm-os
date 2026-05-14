import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function safeCallbackUrl(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

function mergeCookieHeader(existing: string | null, setCookie: string | null) {
  const cookieFromSetCookie = setCookie?.split(";")[0]?.trim();
  return [existing, cookieFromSetCookie].filter(Boolean).join("; ");
}

function appendSetCookie(response: NextResponse, setCookie: string | null) {
  if (setCookie) response.headers.append("set-cookie", setCookie);
}

export async function GET(request: NextRequest) {
  const callbackUrl = safeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
  const origin = request.nextUrl.origin;
  const incomingCookie = request.headers.get("cookie");

  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, {
    cache: "no-store",
    headers: incomingCookie ? { cookie: incomingCookie } : undefined,
  });
  const csrfData = (await csrfResponse.json()) as { csrfToken?: string };
  const csrfSetCookie = csrfResponse.headers.get("set-cookie");

  const signinResponse = await fetch(`${origin}/api/auth/signin/google`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: mergeCookieHeader(incomingCookie, csrfSetCookie),
    },
    body: new URLSearchParams({
      csrfToken: csrfData.csrfToken ?? "",
      callbackUrl,
      json: "true",
    }),
  });

  const signinData = (await signinResponse.json()) as { url?: string };
  const destination = signinData.url || `/login?error=google`;
  const response = NextResponse.redirect(destination);
  appendSetCookie(response, csrfSetCookie);
  appendSetCookie(response, signinResponse.headers.get("set-cookie"));
  return response;
}
