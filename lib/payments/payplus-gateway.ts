/**
 * PayPlus Gateway Implementation
 *
 * Wraps the existing lib/payplus.ts + lib/webhook-verify.ts into the
 * abstract PaymentGateway interface. Registers itself on module load.
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
import { createPayPlusPaymentPage, isPayPlusConfigured, refundPayPlusByTransactionUid } from "@/lib/payplus";
import { readRawBody, verifyPayPlusWebhook, shouldRejectPayPlusRequest } from "@/lib/webhook-verify";
import { createLogger } from "@/lib/logger";

const log = createLogger("payplus-gateway");

export class PayPlusGateway extends PaymentGateway {
  readonly name = "payplus";

  isConfigured(): boolean {
    return isPayPlusConfigured();
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const result = await createPayPlusPaymentPage({
      amount: params.amount,
      currencyCode: params.currencyCode,
      itemName: params.itemName,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      successUrl: params.successUrl,
      errorUrl: params.errorUrl,
      callbackUrl: params.callbackUrl,
      metadata: params.metadata,
    });
    return {
      checkoutUrl: result.url,
      providerRef: result.paymentPageUid ?? "",
    };
  }

  async verifyWebhook(headers: Headers, rawBody: Buffer): Promise<WebhookVerifyResult> {
    const sigResult = verifyPayPlusWebhook(headers, rawBody);
    const valid = !shouldRejectPayPlusRequest(sigResult);

    let payload: Record<string, unknown> = {};
    let eventType = "unknown";
    let transactionId: string | null = null;
    let amount: number | null = null;

    try {
      payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      eventType = typeof payload.event_type === "string" ? payload.event_type : "unknown";
      transactionId = typeof payload.transaction_uid === "string" ? payload.transaction_uid : null;
      const rawAmount = payload.amount;
      amount = typeof rawAmount === "number" ? rawAmount : null;
    } catch (err: unknown) {
      log.warn("payplus_webhook_parse_failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return { valid, eventType, transactionId, amount, payload };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        refundId: null,
        message: "PayPlus not configured — set PAYPLUS_API_KEY and PAYPLUS_SECRET_KEY",
      };
    }

    const result = await refundPayPlusByTransactionUid({
      transactionUid: params.transactionId,
      amount: params.amount,
      moreInfo: params.reason,
    });

    return {
      success: result.success,
      refundId: result.refundId,
      message: result.message,
    };
  }
}

// Self-register when module is imported
export const payPlusGateway = new PayPlusGateway();
registerGateway(payPlusGateway);
