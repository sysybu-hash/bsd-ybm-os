import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { googleIdClaimsSchema, googleTokenResponseSchema, type GoogleIdClaims } from "@/lib/validation/schemas/vmb-auth";

/**
 * Google sign-in for VisualModuBuild: authorization-code flow with PKCE,
 * state and nonce, on its own OAuth client (VMB_GOOGLE_CLIENT_ID/SECRET).
 * The ID token comes straight from Google's token endpoint over TLS with our
 * client secret, so its claims are checked (iss, aud, exp, nonce) rather than
 * its signature (OpenID Connect Core §3.1.3.7).
 */
export const VMB_OAUTH_COOKIE = "vmb_oauth";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type OAuthPending = { state: string; verifier: string; nonce: string; next: string };

export function googleConfigured(): boolean {
  return Boolean(env.VMB_GOOGLE_CLIENT_ID && env.VMB_GOOGLE_CLIENT_SECRET);
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/vmb/auth/google/callback`;
}

const rand = () => randomBytes(32).toString("base64url");

/** Only same-site relative paths survive as the post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/app";
  return next.slice(0, 300);
}

export function startGoogleAuth(origin: string, next: string): { url: string; pending: OAuthPending } {
  const pending: OAuthPending = { state: rand(), verifier: rand(), nonce: rand(), next: safeNext(next) };
  const challenge = createHash("sha256").update(pending.verifier).digest("base64url");
  const q = new URLSearchParams({
    client_id: env.VMB_GOOGLE_CLIENT_ID ?? "",
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: "openid email profile",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTH_URL}?${q.toString()}`, pending };
}

export function encodePending(p: OAuthPending): string {
  return Buffer.from(JSON.stringify(p)).toString("base64url");
}

export function decodePending(raw: string | undefined): OAuthPending | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
    const p = { state: s("state"), verifier: s("verifier"), nonce: s("nonce"), next: safeNext(s("next")) };
    return p.state && p.verifier && p.nonce ? p : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(jwt: string): unknown {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("id_token malformed");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Checks the ID token's claims against what this sign-in expects. Exported for tests. */
export function checkIdClaims(raw: unknown, expect: { clientId: string; nonce: string; nowSec: number }): GoogleIdClaims {
  const claims = googleIdClaimsSchema.parse(raw);
  if (claims.aud !== expect.clientId) throw new Error("id_token audience mismatch");
  if (claims.exp <= expect.nowSec) throw new Error("id_token expired");
  if (claims.nonce !== expect.nonce) throw new Error("id_token nonce mismatch");
  if (!claims.email_verified) throw new Error("google email not verified");
  return claims;
}

export async function finishGoogleAuth(origin: string, code: string, pending: OAuthPending): Promise<GoogleIdClaims> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.VMB_GOOGLE_CLIENT_ID ?? "",
      client_secret: env.VMB_GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const tokens = googleTokenResponseSchema.parse(await res.json());
  return checkIdClaims(decodeJwtPayload(tokens.id_token), {
    clientId: env.VMB_GOOGLE_CLIENT_ID ?? "",
    nonce: pending.nonce,
    nowSec: Math.floor(Date.now() / 1000),
  });
}
