import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { readVmbSession, VMB_SESSION_COOKIE, type VmbSessionUser } from "@/lib/vmb/session";

const log = createLogger("vmb-api");

type VmbHandler<C> = (req: NextRequest, ctx: { user: VmbSessionUser; params: C }) => Promise<Response>;

/**
 * The VisualModuBuild counterpart of withWorkspacesAuth: the request must
 * carry a live vmb_session. Platform sessions mean nothing here.
 */
export function withVmbAuth<C = Record<string, never>>(handler: VmbHandler<C>) {
  return async (req: NextRequest, routeCtx: { params: Promise<C> }): Promise<Response> => {
    try {
      const user = await readVmbSession(req.cookies.get(VMB_SESSION_COOKIE)?.value);
      if (!user) return NextResponse.json({ error: "unauthorized", code: "unauthorized" }, { status: 401 });
      return await handler(req, { user, params: await routeCtx.params });
    } catch (err: unknown) {
      log.error("vmb_api_failed", { path: req.nextUrl.pathname, error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: "server_error", code: "server_error" }, { status: 500 });
    }
  };
}

/** Same-origin check for state-changing auth posts (CSRF on top of SameSite=Lax). */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  } catch {
    return false;
  }
}
