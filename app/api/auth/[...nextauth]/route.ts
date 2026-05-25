import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-auth");

const handler = NextAuth(authOptions);

type RouteCtx = { params: Promise<{ nextauth: string[] }> };

/**
 * NextAuth client parses /api/auth/* as JSON. An uncaught 500 from Next.js
 * returns plain "Internal Server Error" and surfaces as CLIENT_FETCH_ERROR.
 */
async function handleAuth(req: NextRequest, ctx: RouteCtx) {
  try {
    return await handler(req, ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("NextAuth route handler failed", { message });
    return NextResponse.json(
      { error: "auth_handler_error", message },
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export function GET(req: NextRequest, ctx: RouteCtx) {
  return handleAuth(req, ctx);
}

export function POST(req: NextRequest, ctx: RouteCtx) {
  return handleAuth(req, ctx);
}
