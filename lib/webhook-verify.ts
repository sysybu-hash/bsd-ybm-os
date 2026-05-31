/**
 * lib/webhook-verify.ts
 *
 * Signature verification utilities for inbound webhooks.
 *
 * PayPal  — delegates to its own REST endpoint (lib/paypal-server.ts).
 * PayPlus — HMAC-SHA256 over the raw request body using PAYPLUS_SECRET_KEY,
 *           compared against the `x-payplus-signature` header (hex digest).
 *
 * All verification is timing-safe (crypto.timingSafeEqual).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("webhook-verify");

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Read the raw body from a Request *once* and return both the Buffer and the
 * re-parseable text so callers don't consume the body stream twice.
 */
export async function readRawBody(req: Request): Promise<{ raw: Buffer; text: string }> {
  const arrayBuffer = await req.arrayBuffer();
  const raw = Buffer.from(arrayBuffer);
  return { raw, text: raw.toString("utf8") };
}

/**
 * Constant-time hex comparison using Node's timingSafeEqual.
 * Returns false on any length mismatch or encoding error.
 */
function safeHexCompare(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected.toLowerCase(), "hex");
    const b = Buffer.from(actual.toLowerCase(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PayPlus HMAC-SHA256
// ---------------------------------------------------------------------------

/**
 * PayPlus sends the HMAC-SHA256 signature of the raw POST body (UTF-8)
 * in the `x-payplus-signature` request header as a hex string.
 *
 * Signing key: PAYPLUS_SECRET_KEY environment variable.
 *
 * Returns `"ok"` when the signature is valid.
 * Returns `"missing"` when the header is absent (soft-fail in dev, hard-fail in prod).
 * Returns `"invalid"` when the computed digest does not match.
 */
export type WebhookVerifyResult = "ok" | "missing" | "invalid" | "misconfigured";

export function verifyPayPlusWebhook(
  headers: Headers,
  rawBody: Buffer,
): WebhookVerifyResult {
  const secretKey = env.PAYPLUS_SECRET_KEY?.trim();

  if (!secretKey) {
    log.warn("payplus_webhook_no_secret", {
      hint: "Set PAYPLUS_SECRET_KEY to enable webhook signature verification.",
    });
    return "misconfigured";
  }

  // PayPlus may send the signature in different casing depending on gateway version
  const sig =
    headers.get("x-payplus-signature") ??
    headers.get("X-PayPlus-Signature") ??
    headers.get("x-payplus-sig");

  if (!sig) {
    log.warn("payplus_webhook_missing_sig");
    return "missing";
  }

  const expected = createHmac("sha256", secretKey).update(rawBody).digest("hex");

  if (!safeHexCompare(expected, sig)) {
    log.warn("payplus_webhook_invalid_sig", { receivedLen: sig.length });
    return "invalid";
  }

  return "ok";
}

/**
 * Returns true if the PayPlus signature should be enforced.
 * In production: always enforced (unless misconfigured — we log a warning but
 * still allow to avoid blocking live payments when PAYPLUS_SECRET_KEY wasn't
 * set yet; teams should treat "misconfigured" as a deploy blocker).
 * In development: signature is optional (returns true when header absent).
 */
export function shouldRejectPayPlusRequest(result: WebhookVerifyResult): boolean {
  if (result === "ok") return false;
  if (result === "misconfigured") {
    // Allow through but emit an error-level log so Sentry picks it up.
    log.error("payplus_webhook_misconfigured", undefined, {
      hint: "PAYPLUS_SECRET_KEY is not set — webhook signature verification is disabled.",
    });
    return false;
  }
  if (result === "missing" && process.env.NODE_ENV !== "production") {
    // Development convenience: allow unsigned requests so local tooling works.
    log.warn("payplus_webhook_sig_skipped_dev");
    return false;
  }
  return true; // "missing" in prod or "invalid" anywhere
}
