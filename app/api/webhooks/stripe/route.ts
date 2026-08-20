import { NextResponse } from "next/server";
import type Stripe from "stripe";
import "@/lib/payments/register-gateways";
import { isStripeConfigured, verifyStripeWebhookEvent } from "@/lib/stripe-server";
import {
  applyStripeCheckoutCompleted,
  applyStripeSubscriptionEvent,
} from "@/lib/billing/stripe-apply";
import { sendInvoiceEmail } from "@/lib/invoice-mailer";
import { createLogger } from "@/lib/logger";

const log = createLogger("webhooks/stripe");

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const event = verifyStripeWebhookEvent(rawBody, signature);

  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const applied = await applyStripeCheckoutCompleted(session);
      if (!applied.ok) {
        log.error("checkout_apply_failed", undefined, { error: applied.error, sessionId: session.id });
      } else if (session.customer_email) {
        const paid = session.amount_total != null ? session.amount_total / 100 : 0;
        await sendInvoiceEmail(session.customer_email, "BSD-YBM", {
          invoiceNumber: `ST-${session.id.slice(-10)}`,
          issueDate: new Date(),
          amount: paid,
        }).catch(() => {
          log.warn("invoice_email_not_sent", { sessionId: session.id });
        });
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const applied = await applyStripeSubscriptionEvent(subscription, event.type);
      if (!applied.ok) {
        log.error("subscription_apply_failed", undefined, {
          error: applied.error,
          subscriptionId: subscription.id,
        });
      }
    }
  } catch (e) {
    log.error("stripe_webhook_processing_failed", e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
