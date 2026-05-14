import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonForbidden, jsonNotFound } from "@/lib/api-json";
import { getToken } from "next-auth/jwt";
import { isAdmin } from "@/lib/is-admin";

/**
 * GET /api/auth/debug-session
 * מחזיר את מצב הסשן הנוכחי — לצורך דיבאג בלבד.
 * לא חושף סיסמאות או מפתחות — רק email, role, id, orgId.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return jsonForbidden("נדרשת הרשאת מנהל.");
  }

  // In production, debug endpoint is disabled unless explicitly enabled.
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_SESSION !== "true") {
    return jsonNotFound("לא זמין", "debug_disabled");
  }

  /* Read JWT directly for comparison */
  let jwtEmail: string | null = null;
  let jwtRole: string | null = null;
  let jwtId: string | null = null;
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });
    jwtEmail = typeof token?.email === "string" ? token.email : null;
    jwtRole = typeof token?.role === "string" ? token.role : null;
    jwtId = typeof token?.id === "string" ? token.id : null;
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    session: session
      ? {
          email: session.user?.email ?? null,
          name: session.user?.name ?? null,
          role: session.user?.role ?? null,
          id: session.user?.id ?? null,
          organizationId: session.user?.organizationId ?? null,
        }
      : null,
    jwt: {
      email: jwtEmail,
      role: jwtRole,
      id: jwtId,
    },
    match: session?.user?.email === jwtEmail,
  });
}
