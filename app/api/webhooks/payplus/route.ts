import { NextResponse } from 'next/server';
import '@/lib/payments/register-gateways';
import { getGateway } from '@/lib/payments/gateway-interface';
import { processPayPlusWebhook } from '@/lib/payplus';
import { createLogger } from '@/lib/logger';
import { readRawBody } from '@/lib/webhook-verify';

const log = createLogger("webhooks/payplus");

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // ── 1. Read raw body (needed for HMAC verification) ──────────────────────
  let rawBody: Buffer;
  let text: string;
  try {
    ({ raw: rawBody, text } = await readRawBody(request));
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // ── 2. Verify PayPlus HMAC-SHA256 signature (via gateway abstraction) ─────
  const gateway = getGateway("payplus");
  const verified = await gateway.verifyWebhook(request.headers, rawBody);
  if (!verified.valid) {
    log.warn("payplus_webhook_rejected", { eventType: verified.eventType });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // ── 3. Parse JSON ─────────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType =
    typeof payload === "object" && payload !== null
      ? String((payload as Record<string, unknown>).event_type ?? "unknown")
      : "unknown";

  log.info("received", { type: eventType, valid: verified.valid });

  // ── 4. Process ────────────────────────────────────────────────────────────
  try {
    const result = await processPayPlusWebhook(
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
    );

    if (result.success) {
      return NextResponse.json({ status: "ok" });
    }
    return NextResponse.json({ status: "error", message: result.message }, { status: 400 });
  } catch (err: unknown) {
    log.error("processing_failed", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
