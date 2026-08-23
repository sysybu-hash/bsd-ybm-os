/**
 * lib/webhook-verify.ts
 *
 * Shared plumbing for inbound webhooks.
 *
 * Signature verification itself lives with each provider:
 *   PayPal   — lib/paypal-server.ts (delegates to PayPal's REST verify endpoint)
 *   Stripe   — lib/stripe-server.ts (verifyStripeWebhookEvent)
 *   WhatsApp — lib/whatsapp/verify.ts (HMAC-SHA256, x-hub-signature-256)
 *
 * What every one of them needs first is the untouched request body, which is
 * what this module provides.
 */

/**
 * Read the raw body from a Request *once* and return both the Buffer and the
 * re-parseable text so callers don't consume the body stream twice.
 *
 * Always call this before any JSON parsing — a signature computed over a
 * re-serialised body will not match.
 */
export async function readRawBody(req: Request): Promise<{ raw: Buffer; text: string }> {
  const arrayBuffer = await req.arrayBuffer();
  const raw = Buffer.from(arrayBuffer);
  return { raw, text: raw.toString("utf8") };
}
