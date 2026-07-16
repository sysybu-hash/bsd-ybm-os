/**
 * Stripe Gateway — implements PaymentGateway for checkout + webhooks.
 * Soft-gated: isConfigured() false without STRIPE_SECRET_KEY.
 */

import {
  PaymentGateway,
  registerGateway,
  type CreateCheckoutParams,
  type CreateCheckoutResult,
  type WebhookVerifyResult,
  type RefundParams,
  type RefundResult,
} from "./gateway-interface";
import {
  isStripeConfigured,
  stripeCreateCheckoutSession,
  stripeRefundPayment,
  verifyStripeWebhookEvent,
} from "@/lib/stripe-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("stripe-gateway");

export class StripeGateway extends PaymentGateway {
  readonly name = "stripe";

  isConfigured(): boolean {
    return isStripeConfigured();
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const customId = params.idempotencyKey ?? params.customerEmail;
    const priceId =
      typeof params.metadata?.stripePriceId === "string" ? params.metadata.stripePriceId : null;
    const result = await stripeCreateCheckoutSession({
      amountIls: params.amount,
      itemName: params.itemName,
      customerEmail: params.customerEmail,
      successUrl: params.successUrl,
      cancelUrl: params.errorUrl,
      customId,
      priceId,
      mode: priceId ? "subscription" : "payment",
    });
    return {
      checkoutUrl: result.checkoutUrl,
      providerRef: result.sessionId,
    };
  }

  async verifyWebhook(headers: Headers, rawBody: Buffer): Promise<WebhookVerifyResult> {
    const text = rawBody.toString("utf8");
    const signature = headers.get("stripe-signature");
    const event = verifyStripeWebhookEvent(text, signature);

    let payload: Record<string, unknown> = {};
    let eventType = "unknown";
    let transactionId: string | null = null;
    let amount: number | null = null;

    if (event) {
      eventType = event.type;
      payload = event as unknown as Record<string, unknown>;
      const obj = event.data.object as unknown as Record<string, unknown>;

      if (event.type === "checkout.session.completed") {
        transactionId = typeof obj.id === "string" ? obj.id : null;
        const total = obj.amount_total;
        amount = typeof total === "number" ? total / 100 : null;
      } else if (event.type.startsWith("customer.subscription.")) {
        transactionId = typeof obj.id === "string" ? obj.id : null;
      } else if (typeof obj.payment_intent === "string") {
        transactionId = obj.payment_intent;
      }
    } else {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
        eventType = typeof payload.type === "string" ? payload.type : "unknown";
      } catch (err: unknown) {
        log.warn("stripe_webhook_parse_failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { valid: event != null, eventType, transactionId, amount, payload };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        refundId: null,
        message: "Stripe not configured — set STRIPE_SECRET_KEY",
      };
    }

    const result = await stripeRefundPayment({
      paymentIntentId: params.transactionId,
      amountIls: params.amount,
      reason: params.reason,
    });

    return {
      success: result.success,
      refundId: result.refundId,
      message: result.message,
    };
  }
}

export const stripeGateway = new StripeGateway();
registerGateway(stripeGateway);
