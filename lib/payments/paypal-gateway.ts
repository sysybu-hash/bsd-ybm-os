/**
 * PayPal Gateway — implements PaymentGateway for server-side checkout + webhooks.
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
  isPayPalServerConfigured,
  paypalCaptureOrder,
  paypalCreateOrderBody,
  paypalRefundCapture,
  verifyPayPalWebhookSignature,
} from "@/lib/paypal-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("paypal-gateway");

export class PayPalGateway extends PaymentGateway {
  readonly name = "paypal";

  isConfigured(): boolean {
    return isPayPalServerConfigured();
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const order = await paypalCreateOrderBody({
      amountValue: params.amount.toFixed(2),
      description: params.itemName,
      customId: params.idempotencyKey ?? params.customerEmail,
    });
    return {
      checkoutUrl: "",
      providerRef: order.id,
    };
  }

  async verifyWebhook(headers: Headers, rawBody: Buffer): Promise<WebhookVerifyResult> {
    const text = rawBody.toString("utf8");
    const valid = await verifyPayPalWebhookSignature({
      transmissionId: headers.get("paypal-transmission-id") ?? "",
      transmissionTime: headers.get("paypal-transmission-time") ?? "",
      certUrl: headers.get("paypal-cert-url") ?? "",
      authAlgo: headers.get("paypal-auth-algo") ?? "",
      transmissionSig: headers.get("paypal-transmission-sig") ?? "",
      body: text,
    });

    let payload: Record<string, unknown> = {};
    let eventType = "unknown";
    let transactionId: string | null = null;
    let amount: number | null = null;

    try {
      payload = JSON.parse(text) as Record<string, unknown>;
      eventType = typeof payload.event_type === "string" ? payload.event_type : "unknown";
      const resource =
        typeof payload.resource === "object" && payload.resource !== null
          ? (payload.resource as Record<string, unknown>)
          : {};
      transactionId =
        typeof resource.id === "string"
          ? resource.id
          : typeof payload.id === "string"
            ? payload.id
            : null;
      const amt = resource.amount as Record<string, unknown> | undefined;
      const value = amt?.value;
      amount = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : null;
    } catch (err: unknown) {
      log.warn("paypal_webhook_parse_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { valid, eventType, transactionId, amount, payload };
  }

  /** Capture an approved PayPal order (Orders v2). */
  async captureOrder(orderId: string): Promise<Record<string, unknown>> {
    return paypalCaptureOrder(orderId);
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        refundId: null,
        message: "PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET",
      };
    }

    const result = await paypalRefundCapture({
      captureId: params.transactionId,
      amount: params.amount,
      reason: params.reason,
    });

    return {
      success: result.success,
      refundId: result.refundId,
      message: result.message,
    };
  }
}

export const payPalGateway = new PayPalGateway();
registerGateway(payPalGateway);
