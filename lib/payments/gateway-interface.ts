/**
 * Abstract Payment Gateway Interface
 *
 * Defines a provider-agnostic contract for payment operations.
 * Both PayPlus and PayPal (and any future gateway) implement this interface,
 * enabling the billing layer to be gateway-independent.
 *
 * Phase 4.1 — Local Moat Infrastructure
 */

export type CreateCheckoutParams = {
  amount: number;
  currencyCode: string;
  itemName: string;
  customerName: string;
  customerEmail: string;
  successUrl: string;
  errorUrl: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Idempotency key to prevent duplicate charges */
  idempotencyKey?: string;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  /** Provider-specific session/transaction reference */
  providerRef: string;
};

export type WebhookVerifyResult = {
  valid: boolean;
  eventType: string;
  transactionId: string | null;
  amount: number | null;
  payload: Record<string, unknown>;
};

export type RefundParams = {
  transactionId: string;
  amount?: number; // partial refund if provided
  reason?: string;
};

export type RefundResult = {
  success: boolean;
  refundId: string | null;
  message: string;
};

/**
 * All payment gateways must implement this interface.
 * Methods throw on unrecoverable errors; return typed results otherwise.
 */
export abstract class PaymentGateway {
  abstract readonly name: string;

  /** Create a hosted checkout/payment page and return the URL to redirect the user to. */
  abstract createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;

  /**
   * Verify an incoming webhook request.
   * @param headers - Request headers (for HMAC/signature verification)
   * @param rawBody - Raw request body buffer (required for HMAC)
   */
  abstract verifyWebhook(
    headers: Headers,
    rawBody: Buffer,
  ): Promise<WebhookVerifyResult>;

  /** Issue a full or partial refund for a completed transaction. */
  abstract refund(params: RefundParams): Promise<RefundResult>;

  /** Returns true if all required env vars are configured for this gateway. */
  abstract isConfigured(): boolean;
}

// ── Gateway registry ──────────────────────────────────────────────────────────

const gateways = new Map<string, PaymentGateway>();

export function registerGateway(gateway: PaymentGateway): void {
  gateways.set(gateway.name, gateway);
}

export function getGateway(name: string): PaymentGateway {
  const gw = gateways.get(name);
  if (!gw) throw new Error(`Payment gateway "${name}" is not registered.`);
  return gw;
}

export function getConfiguredGateways(): PaymentGateway[] {
  return Array.from(gateways.values()).filter((gw) => gw.isConfigured());
}
