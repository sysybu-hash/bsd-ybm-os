import { NextResponse } from 'next/server';
import { processPayPlusWebhook } from '@/lib/payplus';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log("[PayPlus Webhook] Received:", payload);

    const result = await processPayPlusWebhook(payload);

    if (result.success) {
      return NextResponse.json({ status: 'ok' });
    } else {
      return NextResponse.json({ status: 'error', message: result.message }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[PayPlus Webhook] Error:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
