/**
 * @jest-environment node
 */
jest.mock("@/lib/stripe-server", () => ({
  isStripeConfigured: jest.fn(),
  stripeCreateCheckoutSession: jest.fn(),
  stripeRefundPayment: jest.fn(),
  verifyStripeWebhookEvent: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  isStripeConfigured,
  stripeCreateCheckoutSession,
  verifyStripeWebhookEvent,
} from "@/lib/stripe-server";
import { StripeGateway } from "@/lib/payments/stripe-gateway";

describe("StripeGateway", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isStripeConfigured as jest.Mock).mockReturnValue(true);
  });

  it("createCheckout returns session URL and id", async () => {
    (stripeCreateCheckoutSession as jest.Mock).mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/test",
      sessionId: "cs_test_1",
    });

    const gw = new StripeGateway();
    const result = await gw.createCheckout({
      amount: 99,
      currencyCode: "ILS",
      itemName: "Test plan",
      customerName: "Test",
      customerEmail: "test@example.com",
      successUrl: "https://example.com/success",
      errorUrl: "https://example.com/cancel",
      callbackUrl: "https://example.com/webhook",
      idempotencyKey: "org|TIER|DEALER|M",
    });

    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/test");
    expect(result.providerRef).toBe("cs_test_1");
  });

  it("verifyWebhook marks valid when stripe-server verifies event", async () => {
    (verifyStripeWebhookEvent as jest.Mock).mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", amount_total: 9900 } },
    });

    const gw = new StripeGateway();
    const result = await gw.verifyWebhook(
      new Headers({ "stripe-signature": "sig" }),
      Buffer.from("{}"),
    );

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("checkout.session.completed");
    expect(result.transactionId).toBe("cs_1");
    expect(result.amount).toBe(99);
  });

  it("verifyWebhook invalid when verification fails", async () => {
    (verifyStripeWebhookEvent as jest.Mock).mockReturnValue(null);
    const gw = new StripeGateway();
    const result = await gw.verifyWebhook(new Headers(), Buffer.from("{}"));
    expect(result.valid).toBe(false);
  });
});
