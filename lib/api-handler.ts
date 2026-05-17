import type { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonForbidden, jsonUnauthorized, jsonValidationFailed } from "@/lib/api-json";
import { isAdmin } from "@/lib/is-admin";

export type WorkspaceAuthContext = {
  orgId: string;
  userId: string;
  role: UserRole;
};

export type OSAdminContext = {
  email: string;
  userId: string | null;
};

/** תגובת route — JSON רגיל או streaming (SSE / NDJSON) */
export type ApiRouteResponse = NextResponse | Response;

type WorkspaceAuthOptionsBase = {
  /** אם מוגדר — רק תפקידים אלה עוברים (אחרת 403) */
  allowedRoles?: UserRole[];
};

export type WorkspaceAuthOptions = WorkspaceAuthOptionsBase & {
  /**
   * סכמת Zod לנתוני הבקשה.
   * כשמוגדר — ה־handler מקבל את `data` המאומת כארגומנט שלישי (או רביעי בנתיב דינמי).
   * גוף הבקשה נקרא פעם אחת כאן — אל תקראו שוב `req.json()` בפנים.
   */
  schema?: z.ZodType<unknown>;
  /**
   * מאיפה לפרסר לפני ה־safeParse:
   * - `body` — JSON מגוף הבקשה
   * - `query` — אובייקט שטוח מ־`searchParams` (כל הערכים מחרוזות)
   * אם לא מוגדר — GET/HEAD משתמשים ב־`query`, שאר הקריאות ב־`body`.
   */
  parseTarget?: "body" | "query";
};

function isWorkspaceContext(
  gate: WorkspaceAuthContext | NextResponse,
): gate is WorkspaceAuthContext {
  return (
    typeof gate === "object" &&
    gate !== null &&
    "orgId" in gate &&
    typeof (gate as WorkspaceAuthContext).orgId === "string"
  );
}

function effectiveParseTarget(req: Request, explicit?: "body" | "query"): "body" | "query" {
  if (explicit) return explicit;
  const m = req.method.toUpperCase();
  return m === "GET" || m === "HEAD" ? "query" : "body";
}

async function parseRawForValidation(
  req: Request,
  target: "body" | "query",
): Promise<{ ok: true; raw: unknown } | { ok: false; response: NextResponse }> {
  if (target === "query") {
    const sp = new URL(req.url).searchParams;
    return { ok: true, raw: Object.fromEntries(sp.entries()) };
  }

  try {
    const text = await req.text();
    if (!text.trim()) {
      return { ok: true, raw: {} };
    }
    const raw = JSON.parse(text) as unknown;
    return { ok: true, raw };
  } catch {
    return {
      ok: false,
      response: jsonBadRequest("גוף הבקשה אינו JSON תקין", "invalid_json"),
    };
  }
}

/**
 * אימות ארגון + משתמש ל־API של מרחב העבודה (NextAuth v4 + JWT).
 * מחזיר הקשר או `NextResponse` לשגיאה — לשימוש ישיר ב-route handlers מורכבים.
 */
export async function requireWorkspaceAuth(
  options?: WorkspaceAuthOptions,
): Promise<WorkspaceAuthContext | NextResponse> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const orgId = session?.user?.organizationId ?? null;
  if (!userId || !orgId) {
    return jsonUnauthorized();
  }
  const role = session.user.role as UserRole;
  if (options?.allowedRoles?.length && !options.allowedRoles.includes(role)) {
    return jsonForbidden("אין הרשאת תפקיד לפעולה זו.");
  }
  return { orgId, userId, role };
}

export async function requireOSAdmin(): Promise<OSAdminContext | NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || !isAdmin(email)) {
    return jsonForbidden("נדרשת הרשאת מנהל BSD-YBM-OS.");
  }
  return {
    email,
    userId: typeof session?.user?.id === "string" ? session.user.id : null,
  };
}

function isOSAdminContext(
  gate: OSAdminContext | NextResponse,
): gate is OSAdminContext {
  return (
    typeof gate === "object" &&
    gate !== null &&
    "email" in gate &&
    typeof (gate as OSAdminContext).email === "string"
  );
}

export function withOSAdmin(
  handler: (req: Request, ctx: OSAdminContext) => Promise<ApiRouteResponse>,
): (req: Request) => Promise<ApiRouteResponse> {
  return async (req: Request) => {
    const gate = await requireOSAdmin();
    if (!isOSAdminContext(gate)) return gate;
    return handler(req, gate);
  };
}

