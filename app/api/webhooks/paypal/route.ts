import { NextResponse } from "next/server";
import {
  isPayPalServerConfigured,
  verifyPayPalWebhookSignature,
  paypalFetchOrder,
} from "@/lib/paypal-server";
import { parseCapturePayload } from "@/lib/paypal-order-parse";
import { applyPayPalCaptureResult } from "@/lib/paypal-capture-apply";
import { sendInvoiceEmail } from "@/lib/invoice-mailer";

export const dynamic = "force-dynamic";

function relatedOrderIdFromCapture(resource: Record<string, unknown>): string | null {
  const sup = resource.supplementary_data as Record<string, unknown> | undefined;
  const rel = sup?.related_ids as Record<string, unknown> | undefined;
  const oid = rel?.order_id;
  return typeof oid === "string" && oid.trim() ? oid.trim() : null;
}

/**
 * Webhook PayPal — אימות חתימה + יישום PAYMENT.CAPTURE.COMPLETED כאשר הלקוח לא חזר לדפדפן אחרי Capture.
 * דורש PAYPAL_WEBHOOK_ID ואת אותם מפתחות API כמו ב־create/capture.
 */
export async function POST(req: Request) {
  if (!isPayPalServerConfigured()) {
    return NextResponse.json({ error: "PayPal not configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  const transmissionId = req.headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";
  const certUrl = req.headers.get("paypal-cert-url") ?? "";
  const authAlgo = req.headers.get("paypal-auth-algo") ?? "";
  const transmissionSig = req.headers.get("paypal-transmission-sig") ?? "";

  if (!transmissionId || !transmissionSig) {
    return NextResponse.json({ error: "Missing PayPal headers" }, { status: 400 });
  }

  const verified = await verifyPayPalWebhookSignature({
    transmissionId,
    transmissionTime,
    certUrl,
    authAlgo,
    transmissionSig,
    body: rawBody,
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as { event_type?: string; resource?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ received: true });
  }

  const resource = event.resource;
  if (!resource || typeof resource !== "object") {
    return NextResponse.json({ received: true });
  }

  const captureId = String(resource.id || "").trim();
  const capStatus = String(resource.status || "").trim();
  const amount = resource.amount as Record<string, unknown> | undefined;
  const paid = amount?.value != null ? parseFloat(String(amount.value)) : NaN;
  const currency = String(amount?.currency_code || "");

  if (!captureId || capStatus !== "COMPLETED" || !Number.isFinite(paid)) {
    return NextResponse.json({ received: true });
  }

  let customId = String(resource.custom_id || "").trim();

  if (!customId) {
    const orderId = relatedOrderIdFromCapture(resource);
    if (orderId) {
      try {
        const order = await paypalFetchOrder(orderId);
        const parsed = parseCapturePayload(order);
        if (parsed?.customId) customId = parsed.customId;
      } catch (e) {
        console.error("[webhooks/paypal] fetch order", e);
      }
    }
  }

  if (!customId) {
    console.warn("[webhooks/paypal] חסר custom_id ולא ניתן לשחזר מהזמנה");
    return NextResponse.json({ received: true });
  }

  const applied = await applyPayPalCaptureResult({
    customIdFull: customId,
    paidTotal: paid,
    currency,
    captureId,
  });

  if (!applied.ok) {
    console.error("[webhooks/paypal] apply", applied.error);
    return NextResponse.json({ received: true });
  }

  if (!applied.duplicate && applied.notifyEmail) {
    const okMail = await sendInvoiceEmail(applied.notifyEmail, applied.orgName, {
      invoiceNumber: `PP-${captureId.slice(-10)}`,
      issueDate: new Date(),
      amount: applied.paidTotal,
    });
    if (!okMail) {
      console.warn("[webhooks/paypal] invoice email not sent");
    }
  }

  return NextResponse.json({ received: true });
}
