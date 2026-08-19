import {
  executiveListTierPricingAction,
  executiveSaveTierPricingAction,
} from "@/app/actions/executive-subscriptions";
import { prisma } from "@/lib/prisma";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/workspace-revalidate", () => ({
  revalidateErpDocumentsSurfaces: jest.fn(),
  revalidateWorkspaceSurfaces: jest.fn(),
}));
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(async () => ({ user: { email: "admin@example.com" } })),
}));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/is-admin", () => ({ isAdmin: jest.fn(() => true) }));
jest.mock("@/lib/mail", () => ({ sendSubscriptionJoinInviteEmail: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    oSBillingConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    organization: { findMany: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  oSBillingConfig: { findUnique: jest.Mock; upsert: jest.Mock };
};

describe("tier pricing admin actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.oSBillingConfig.findUnique.mockResolvedValue(null);
    mockPrisma.oSBillingConfig.upsert.mockResolvedValue({});
  });

  test("reports the built-in price when nothing is overridden", async () => {
    const rows = await executiveListTierPricingAction();
    if ("error" in rows) throw new Error(rows.error);

    const company = rows.find((r) => r.tier === "COMPANY");
    expect(company).toMatchObject({
      defaultMonthlyIls: 159.9,
      effectiveMonthlyIls: 159.9,
      isOverridden: false,
    });
  });

  test("reports the override as the effective price, keeping the default visible", async () => {
    mockPrisma.oSBillingConfig.findUnique.mockResolvedValue({
      tierMonthlyPricesJson: { COMPANY: 349 },
    });

    const rows = await executiveListTierPricingAction();
    if ("error" in rows) throw new Error(rows.error);

    expect(rows.find((r) => r.tier === "COMPANY")).toMatchObject({
      defaultMonthlyIls: 159.9,
      effectiveMonthlyIls: 349,
      isOverridden: true,
    });
  });

  test("persists valid prices, rounded to agorot", async () => {
    const res = await executiveSaveTierPricingAction({ COMPANY: 349, CORPORATE: 899.005 });

    expect(res).toEqual({ ok: true });
    expect(mockPrisma.oSBillingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { tierMonthlyPricesJson: { COMPANY: 349, CORPORATE: 899.01 } },
      }),
    );
  });

  test("a null drops the override rather than storing it", async () => {
    await executiveSaveTierPricingAction({ COMPANY: null, CORPORATE: 899 });

    expect(mockPrisma.oSBillingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { tierMonthlyPricesJson: { CORPORATE: 899 } } }),
    );
  });

  test.each([
    ["a negative price", { COMPANY: -1 }],
    ["a non-finite price", { COMPANY: Number.NaN }],
    ["an absurd price", { COMPANY: 999_999 }],
    ["an unknown tier", { PLATINUM: 10 }],
  ])("rejects %s without writing", async (_label, payload) => {
    const res = await executiveSaveTierPricingAction(payload as Record<string, number | null>);

    expect(res.ok).toBe(false);
    expect(mockPrisma.oSBillingConfig.upsert).not.toHaveBeenCalled();
  });

  test("refuses a caller who is not a platform admin", async () => {
    const { isAdmin } = jest.requireMock("@/lib/is-admin") as { isAdmin: jest.Mock };
    isAdmin.mockReturnValueOnce(false);

    const res = await executiveSaveTierPricingAction({ COMPANY: 1 });

    expect(res).toEqual({ ok: false, error: "אין הרשאה" });
    expect(mockPrisma.oSBillingConfig.upsert).not.toHaveBeenCalled();
  });
});
