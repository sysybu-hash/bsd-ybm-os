import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { encodePending, googleConfigured, startGoogleAuth, VMB_OAUTH_COOKIE } from "@/lib/vmb/google-oauth";

export const dynamic = "force-dynamic";

/** Starts Google sign-in: keeps state/PKCE/nonce in a short-lived cookie and redirects to Google. */
export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, "vmb:google", 20, 60_000);
  if (limited) return limited;
  if (!googleConfigured()) return NextResponse.json({ ok: false, code: "google_not_configured" }, { status: 503 });
  const { url, pending } = startGoogleAuth(req.nextUrl.origin, req.nextUrl.searchParams.get("next") ?? "/app");
  const res = NextResponse.redirect(url);
  res.cookies.set(VMB_OAUTH_COOKIE, encodePending(pending), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/vmb/auth/google",
    maxAge: 600,
  });
  return res;
}
