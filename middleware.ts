import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { API_MSG_UNAUTHORIZED } from "@/lib/api-json";
import { COOKIE_LOCALE } from "@/lib/i18n/config";
import { negotiateLocale } from "@/lib/i18n/negotiate";

function hasAuthenticatedToken(token: NextRequestWithAuth["nextauth"]["token"]): boolean {
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

const protectedApiPrefixes = [
  "/api/ai",
  "/api/analyze",
  "/api/chat",
  "/api/data",
  "/api/crm",
  "/api/erp",
  "/api/assign-user",
  "/api/integrations",
  "/api/scan",
  "/api/org/",
  "/api/admin",
  "/api/meckano",
  "/api/billing",
  "/api/quotes",
  "/api/user",
  "/api/analyze-queue",
  "/api/reports",
  "/api/telemetry",
  "/api/debug-session",
] as const;

const publicPrefixes = [
  "/login",
  "/register",
  "/legal",
  "/privacy",
  "/terms",
  "/tutorial",
  "/sign/",
  "/api/auth",
  "/api/register",
  "/api/locale",
  "/api/webhooks/",
] as const;

const authMiddleware = withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const protectedApi = protectedApiPrefixes.some((p) => pathname.startsWith(p));

    if (protectedApi && !hasAuthenticatedToken(token)) {
      return new NextResponse(
        JSON.stringify({ error: API_MSG_UNAUTHORIZED, code: "unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    return NextResponse.next();
  },
  {
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        const hasUser = hasAuthenticatedToken(token);

        // Public pages and API routes
        if (publicPrefixes.some((p) => pathname.startsWith(p))) {
          return true;
        }

        // Protected command center (OS Root)
        // We allow "/" to be public because app/page.tsx handles its own landing page logic
        if (pathname === "/") {
          return true;
        }

        return true;
      },
    },
  },
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const result = authMiddleware(request as NextRequestWithAuth, event);
  if (result instanceof Promise) {
    return result.then((res) => {
      if (res instanceof NextResponse) patchLocaleCookie(request, res);
      return res;
    });
  }
  if (result instanceof NextResponse) patchLocaleCookie(request, result);
  return result;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
