import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/vmb/api";
import { deleteVmbSession, sessionCookieOptions, VMB_SESSION_COOKIE } from "@/lib/vmb/session";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-auth-logout");

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:logout", 20, 60_000);
  if (limited) return limited;
  try {
    await deleteVmbSession(req.cookies.get(VMB_SESSION_COOKIE)?.value);
  } catch (err: unknown) {
    log.error("logout_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VMB_SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
