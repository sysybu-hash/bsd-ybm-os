/**
 * @jest-environment node
 *
 * Unlike the Stripe webhook tests, PayPal's signature check
 * (verifyPayPalWebhookSignature) calls PayPal's own REST verification
 * endpoint over the network — it can't be exercised with a locally-computed
 * signature. This test mocks that one function and instead proves the
 * route's wiring is correct: a verified event reaches applyPayPalCaptureResult
 * with the right data, an unverified one is rejected before ever reaching it.
 */
jest.mock("@/lib/paypal-server", () => ({
  isPayPalServerConfigured: jest.fn(),
  verifyPayPalWebhookSignature: jest.fn(),
  paypalFetchOrder: jest.fn(),
}));

jest.mock("@/lib/paypal-capture-apply", () => ({
  applyPayPalCaptureResult: jest.fn(),
}));

jest.mock("@/lib/vmb/billing", () => ({
  applyVmbPayment: jest.fn().mockResolvedValue({ applied: true }),
}));

jest.mock("@/lib/invoice-mailer", () => ({
  sendInvoiceEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { POST } from "../route";
import {
  isPayPalServerConfigured,
  verifyPayPalWebhookSignature,
} from "@/lib/paypal-server";
import { applyPayPalCaptureResult } from "@/lib/paypal-capture-apply";
import { applyVmbPayment } from "@/lib/vmb/billing";

const VALID_HEADERS = {
  "paypal-transmission-id": "txn-1",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
  "paypal-cert-url": "https://api.paypal.com/cert",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "fake-sig",
};

function captureCompletedPayload(customId: string) {
  return JSON.stringify({
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "cap_123",
      status: "COMPLETED",
      amount: { value: "99.00", currency_code: "ILS" },
      custom_id: customId,
    },
  });
}

describe("POST /api/webhooks/paypal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPayPalServerConfigured as jest.Mock).mockReturnValue(true);
  });

  it("returns 503 when PayPal is not configured", async () => {
    (isPayPalServerConfigured as jest.Mock).mockReturnValue(false);

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: captureCompletedPayload("org_1|TIER|dealer|monthly"),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 when required PayPal headers are missing", async () => {
    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      body: captureCompletedPayload("org_1|TIER|dealer|monthly"),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(verifyPayPalWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects a capture event when signature verification fails, without applying it", async () => {
    (verifyPayPalWebhookSignature as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: captureCompletedPayload("org_1|TIER|dealer|monthly"),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(applyPayPalCaptureResult).not.toHaveBeenCalled();
  });

  it("applies a verified PAYMENT.CAPTURE.COMPLETED event with the correct data", async () => {
    (verifyPayPalWebhookSignature as jest.Mock).mockResolvedValue(true);
    (applyPayPalCaptureResult as jest.Mock).mockResolvedValue({ ok: true, duplicate: false });

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: captureCompletedPayload("org_1|TIER|dealer|monthly"),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPayPalCaptureResult).toHaveBeenCalledTimes(1);
    expect(applyPayPalCaptureResult).toHaveBeenCalledWith(
      expect.objectContaining({
        customIdFull: "org_1|TIER|dealer|monthly",
        paidTotal: 99,
        currency: "ILS",
        captureId: "cap_123",
      }),
    );
  });

  it("ignores non-capture event types without calling apply", async () => {
    (verifyPayPalWebhookSignature as jest.Mock).mockResolvedValue(true);

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(applyPayPalCaptureResult).not.toHaveBeenCalled();
  });

  it("routes a VMB purchase to VMB billing, never to an organization", async () => {
    (verifyPayPalWebhookSignature as jest.Mock).mockResolvedValue(true);

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: captureCompletedPayload("VMB|cmwsabcdef123456|CREDITS|p500"),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(applyPayPalCaptureResult).not.toHaveBeenCalled();
    expect(applyVmbPayment).toHaveBeenCalledWith({
      purchase: { workspaceId: "cmwsabcdef123456", kind: "credits", packId: "p500" },
      gateway: "paypal",
      txId: "cap_123",
      amountMinor: 9900,
      currency: "ILS",
    });
  });

  it("drops a malformed VMB custom_id without touching either ledger", async () => {
    (verifyPayPalWebhookSignature as jest.Mock).mockResolvedValue(true);

    const req = new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: VALID_HEADERS,
      body: captureCompletedPayload("VMB|x|CREDITS|nope"),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(applyPayPalCaptureResult).not.toHaveBeenCalled();
    expect(applyVmbPayment).not.toHaveBeenCalled();
  });
});
