import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { PRODUCTION_SITE_URL, resolveSiteBaseUrl } from "@/lib/site-url";
import { GOOGLE_SIGN_IN_SCOPES } from "@/lib/google-account-tokens";

export type GoogleLinkState = {
  userId: string;
  email: string;
  callbackUrl: string;
  exp: number;
};

function secret(): string {
  const s = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET;
  if (!s?.trim()) throw new Error("NEXTAUTH_SECRET חסר");
  return s.trim();
}

export function getGoogleLinkCallbackUri(): string {
  const base = resolveSiteBaseUrl() ?? PRODUCTION_SITE_URL;
  return `${base.replace(/\/$/, "")}/api/auth/google-link/callback`;
}

export function buildGoogleLinkUrl(callbackUrl = "/"): string {
  return `/api/auth/google-link?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function googleLinkScopes(): string {
  return GOOGLE_SIGN_IN_SCOPES;
}

export function signGoogleLinkState(
  payload: Omit<GoogleLinkState, "exp">,
  ttlMs = 10 * 60_000,
): string {
  const full: GoogleLinkState = {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const data = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyGoogleLinkState(state: string | null): GoogleLinkState | null {
  if (!state?.includes(".")) return null;
  const [data, sig] = state.split(".", 2);
  if (!data || !sig) return null;
  const expected = createHmac("sha256", secret()).update(data).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as GoogleLinkState;
    if (
      !parsed?.userId ||
      !parsed?.email ||
      typeof parsed.exp !== "number" ||
      Date.now() > parsed.exp
    ) {
      return null;
    }
    return { ...parsed, email: parsed.email.trim().toLowerCase() };
  } catch {
    return null;
  }
}

/** Require verified Google email that matches the signed-in account. */
export function assertGoogleLinkEmailMatch(opts: {
  sessionEmail: string;
  googleEmail: string | null | undefined;
  emailVerified: boolean | string | null | undefined;
}): { ok: true; email: string } | { ok: false; reason: string } {
  const sessionEmail = opts.sessionEmail.trim().toLowerCase();
  const googleEmail = (opts.googleEmail ?? "").trim().toLowerCase();
  if (!sessionEmail || !googleEmail) {
    return { ok: false, reason: "missing_email" };
  }
  const verified =
    opts.emailVerified === true ||
    opts.emailVerified === "true";
  if (!verified) {
    return { ok: false, reason: "email_unverified" };
  }
  if (sessionEmail !== googleEmail) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true, email: googleEmail };
}
