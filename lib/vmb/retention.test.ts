jest.mock("server-only", () => ({}));

const mockDel = jest.fn();
jest.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => mockDel(...a) }));
const mockDb = {
  vmbProject: { findMany: jest.fn(), update: jest.fn() },
  vmbProjectFile: { deleteMany: jest.fn() },
  vmbMembership: { findUnique: jest.fn() },
  vmbWorkspace: { update: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { filesDeleteAt, isRetentionChoice, purgeExpiredFiles, setRetention } from "@/lib/vmb/retention";

describe("VMB file retention", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("dates the deletion from the delivery, and never when the office keeps files", () => {
    const at = new Date("2026-11-12T00:00:00Z");
    expect(filesDeleteAt(at, 30)?.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    expect(filesDeleteAt(at, null)).toBeNull();
    expect(isRetentionChoice(7)).toBe(true);
    expect(isRetentionChoice(null)).toBe(true);
    expect(isRetentionChoice(1)).toBe(false);
  });

  it("deletes storage before rows, and keeps the rows when storage refuses", async () => {
    mockDb.vmbProject.findMany.mockResolvedValue([
      { id: "p1", manifest: { a: 1 }, files: [{ blobUrl: "u1" }, { blobUrl: "u2" }] },
      { id: "p2", manifest: null, files: [{ blobUrl: "u3" }] },
    ]);
    mockDel.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("blob down"));
    const now = new Date("2026-12-12T00:00:00Z");
    expect(await purgeExpiredFiles(now)).toBe(1);
    expect(mockDel).toHaveBeenNthCalledWith(1, ["u1", "u2"], expect.anything());
    expect(mockDb.vmbProjectFile.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockDb.vmbProjectFile.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(mockDb.vmbProject.update.mock.calls[0][0].data).toEqual({ filesDeleteAt: null, manifest: { a: 1, filesDeletedAt: now.toISOString() } });
    expect(mockDb.vmbProject.findMany.mock.calls[0][0].where).toMatchObject({ status: { not: "running" } });
  });

  it("only the owner sets the policy", async () => {
    mockDb.vmbMembership.findUnique.mockResolvedValueOnce({ role: "member" }).mockResolvedValueOnce({ role: "owner" });
    expect(await setRetention("u1", "w1", 7)).toBe(false);
    expect(await setRetention("u1", "w1", null)).toBe(true);
    expect(mockDb.vmbWorkspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { fileRetentionDays: null } });
  });
});
