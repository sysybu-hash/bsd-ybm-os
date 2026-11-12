import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { isVmbHost, publicOrigin, VMB_BRAND } from "@/lib/vmb/brand";
import { upsertGoogleUser } from "@/lib/vmb/accounts";
import { decodePending, finishGoogleAuth, VMB_OAUTH_COOKIE } from "@/lib/vmb/google-oauth";
import { createVmbSession, sessionCookieOptions, VMB_SESSION_COOKIE } from "@/lib/vmb/session";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-auth-google");

/** Google returns here: check state, exchange the code, sign in, go to `next`. */
export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, "vmb:google-cb", 20, 60_000);
  if (limited) return limited;
  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  const base = isVmbHost(new URL(origin).hostname) ? "" : VMB_BRAND.pathPrefix;
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`${base}/login?error=${code}`, origin));
    res.cookies.set(VMB_OAUTH_COOKIE, "", { path: "/api/vmb/auth/google", maxAge: 0 });
    return res;
  };

  const pending = decodePending(req.cookies.get(VMB_OAUTH_COOKIE)?.value);
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  if (req.nextUrl.searchParams.get("error")) return fail("google_cancelled");
  if (!pending || !state || state !== pending.state || !code) return fail("google_state");

  try {
    const claims = await finishGoogleAuth(origin, code, pending);
    const userId = await upsertGoogleUser(claims);
    const { token, maxAgeSec } = await createVmbSession(userId);
    const res = NextResponse.redirect(new URL(pending.next, origin));
    res.cookies.set(VMB_SESSION_COOKIE, token, sessionCookieOptions(maxAgeSec));
    res.cookies.set(VMB_OAUTH_COOKIE, "", { path: "/api/vmb/auth/google", maxAge: 0 });
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
    log.error("google_callback_failed", { error: message });
    return fail("google_failed");
  }
}
