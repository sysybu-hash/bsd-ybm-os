/**
 * @jest-environment node
 */
import { Prisma } from "@prisma/client";

jest.mock("server-only", () => ({}));

const mockTx = {
  vmbPayment: { create: jest.fn() },
  vmbSubscription: { findUnique: jest.fn(), upsert: jest.fn() },
  vmbCreditLedger: { create: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn() },
};
const mockDb = {
  vmbWorkspace: { findUnique: jest.fn() },
  vmbSubscription: { findUnique: jest.fn() },
  vmbCreditLedger: { aggregate: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { applyVmbPayment, expectedAmountMinor, parseVmbCustomId, vmbCustomId } from "@/lib/vmb/billing";
import { holdCredits, recordCredit, settleHold } from "@/lib/vmb/credits";
import { canRun, isSubscriptionActive } from "@/lib/vmb/entitlement";
import { nextPeriod, withVat } from "@/lib/vmb/plans";

const WS = "cmwsabcdef123456";

beforeEach(() => jest.clearAllMocks());

describe("custom_id", () => {
  it("round-trips both purchase kinds", () => {
    for (const p of [
      { workspaceId: WS, kind: "annual" as const },
      { workspaceId: WS, kind: "credits" as const, packId: "p500" },
    ]) {
      expect(parseVmbCustomId(vmbCustomId(p))).toEqual(p);
    }
  });

  it.each(["", "ORG|x|ANNUAL", `VMB|${WS}|CREDITS|nope`, "VMB|bad id!|ANNUAL", `VMB|${WS}|ANNUAL|extra`])("rejects %p", (raw) => {
    expect(parseVmbCustomId(raw)).toBeNull();
  });
});

describe("plans", () => {
  it("adds 18% VAT in agorot", () => {
    expect(withVat(15_000_00)).toBe(17_700_00);
    expect(expectedAmountMinor({ workspaceId: WS, kind: "annual" })).toBe(17_700_00);
  });

  it("renews from the end of a running period, else from now", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(nextPeriod(now, null).end.toISOString()).toBe("2027-11-11T00:00:00.000Z");
    const running = new Date("2027-03-01T00:00:00Z");
    expect(nextPeriod(now, running).start).toEqual(running);
    expect(nextPeriod(now, new Date("2026-01-01T00:00:00Z")).start).toEqual(now);
  });
});

describe("applyVmbPayment", () => {
  const annual = { workspaceId: WS, kind: "annual" as const };

  it("refuses a wrong amount or currency", async () => {
    await expect(applyVmbPayment({ purchase: annual, gateway: "paypal", txId: "T1", amountMinor: 100, currency: "ILS" })).resolves.toEqual({
      applied: false,
      reason: "amount_mismatch",
    });
    await expect(applyVmbPayment({ purchase: annual, gateway: "paypal", txId: "T1", amountMinor: 17_700_00, currency: "USD" })).resolves.toEqual({
      applied: false,
      reason: "currency_mismatch",
    });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("activates the subscription and grants the included credits", async () => {
    mockDb.vmbWorkspace.findUnique.mockResolvedValue({ id: WS });
    mockTx.vmbSubscription.findUnique.mockResolvedValue(null);
    await expect(applyVmbPayment({ purchase: annual, gateway: "paypal", txId: "T1", amountMinor: 17_700_00, currency: "ILS" })).resolves.toEqual({ applied: true });
    expect(mockTx.vmbSubscription.upsert).toHaveBeenCalled();
    expect(mockTx.vmbCreditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: WS, reason: "grant", refId: "paypal:T1", delta: 2000 }),
    });
  });

  it("treats a replayed capture as a duplicate", async () => {
    mockDb.vmbWorkspace.findUnique.mockResolvedValue({ id: WS });
    mockTx.vmbPayment.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    await expect(applyVmbPayment({ purchase: annual, gateway: "paypal", txId: "T1", amountMinor: 17_700_00, currency: "ILS" })).resolves.toEqual({
      applied: false,
      reason: "duplicate",
    });
  });
});

describe("credits", () => {
  it("records a replay only once", async () => {
    mockDb.vmbCreditLedger.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }));
    await expect(recordCredit({ workspaceId: WS, delta: 5, reason: "adjust", refId: "a1" })).resolves.toBe(true);
    await expect(recordCredit({ workspaceId: WS, delta: 5, reason: "adjust", refId: "a1" })).resolves.toBe(false);
  });

  it("refuses to hold more than the balance", async () => {
    mockTx.vmbCreditLedger.findUnique.mockResolvedValue(null);
    mockTx.vmbCreditLedger.aggregate.mockResolvedValue({ _sum: { delta: 40 } });
    await expect(holdCredits(WS, "job1", 50)).resolves.toEqual({ ok: false, code: "insufficient", balance: 40 });
    expect(mockTx.vmbCreditLedger.create).not.toHaveBeenCalled();
  });

  it("releases what a job did not use", async () => {
    mockDb.vmbCreditLedger.findUnique.mockResolvedValue({ delta: -50 });
    mockDb.vmbCreditLedger.create.mockResolvedValue({});
    await settleHold(WS, "job1", 30);
    expect(mockDb.vmbCreditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: 20, reason: "release", refId: "job1" }),
    });
  });
});

describe("entitlement", () => {
  const now = new Date("2026-11-11T00:00:00Z");
  it("needs an active subscription inside its period and enough credits", () => {
    const sub = { status: "active", periodEnd: new Date("2027-01-01T00:00:00Z"), includedCredits: 2000 };
    expect(isSubscriptionActive(sub, now)).toBe(true);
    expect(isSubscriptionActive({ ...sub, status: "frozen" }, now)).toBe(false);
    expect(isSubscriptionActive({ ...sub, periodEnd: new Date("2026-01-01T00:00:00Z") }, now)).toBe(false);
    expect(canRun({ subscription: null, active: false, balance: 999 }, 1)).toEqual({ ok: false, code: "no_subscription", balance: 999 });
    expect(canRun({ subscription: sub, active: true, balance: 3 }, 5)).toEqual({ ok: false, code: "insufficient_credits", balance: 3 });
    expect(canRun({ subscription: sub, active: true, balance: 5 }, 5)).toEqual({ ok: true });
  });
});
