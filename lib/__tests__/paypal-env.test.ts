/**
 * @jest-environment node
 */
const mockEnv: { PAYPAL_ENV?: string } = {};

jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}));

import {
  PAYPAL_LIVE_BASE_URL,
  PAYPAL_SANDBOX_BASE_URL,
  resolvePayPalEnv,
} from "@/lib/paypal-server";

describe("resolvePayPalEnv", () => {
  afterEach(() => {
    delete mockEnv.PAYPAL_ENV;
  });

  it("routes the exact string 'sandbox' to the sandbox endpoint", () => {
    mockEnv.PAYPAL_ENV = "sandbox";
    expect(resolvePayPalEnv()).toEqual({
      name: "sandbox",
      baseUrl: PAYPAL_SANDBOX_BASE_URL,
    });
  });

  // These four all used to reach the LIVE endpoint silently. Sending sandbox
  // credentials there returns a flat `invalid_client`, indistinguishable from a
  // wrong secret — which is exactly how a production signup broke unnoticed.
  it.each(["Sandbox", "SANDBOX", " sandbox", "sandbox\n"])(
    "still resolves to sandbox for %j",
    (value) => {
      mockEnv.PAYPAL_ENV = value;
      expect(resolvePayPalEnv().name).toBe("sandbox");
    },
  );

  it("defaults to live when unset", () => {
    expect(resolvePayPalEnv()).toEqual({ name: "live", baseUrl: PAYPAL_LIVE_BASE_URL });
  });

  it.each(["", "   ", "live", "production", "prod"])(
    "resolves to live for %j",
    (value) => {
      mockEnv.PAYPAL_ENV = value;
      expect(resolvePayPalEnv().name).toBe("live");
    },
  );

  it("never returns a base url outside the two known PayPal hosts", () => {
    for (const value of ["sandbox", "live", "", "nonsense"]) {
      mockEnv.PAYPAL_ENV = value;
      expect([PAYPAL_SANDBOX_BASE_URL, PAYPAL_LIVE_BASE_URL]).toContain(
        resolvePayPalEnv().baseUrl,
      );
    }
  });
});
