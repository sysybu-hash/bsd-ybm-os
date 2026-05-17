import { NextResponse, type NextRequest } from "next/server";
import { withOSAdmin } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/debug-session
 * מחזיר את מצב הסשן הנוכחי — לצורך דיבאג בלבד.
 * לא חושף סיסמאות או מפתחות — רק email, role, id, orgId.
 */
export const GET = withOSAdmin(async (req) => {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_SESSION !== "true") {
    return jsonNotFound("לא זמין", "debug_disabled");
  }

  let jwtEmail: string | null = null;
  let jwtRole: string | null = null;
  let jwtId: string | null = null;
  try {
    const token = await getToken({
      req: req as NextRequest,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });
    jwtEmail = typeof token?.email === "string" ? token.email : null;
    jwtRole = typeof token?.role === "string" ? token.role : null;
    jwtId = typeof token?.id === "string" ? token.id : null;
  } catch {
    /* ignore */
  }

  const dbUser =
    jwtId != null
      ? await prisma.user.findUnique({
          where: { id: jwtId },
          select: {
            email: true,
            name: true,
            role: true,
            id: true,
            organizationId: true,
          },
        })
      : null;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    session: dbUser
      ? {
          email: dbUser.email ?? null,
          name: dbUser.name ?? null,
          role: dbUser.role ?? null,
          id: dbUser.id ?? null,
          organizationId: dbUser.organizationId ?? null,
        }
      : null,
    jwt: {
      email: jwtEmail,
      role: jwtRole,
      id: jwtId,
    },
    match: dbUser?.email === jwtEmail,
  });
});
