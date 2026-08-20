/**
 * @jest-environment node
 *
 * Exercises the real PayPlus HMAC-SHA256 verification path (verifyPayPlusWebhook
 * in lib/webhook-verify.ts) by computing a genuinely valid signature locally with
 * the same algorithm against a test secret — no network call, no real payment.
 * Only processPayPlusWebhook (the DB-writing step) is mocked.
 *
 * Env vars are set via jest.resetModules() + dynamic require() inside each test
 * rather than top-level `process.env.X = ...` before the imports: static imports
 * are hoisted above plain statements at compile time, so lib/env.ts's env Proxy
 * can cache an empty snapshot before a source-order-earlier assignment ever runs.
 */
import { createHmac } from "crypto";

const SECRET = "test_payplus_secret_for_signing_only";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(Buffer.from(body, "utf8")).digest("hex");
}

function requestWithSignature(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["x-payplus-signature"] = signature;
  return new Request("http://localhost/api/webhooks/payplus", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/payplus", () => {
  let POST: (req: Request) => Promise<Response>;
  let processPayPlusWebhook: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    // force signature enforcement regardless of dev-mode leniency
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    process.env.PAYPLUS_SECRET_KEY = SECRET;

    jest.doMock("@/lib/payplus", () => ({
      ...jest.requireActual("@/lib/payplus"),
      processPayPlusWebhook: jest.fn(),
    }));
    jest.doMock("@/lib/logger", () => ({
      createLogger: () => ({
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      }),
    }));

    POST = require("../route").POST;
    processPayPlusWebhook = require("@/lib/payplus").processPayPlusWebhook;
  });

  it("verifies a genuinely signed successful transaction and processes it", async () => {
    processPayPlusWebhook.mockResolvedValue({ success: true });

    const body = JSON.stringify({
      event_type: "payment.success",
      transaction: { status: "success", uid: "txn_123" },
      more_info: JSON.stringify({ organizationId: "org_1", invoiceId: "inv_1" }),
    });

    const res = await POST(requestWithSignature(body, sign(body)));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(processPayPlusWebhook).toHaveBeenCalledTimes(1);
  });

  it("rejects a request with an invalid signature (401) and never processes it", async () => {
    const body = JSON.stringify({ event_type: "payment.success" });

    const res = await POST(requestWithSignature(body, "0".repeat(64)));

    expect(res.status).toBe(401);
    expect(processPayPlusWebhook).not.toHaveBeenCalled();
  });

  it("rejects a request with a signature computed from a different body (tampered payload)", async () => {
    const originalBody = JSON.stringify({ event_type: "payment.success", amount: 100 });
    const tamperedBody = JSON.stringify({ event_type: "payment.success", amount: 999999 });

    const res = await POST(requestWithSignature(tamperedBody, sign(originalBody)));

    expect(res.status).toBe(401);
    expect(processPayPlusWebhook).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header in production", async () => {
    const body = JSON.stringify({ event_type: "payment.success" });

    const res = await POST(requestWithSignature(body, null));

    expect(res.status).toBe(401);
    expect(processPayPlusWebhook).not.toHaveBeenCalled();
  });
});
