/**
 * @jest-environment node
 *
 * Exercises the real Stripe signature-verification path (stripe.webhooks.constructEvent)
 * with a genuinely valid HMAC signature generated via the Stripe SDK's own test helper —
 * no network call to Stripe, no real money movement. Only the DB-writing apply
 * functions are mocked, so this proves the route correctly verifies + routes events.
 */
process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_signature_verification_only";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake_secret_for_signing_only";

jest.mock("@/lib/billing/stripe-apply", () => ({
  applyStripeCheckoutCompleted: jest.fn(),
  applyStripeSubscriptionEvent: jest.fn(),
}));

jest.mock("@/lib/invoice-mailer", () => ({
  sendInvoiceEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/lib/payments/register-gateways", () => ({}));

import Stripe from "stripe";
import { POST } from "../route";
import {
  applyStripeCheckoutCompleted,
  applyStripeSubscriptionEvent,
} from "@/lib/billing/stripe-apply";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function signedRequest(payload: string): Request {
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("verifies a genuinely signed checkout.session.completed event and applies it", async () => {
    (applyStripeCheckoutCompleted as jest.Mock).mockResolvedValue({ ok: true });

    const payload = JSON.stringify({
      id: "evt_test_checkout",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          amount_total: 9900,
          currency: "ils",
          customer_email: "org@example.com",
          metadata: { custom_id: "org_1|TIER|dealer|monthly" },
        },
      },
    });

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(applyStripeCheckoutCompleted).toHaveBeenCalledTimes(1);
    const passedSession = (applyStripeCheckoutCompleted as jest.Mock).mock.calls[0][0];
    expect(passedSession.id).toBe("cs_test_123");
  });

  it("verifies a genuinely signed customer.subscription.updated event and applies it", async () => {
    (applyStripeSubscriptionEvent as jest.Mock).mockResolvedValue({ ok: true });

    const payload = JSON.stringify({
      id: "evt_test_sub",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_123",
          object: "subscription",
          status: "active",
          customer: "cus_test_1",
          metadata: { custom_id: "org_1|TIER|dealer|monthly" },
        },
      },
    });

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect(applyStripeSubscriptionEvent).toHaveBeenCalledTimes(1);
    expect((applyStripeSubscriptionEvent as jest.Mock).mock.calls[0][1]).toBe(
      "customer.subscription.updated",
    );
  });

  it("rejects a request with an invalid signature without crashing", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "checkout.session.completed" });
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=not_a_real_signature" },
      body: payload,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(applyStripeCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("rejects a request with a signature signed by the wrong secret", async () => {
    const payload = JSON.stringify({ id: "evt_wrong_secret", type: "checkout.session.completed" });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_a_completely_different_secret",
    });
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
