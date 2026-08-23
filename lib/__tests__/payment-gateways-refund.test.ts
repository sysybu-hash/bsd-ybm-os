/**
 * @jest-environment node
 */
jest.mock("@/lib/paypal-server", () => ({
  isPayPalServerConfigured: jest.fn(() => true),
  paypalCaptureOrder: jest.fn(),
  paypalCreateOrderBody: jest.fn(),
  paypalRefundCapture: jest.fn(),
  verifyPayPalWebhookSignature: jest.fn(),
}));

jest.mock("@/lib/stripe-server", () => ({
  isStripeConfigured: jest.fn(() => true),
  stripeCreateCheckoutSession: jest.fn(),
  stripeRefundPayment: jest.fn(),
  verifyStripeWebhookEvent: jest.fn(),
  getStripePriceId: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { paypalRefundCapture, isPayPalServerConfigured } from "@/lib/paypal-server";
import { stripeRefundPayment, isStripeConfigured } from "@/lib/stripe-server";
import { PayPalGateway } from "@/lib/payments/paypal-gateway";
import { StripeGateway } from "@/lib/payments/stripe-gateway";

describe("payment gateway refunds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPayPalServerConfigured as jest.Mock).mockReturnValue(true);
    (isStripeConfigured as jest.Mock).mockReturnValue(true);
  });

  it("PayPalGateway.refund delegates to paypalRefundCapture", async () => {
    (paypalRefundCapture as jest.Mock).mockResolvedValue({
      success: true,
      refundId: "REF-123",
      message: "Refund completed",
    });

    const gw = new PayPalGateway();
    const result = await gw.refund({ transactionId: "CAP-1", amount: 50, reason: "test" });

    expect(paypalRefundCapture).toHaveBeenCalledWith({
      captureId: "CAP-1",
      amount: 50,
      reason: "test",
    });
    expect(result).toEqual({
      success: true,
      refundId: "REF-123",
      message: "Refund completed",
    });
  });

  it("PayPalGateway.refund soft-gates when not configured", async () => {
    (isPayPalServerConfigured as jest.Mock).mockReturnValue(false);
    const gw = new PayPalGateway();
    const result = await gw.refund({ transactionId: "CAP-1" });
    expect(result.success).toBe(false);
    expect(paypalRefundCapture).not.toHaveBeenCalled();
  });

  it("StripeGateway.refund delegates to stripeRefundPayment", async () => {
    (stripeRefundPayment as jest.Mock).mockResolvedValue({
      success: true,
      refundId: "re_123",
      message: "Refund succeeded",
    });

    const gw = new StripeGateway();
    const result = await gw.refund({ transactionId: "pi_123", amount: 29.9 });

    expect(stripeRefundPayment).toHaveBeenCalledWith({
      paymentIntentId: "pi_123",
      amountIls: 29.9,
      reason: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("StripeGateway.isConfigured reflects stripe-server", () => {
    (isStripeConfigured as jest.Mock).mockReturnValue(false);
    expect(new StripeGateway().isConfigured()).toBe(false);
    (isStripeConfigured as jest.Mock).mockReturnValue(true);
    expect(new StripeGateway().isConfigured()).toBe(true);
  });
});
