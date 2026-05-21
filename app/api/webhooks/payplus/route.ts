import { NextResponse } from 'next/server';
import { processPayPlusWebhook } from '@/lib/payplus';
import { createLogger } from '@/lib/logger';

const log = createLogger("webhooks/payplus");

export async function POST(request: Request) {
  try {
    const payload = await request.json() as unknown;
    const eventType = typeof payload === "object" && payload !== null
      ? String((payload as Record<string, unknown>).event_type ?? "unknown")
      : "unknown";
    log.info("received", { type: eventType });

    const result = await processPayPlusWebhook(
      typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {}
    );

    if (result.success) {
      return NextResponse.json({ status: 'ok' });
    } else {
      return NextResponse.json({ status: 'error', message: result.message }, { status: 400 });
    }
  } catch (err: unknown) {
    log.error("webhook processing failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
