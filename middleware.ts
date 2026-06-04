import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { API_MSG_UNAUTHORIZED } from "@/lib/api-json";
import { COOKIE_LOCALE } from "@/lib/i18n/config";
import { negotiateLocale } from "@/lib/i18n/negotiate";
import { normalizeNextAuthUrlEnv } from "@/lib/normalize-nextauth-url-env";
import { applyNextAuthUrlEnv } from "@/lib/site-url";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

applyNextAuthUrlEnv();
normalizeNextAuthUrlEnv();

function hasAuthenticatedJwtPayload(token: Record<string, unknown> | null): boolean {
  if (!token) return false;
  const id = typeof token.id === "string" ? token.id.trim() : "";
  const sub = typeof token.sub === "string" ? token.sub.trim() : "";
  const email = typeof token.email === "string" ? token.email.trim() : "";
  return id.length > 0 || sub.length > 0 || email.length > 0;
}

function patchLocaleCookie(request: NextRequest, response: NextResponse) {
  if (!request.cookies.get(COOKIE_LOCALE)?.value) {
    const locale = negotiateLocale(request.headers.get("accept-language"));
    response.cookies.set(COOKIE_LOCALE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
}

/** נתיבי API שלא דורשים JWT במידלוור (אימות אחר ב-handler או ציבורי) */
const publicApiPrefixes = [
  "/api/auth",
  "/api/register",
  "/api/webhooks",
  "/api/cron",
  "/api/sign",
  "/api/org-invite",
  "/api/locale",
  "/api/feedback",
  "/api/analyze-queue/process",
  "/api/marketing",
  "/api/health",
  "/api/leads",
  "/api/unsubscribe",
] as const;

/** הגנת קצב שנייה — POST ציבורי בלבד (לידים, הרשמה, feedback) */
const PUBLIC_POST_RATE_LIMITS: ReadonlyArray<{
  prefix: string;
  key: string;
  limit: number;
  windowMs: number;
}> = [
  { prefix: "/api/register", key: "mw:register", limit: 6, windowMs: 60 * 60 * 1000 },
  { prefix: "/api/leads", key: "mw:leads", limit: 6, windowMs: 60 * 60 * 1000 },
  { prefix: "/api/feedback", key: "mw:feedback", limit: 20, windowMs: 60 * 60 * 1000 },
];

function isPublicApi(pathname: string): boolean {
  return publicApiPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function applyPublicPostRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "POST") return null;
  const pathname = request.nextUrl.pathname;
  const rule = PUBLIC_POST_RATE_LIMITS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (!rule) return null;
  const rlKey = getRateLimitKey(request, rule.key);
  const rl = await checkRateLimit(rlKey, rule.limit, rule.windowMs);
  if (rl.success) return null;
  const retryAfter = Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000);
  return new NextResponse(
    JSON.stringify({
      error: "יותר מדי בקשות. נסה שוב בעוד כמה דקות.",
      code: "rate_limited",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

export default async function middleware(request: NextRequest, _event: NextFetchEvent) {
  normalizeNextAuthUrlEnv();

  const pathname = request.nextUrl.pathname;

  const publicLimited = await applyPublicPostRateLimit(request);
  if (publicLimited) {
    patchLocaleCookie(request, publicLimited);
    return publicLimited;
  }

  const requiresSession = pathname.startsWith("/api/") && !isPublicApi(pathname);
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (requiresSession) {
    if (!secret) {
      const res = new NextResponse(
        JSON.stringify({ error: "שרת ללא NEXTAUTH_SECRET.", code: "auth_misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
      patchLocaleCookie(request, res);
      return res;
    }
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const secureCookie =
      request.nextUrl.protocol === "https:" ||
      forwardedProto === "https" ||
      Boolean(process.env.VERCEL);

    const token = (await getToken({
      req: request,
      secret,
      secureCookie,
    })) as Record<string, unknown> | null;

    if (!hasAuthenticatedJwtPayload(token)) {
      const res = new NextResponse(
        JSON.stringify({ error: API_MSG_UNAUTHORIZED, code: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      patchLocaleCookie(request, res);
      return res;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  patchLocaleCookie(request, res);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
