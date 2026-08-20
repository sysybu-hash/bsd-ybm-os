/**
 * Stripe server helpers — checkout, refunds, webhook verification.
 * Soft-gated: isStripeConfigured() false without STRIPE_SECRET_KEY.
 */
import Stripe from "stripe";
import type { SubscriptionTier } from "@prisma/client";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("stripe-server");

let _stripe: Stripe | null = null;

export function getStripeSecretKey(): string {
  return env.STRIPE_SECRET_KEY?.trim() || "";
}

export function getStripeWebhookSecret(): string {
  return env.STRIPE_WEBHOOK_SECRET?.trim() || "";
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getStripeClient(): Stripe {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error("Stripe not configured — set STRIPE_SECRET_KEY");
  }
  if (!_stripe) {
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

/** Resolve optional STRIPE_PRICE_{TIER}_{CYCLE} env var. */
export function getStripePriceId(tier: SubscriptionTier | string, cycle: "monthly" | "annual"): string | null {
  const tierKey = String(tier).trim().toUpperCase();
  const cycleKey = cycle === "annual" ? "ANNUAL" : "MONTHLY";
  const envKey = `STRIPE_PRICE_${tierKey}_${cycleKey}` as keyof typeof env;
  const fromSchema = env[envKey];
  if (typeof fromSchema === "string" && fromSchema.trim()) {
    return fromSchema.trim();
  }
  const dynamic = process.env[envKey]?.trim();
  return dynamic || null;
}

export async function stripeCreateCheckoutSession(params: {
  amountIls: number;
  itemName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  customId: string;
  priceId?: string | null;
  mode?: "payment" | "subscription";
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const stripe = getStripeClient();
  const mode = params.mode ?? (params.priceId ? "subscription" : "payment");

  const metadata = { custom_id: params.customId };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.customerEmail,
    metadata,
  };

  if (mode === "subscription" && params.priceId) {
    sessionParams.line_items = [{ price: params.priceId, quantity: 1 }];
    sessionParams.subscription_data = { metadata };
  } else {
    sessionParams.line_items = [
      {
        price_data: {
          currency: "ils",
          product_data: { name: params.itemName },
          unit_amount: Math.round(params.amountIls * 100),
        },
        quantity: 1,
      },
    ];
    sessionParams.payment_intent_data = { metadata };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url || !session.id) {
    throw new Error("Stripe checkout session missing URL");
  }
  return { checkoutUrl: session.url, sessionId: session.id };
}

export async function stripeRefundPayment(params: {
  paymentIntentId: string;
  amountIls?: number;
  reason?: string;
}): Promise<{ success: boolean; refundId: string | null; message: string }> {
  try {
    const stripe = getStripeClient();
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: params.paymentIntentId,
    };
    if (params.amountIls != null && Number.isFinite(params.amountIls)) {
      refundParams.amount = Math.round(params.amountIls * 100);
    }
    if (params.reason?.trim()) {
      refundParams.metadata = { reason: params.reason.trim().slice(0, 255) };
    }

    const refund = await stripe.refunds.create(refundParams);
    const ok = refund.status === "succeeded" || refund.status === "pending";
    return {
      success: ok,
      refundId: refund.id,
      message: ok ? `Refund ${refund.status}` : `Unexpected refund status: ${refund.status}`,
    };
  } catch (e) {
    log.error("stripe_refund_failed", e instanceof Error ? e : new Error(String(e)));
    return {
      success: false,
      refundId: null,
      message: e instanceof Error ? e.message : "Stripe refund failed",
    };
  }
}

export function verifyStripeWebhookEvent(rawBody: string, signature: string | null): Stripe.Event | null {
  const secret = getStripeWebhookSecret();
  if (!secret || !signature) {
    log.warn("stripe_webhook_not_configured");
    return null;
  }
  try {
    return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    log.error("stripe_webhook_verify_failed", e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}
