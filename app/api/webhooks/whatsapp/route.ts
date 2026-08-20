import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { readRawBody } from "@/lib/webhook-verify";
import { resolveWhatsappChallenge, verifyWhatsappSignature } from "@/lib/whatsapp/verify";
import { parseWhatsappWebhook } from "@/lib/whatsapp/parse";
import { processWhatsappInbound } from "@/lib/whatsapp/process";

const log = createLogger("webhooks/whatsapp");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** GET — Meta verification handshake. */
export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const result = resolveWhatsappChallenge(params, env.WHATSAPP_VERIFY_TOKEN);
  if (result.ok) {
    return new NextResponse(result.challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** POST — inbound messages. Verifies HMAC, then processes media/text. */
export async function POST(req: Request) {
  let rawBody: Buffer;
  try {
    ({ raw: rawBody } = await readRawBody(req));
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const verify = verifyWhatsappSignature(
    req.headers.get("x-hub-signature-256"),
    rawBody,
    env.WHATSAPP_APP_SECRET,
  );
  if (verify === "misconfigured") {
    log.warn("whatsapp_webhook_no_app_secret");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (verify !== "ok") {
    log.warn("whatsapp_webhook_rejected", { verify });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const messages = parseWhatsappWebhook(payload);

  // Ack immediately (Meta retries on non-200 / slow responses); process out of band.
  after(async () => {
    for (const msg of messages) {
      await processWhatsappInbound(msg);
    }
  });

  return NextResponse.json({ received: messages.length });
}
