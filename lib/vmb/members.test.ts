jest.mock("server-only", () => ({}));

const mockSend = jest.fn();
jest.mock("@/lib/mail-core", () => ({ escapeHtml: (s: string) => s, sendTransactionalEmail: (...a: unknown[]) => mockSend(...a) }));
const mockDb = {
  vmbMembership: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  vmbUser: { findUnique: jest.fn() },
  vmbInvite: { upsert: jest.fn(), deleteMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  vmbWorkspace: { findUnique: jest.fn() },
  vmbCreditLedger: { findMany: jest.fn() },
  vmbJob: { findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { acceptInvite, creditsByProject, inviteMember, removeMember } from "@/lib/vmb/members";

describe("VMB office members", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    mockDb.vmbMembership.findUnique.mockResolvedValue({ role: "owner" });
    mockDb.vmbWorkspace.findUnique.mockResolvedValue({ name: "משרד" });
    mockSend.mockResolvedValue({ ok: true });
  });

  it("invites a new address lower-cased and mails it", async () => {
    mockDb.vmbUser.findUnique.mockResolvedValue(null);
    expect(await inviteMember("o1", "w1", " New@X.co ")).toEqual({ ok: true });
    expect(mockDb.vmbInvite.upsert.mock.calls[0][0].create).toMatchObject({ workspaceId: "w1", email: "new@x.co", invitedById: "o1" });
    expect(mockSend.mock.calls[0][0]).toBe("new@x.co");
  });

  it("does not move someone who already has an office, and only the owner invites", async () => {
    mockDb.vmbUser.findUnique.mockResolvedValue({ memberships: [{ workspaceId: "w2" }] });
    expect(await inviteMember("o1", "w1", "a@x.co")).toEqual({ ok: false, code: "has_office" });
    mockDb.vmbUser.findUnique.mockResolvedValue({ memberships: [{ workspaceId: "w1" }] });
    expect(await inviteMember("o1", "w1", "a@x.co")).toEqual({ ok: false, code: "already_member" });
    mockDb.vmbMembership.findUnique.mockResolvedValue({ role: "member" });
    expect(await inviteMember("m1", "w1", "a@x.co")).toEqual({ ok: false, code: "not_owner" });
    expect(mockDb.vmbInvite.upsert).not.toHaveBeenCalled();
  });

  it("an invitation is taken only by an address Google verified", async () => {
    mockDb.vmbUser.findUnique.mockResolvedValue({ emailVerified: false });
    expect(await acceptInvite("u1", "a@x.co")).toBeNull();
    expect(mockDb.vmbInvite.findFirst).not.toHaveBeenCalled();
    mockDb.vmbUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockDb.vmbInvite.findFirst.mockResolvedValue({ id: "i1", workspace: { id: "w1", name: "משרד" } });
    expect(await acceptInvite("u1", "A@x.co")).toEqual({ id: "w1", name: "משרד" });
    expect(mockDb.vmbInvite.findFirst.mock.calls[0][0].where).toEqual({ email: "a@x.co", acceptedAt: null });
    expect(mockDb.vmbMembership.create).toHaveBeenCalledWith({ data: { workspaceId: "w1", userId: "u1", role: "member" } });
  });

  it("the owner cannot remove themself", async () => {
    expect(await removeMember("o1", "w1", "o1")).toEqual({ ok: false, code: "self" });
    mockDb.vmbMembership.deleteMany.mockResolvedValue({ count: 1 });
    expect(await removeMember("o1", "w1", "u2")).toEqual({ ok: true });
  });

  it("sums held minus released per project", async () => {
    mockDb.vmbCreditLedger.findMany.mockResolvedValue([
      { jobId: "j1", delta: -20 },
      { jobId: "j1", delta: 9 },
      { jobId: "j2", delta: -10 },
      { jobId: "j2", delta: 10 },
      { jobId: "j3", delta: -6 },
    ]);
    mockDb.vmbJob.findMany.mockResolvedValue([
      { id: "j1", status: "done", project: { id: "p1", name: "א" } },
      { id: "j2", status: "failed", project: { id: "p1", name: "א" } },
      { id: "j3", status: "running", project: { id: "p2", name: "ב" } },
    ]);
    expect(await creditsByProject("w1")).toEqual([
      { projectId: "p1", name: "א", credits: 11, booklets: 1 },
      { projectId: "p2", name: "ב", credits: 6, booklets: 0 },
    ]);
  });
});
