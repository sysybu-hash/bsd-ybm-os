jest.mock("server-only", () => ({}));

const mockCredits = { creditBalance: jest.fn(), recordCredit: jest.fn() };
jest.mock("@/lib/vmb/credits", () => ({
  creditBalance: (...a: unknown[]) => mockCredits.creditBalance(...a),
  recordCredit: (...a: unknown[]) => mockCredits.recordCredit(...a),
}));
const mockApply = jest.fn();
jest.mock("@/lib/vmb/billing", () => ({ applyVmbPayment: (...a: unknown[]) => mockApply(...a) }));

const mockDb = {
  vmbWorkspace: { findUnique: jest.fn() },
  vmbSubscription: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { bookletNumbers, runAdminAction } from "@/lib/vmb/admin-store";
import { vmbAdminActionSchema } from "@/lib/validation/schemas/vmb-admin";

describe("VMB admin", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb.vmbWorkspace.findUnique.mockResolvedValue({ id: "w1" });
    mockCredits.creditBalance.mockResolvedValue(10);
    mockCredits.recordCredit.mockResolvedValue(true);
  });

  it("counts the free-render share and credits per booklet from delivered booklets only", () => {
    const n = bookletNumbers([
      { computeMs: 60_000, manifest: { booklet: { picturesPainted: 8, picturesFree: 2, creditsUsed: 12 } } },
      { computeMs: 120_000, manifest: { booklet: { picturesPainted: 10, picturesFree: 0, creditsUsed: 14 } } },
      { computeMs: 5_000, manifest: { answers: {} } },
    ]);
    expect(n).toEqual({ picturesDelivered: 20, freeRenderShare: 0.1, creditsPerBooklet: 13, avgComputeSeconds: 90 });
    expect(bookletNumbers([])).toEqual({ picturesDelivered: 0, freeRenderShare: null, creditsPerBooklet: null, avgComputeSeconds: null });
  });

  it("grants credits as an adjustment with a unique reference and the admin in the note", async () => {
    expect(await runAdminAction("admin@x.co", { action: "grant", workspaceId: "w1", amount: 50, note: "pilot" })).toEqual({ ok: true });
    const rec = mockCredits.recordCredit.mock.calls[0][0];
    expect(rec).toMatchObject({ workspaceId: "w1", delta: 50, reason: "adjust", note: "pilot (admin@x.co)" });
    expect(rec.refId).toMatch(/^admin:/);
  });

  it("never takes the balance below zero", async () => {
    expect(await runAdminAction("a@x.co", { action: "grant", workspaceId: "w1", amount: -11, note: "fix" })).toEqual({ ok: false, code: "below_zero" });
    expect(mockCredits.recordCredit).not.toHaveBeenCalled();
  });

  it("activates after a bank transfer once per reference", async () => {
    mockApply.mockResolvedValueOnce({ applied: true }).mockResolvedValueOnce({ applied: false, reason: "duplicate" });
    expect(await runAdminAction("a@x.co", { action: "activate", workspaceId: "w1", reference: "BANK-1" })).toEqual({ ok: true });
    expect(mockApply.mock.calls[0][0]).toMatchObject({ gateway: "manual", txId: "BANK-1", trustAmount: true, purchase: { kind: "annual", workspaceId: "w1" } });
    expect(await runAdminAction("a@x.co", { action: "activate", workspaceId: "w1", reference: "BANK-1" })).toEqual({ ok: false, code: "duplicate" });
  });

  it("freezes only an active subscription and unfreezes only a frozen one", async () => {
    mockDb.vmbSubscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await runAdminAction("a@x.co", { action: "freeze", workspaceId: "w1" })).toEqual({ ok: true });
    expect(mockDb.vmbSubscription.updateMany.mock.calls[0][0].where).toEqual({ workspaceId: "w1", status: "active" });
    expect(await runAdminAction("a@x.co", { action: "unfreeze", workspaceId: "w1" })).toEqual({ ok: false, code: "not_frozen" });
  });

  it("extends from the later of today and the period end", async () => {
    const end = new Date(Date.now() + 10 * 86_400_000);
    mockDb.vmbSubscription.findUnique.mockResolvedValue({ periodEnd: end });
    expect(await runAdminAction("a@x.co", { action: "extend", workspaceId: "w1", days: 30 })).toEqual({ ok: true });
    expect(mockDb.vmbSubscription.update.mock.calls[0][0].data.periodEnd.getTime()).toBe(end.getTime() + 30 * 86_400_000);
    mockDb.vmbSubscription.findUnique.mockResolvedValue(null);
    expect(await runAdminAction("a@x.co", { action: "extend", workspaceId: "w1", days: 30 })).toEqual({ ok: false, code: "no_subscription" });
  });

  it("an unknown office is not touched", async () => {
    mockDb.vmbWorkspace.findUnique.mockResolvedValue(null);
    expect(await runAdminAction("a@x.co", { action: "freeze", workspaceId: "nope" })).toEqual({ ok: false, code: "not_found" });
    expect(mockDb.vmbSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("the body schema refuses zero, fractions and unknown actions", () => {
    expect(vmbAdminActionSchema.safeParse({ action: "grant", workspaceId: "w1", amount: 0, note: "xx" }).success).toBe(false);
    expect(vmbAdminActionSchema.safeParse({ action: "grant", workspaceId: "w1", amount: 1.5, note: "xx" }).success).toBe(false);
    expect(vmbAdminActionSchema.safeParse({ action: "delete", workspaceId: "w1" }).success).toBe(false);
    expect(vmbAdminActionSchema.safeParse({ action: "extend", workspaceId: "w1", days: 400 }).success).toBe(false);
    expect(vmbAdminActionSchema.safeParse({ action: "extend", workspaceId: "w1", days: 30 }).success).toBe(true);
  });
});
