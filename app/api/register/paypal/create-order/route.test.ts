import { POST } from "@/app/api/register/paypal/create-order/route";
import { createPayPalOrderId } from "@/lib/billing/paypal-order";
import { getExpectedTierOrderAmountIls } from "@/lib/billing-pricing";
import { isPayPalServerConfigured } from "@/lib/paypal-server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status ?? 200,
      json: async () => body,
    })),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  applyRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/paypal-server", () => ({
  isPayPalServerConfigured: jest.fn(() => true),
}));

jest.mock("@/lib/billing/paypal-order", () => ({
  createPayPalOrderId: jest.fn().mockResolvedValue("PAYPAL-ORDER-1"),
}));

jest.mock("@/lib/billing-pricing", () => ({
  getExpectedTierOrderAmountIls: jest.fn().mockResolvedValue(159.9),
}));

jest.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const mockCreateOrder = createPayPalOrderId as jest.MockedFunction<typeof createPayPalOrderId>;
const mockPrice = getExpectedTierOrderAmountIls as jest.MockedFunction<
  typeof getExpectedTierOrderAmountIls
>;
const mockConfigured = isPayPalServerConfigured as jest.MockedFunction<
  typeof isPayPalServerConfigured
>;

function createMockRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/register/paypal/create-order", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockCreateOrder.mockResolvedValue("PAYPAL-ORDER-1");
    mockPrice.mockResolvedValue(159.9);
  });

  test("stamps the order with the custom_id verifyRegistrationPayPalOrder expects", async () => {
    const response = await POST(
      createMockRequest({ email: "Buyer@Example.com", tier: "company" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "PAYPAL-ORDER-1" });
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        // REG|<email>|TIER|<tier>|<cycle> — parsed back in lib/register-paypal-verify.ts
        customId: "REG|buyer@example.com|TIER|COMPANY|M",
        amountValue: "159.90",
      }),
    );
  });

  test("prices the order server-side and ignores any client-supplied amount", async () => {
    await POST(
      createMockRequest({
        email: "buyer@example.com",
        tier: "CORPORATE",
        amount: 1,
        amountValue: "1.00",
        price: 1,
      } as Record<string, unknown>),
    );

    expect(mockPrice).toHaveBeenCalledWith("CORPORATE", "monthly");
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountValue: "159.90" }),
    );
  });

  test("annual billing uses the annual price and cycle token", async () => {
    mockPrice.mockResolvedValue(1535.04);

    await POST(
      createMockRequest({
        email: "buyer@example.com",
        tier: "COMPANY",
        billingCycle: "annual",
      }),
    );

    expect(mockPrice).toHaveBeenCalledWith("COMPANY", "annual");
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customId: "REG|buyer@example.com|TIER|COMPANY|A",
        amountValue: "1535.04",
      }),
    );
  });

  test("rejects an invalid email without calling PayPal", async () => {
    const response = await POST(createMockRequest({ email: "a@b", tier: "COMPANY" }));

    expect(response.status).toBe(400);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test("rejects FREE and unknown tiers without calling PayPal", async () => {
    for (const tier of ["FREE", "PLATINUM", ""]) {
      const response = await POST(createMockRequest({ email: "buyer@example.com", tier }));
      expect(response.status).toBe(400);
    }
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test("refuses an email too long to fit PayPal's custom_id rather than truncating", async () => {
    const longEmail = `${"a".repeat(120)}@example.com`;

    const response = await POST(createMockRequest({ email: longEmail, tier: "COMPANY" }));

    expect(response.status).toBe(400);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test("round-trips through the parsing in lib/register-paypal-verify.ts", async () => {
    await POST(createMockRequest({ email: "buyer@example.com", tier: "COMPANY" }));

    const { customId } = mockCreateOrder.mock.calls[0]![0]!;
    const parts = customId.split("|");
    expect(parts[0]).toBe("REG");
    expect(parts[2]).toBe("TIER");
    expect(parts[1]).toBe("buyer@example.com");
    expect(parts[3]).toBe("COMPANY");
  });

  test("reports unavailable when PayPal is not configured", async () => {
    mockConfigured.mockReturnValue(false);

    const response = await POST(
      createMockRequest({ email: "buyer@example.com", tier: "COMPANY" }),
    );

    expect(response.status).toBe(503);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});