type WorkspaceAuthOptionsNoSchema = WorkspaceAuthOptionsBase &
  Pick<WorkspaceAuthOptions, "parseTarget"> & { schema?: never };

/** עם schema — `data` הוא `z.infer<S>` */
export function withWorkspacesAuth<S extends z.ZodType<unknown>>(
  handler: (req: Request, ctx: WorkspaceAuthContext, data: z.infer<S>) => Promise<ApiRouteResponse>,
  options: WorkspaceAuthOptionsBase & { schema: S } & Pick<WorkspaceAuthOptions, "parseTarget">,
): (req: Request) => Promise<ApiRouteResponse>;

/** בלי schema — לא להעביר `schema` */
export function withWorkspacesAuth(
  handler: (req: Request, ctx: WorkspaceAuthContext) => Promise<ApiRouteResponse>,
  options?: WorkspaceAuthOptionsNoSchema,
): (req: Request) => Promise<ApiRouteResponse>;

export function withWorkspacesAuth(
  handler:
    | ((req: Request, ctx: WorkspaceAuthContext) => Promise<ApiRouteResponse>)
    | ((req: Request, ctx: WorkspaceAuthContext, data: unknown) => Promise<ApiRouteResponse>),
  options?: WorkspaceAuthOptions,
) {
  return async (req: Request) => {
    const gate = await requireWorkspaceAuth(options);
    if (!isWorkspaceContext(gate)) return gate;

    if (options?.schema) {
      const target = effectiveParseTarget(req, options.parseTarget);
      const parsed = await parseRawForValidation(req, target);
      if (!parsed.ok) return parsed.response;

      const result = options.schema.safeParse(parsed.raw);
      if (!result.success) {
        return jsonValidationFailed(result.error.issues);
      }

      return (handler as (req: Request, ctx: WorkspaceAuthContext, data: unknown) => Promise<ApiRouteResponse>)(
        req,
        gate,
        result.data,
      );
    }

    return (handler as (req: Request, ctx: WorkspaceAuthContext) => Promise<ApiRouteResponse>)(req, gate);
  };
}

/** נתיב דינמי — עם schema (ארגומנט רביעי: `data`). מומלץ לציין `typeof MySchema` כגנריק שני. */
export function withWorkspacesAuthDynamic<
  P extends Record<string, string>,
  S extends z.ZodType<unknown>,
>(
  handler: (
    req: Request,
    ctx: WorkspaceAuthContext,
    segment: { params: Promise<P> },
    data: z.infer<S>,
  ) => Promise<ApiRouteResponse>,
  options: WorkspaceAuthOptionsBase & { schema: S } & Pick<WorkspaceAuthOptions, "parseTarget">,
): (req: Request, segment: { params: Promise<P> }) => Promise<ApiRouteResponse>;

export function withWorkspacesAuthDynamic<P extends Record<string, string>>(
  handler: (
    req: Request,
    ctx: WorkspaceAuthContext,
    segment: { params: Promise<P> },
  ) => Promise<ApiRouteResponse>,
  options?: WorkspaceAuthOptionsNoSchema,
): (req: Request, segment: { params: Promise<P> }) => Promise<ApiRouteResponse>;

export function withWorkspacesAuthDynamic<P extends Record<string, string>>(
  handler:
    | ((
        req: Request,
        ctx: WorkspaceAuthContext,
        segment: { params: Promise<P> },
      ) => Promise<ApiRouteResponse>)
    | ((
        req: Request,
        ctx: WorkspaceAuthContext,
        segment: { params: Promise<P> },
        data: unknown,
      ) => Promise<ApiRouteResponse>),
  options?: WorkspaceAuthOptions,
) {
  return async (req: Request, segment: { params: Promise<P> }) => {
    const gate = await requireWorkspaceAuth(options);
    if (!isWorkspaceContext(gate)) return gate;

    if (options?.schema) {
      const target = effectiveParseTarget(req, options.parseTarget);
      const parsed = await parseRawForValidation(req, target);
      if (!parsed.ok) return parsed.response;

      const result = options.schema.safeParse(parsed.raw);
      if (!result.success) {
        return jsonValidationFailed(result.error.issues);
      }

      return (
        handler as (
          req: Request,
          ctx: WorkspaceAuthContext,
          segment: { params: Promise<P> },
          data: unknown,
        ) => Promise<ApiRouteResponse>
      )(req, gate, segment, result.data);
    }

    return (
      handler as (
        req: Request,
        ctx: WorkspaceAuthContext,
        segment: { params: Promise<P> },
      ) => Promise<ApiRouteResponse>
    )(req, gate, segment);
  };
}
