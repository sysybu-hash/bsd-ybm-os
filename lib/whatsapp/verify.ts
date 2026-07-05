import { createHmac, timingSafeEqual } from "crypto";

/**
 * Meta WhatsApp Cloud API webhook signature verification.
 * Meta signs the raw request body with the App Secret (HMAC-SHA256) and sends
 * it as `X-Hub-Signature-256: sha256=<hex>`.
 */

export type WhatsappVerifyResult = "ok" | "missing" | "invalid" | "misconfigured";

function safeHexEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function computeWhatsappSignature(rawBody: Buffer, appSecret: string): string {
  return createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function verifyWhatsappSignature(
  signatureHeader: string | null | undefined,
  rawBody: Buffer,
  appSecret: string | null | undefined,
): WhatsappVerifyResult {
  if (!appSecret?.trim()) return "misconfigured";
  if (!signatureHeader) return "missing";
  const expected = computeWhatsappSignature(rawBody, appSecret.trim());
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  return safeHexEqual(expected, provided) ? "ok" : "invalid";
}

/**
 * GET verification handshake: Meta calls the webhook with hub.mode=subscribe,
 * hub.verify_token, hub.challenge. Echo the challenge iff the token matches.
 */
export function resolveWhatsappChallenge(
  params: URLSearchParams,
  verifyToken: string | null | undefined,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
