jest.mock("server-only", () => ({}));

const mockBlob = { head: jest.fn(), del: jest.fn() };
jest.mock("@vercel/blob", () => ({
  head: (...a: unknown[]) => mockBlob.head(...a),
  del: (...a: unknown[]) => mockBlob.del(...a),
}));

const mockDb = {
  vmbProject: { findFirst: jest.fn(), update: jest.fn() },
  vmbProjectFile: { aggregate: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  vmbScanReport: { deleteMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { deleteProjectFile, registerUploadedFile } from "@/lib/vmb/project-files";

const URL1 = "https://store.public.blob.vercel-storage.com/vmb/p1/plans/a-XyZ.dxf";
const base = { userId: "u1", projectId: "p1", url: URL1, relPath: "plans/a.dxf" };

describe("VMB project files on the server", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb.vmbProject.findFirst.mockResolvedValue({ id: "p1", workspaceId: "w1" });
    mockDb.vmbProjectFile.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { size: null } });
    mockDb.vmbProjectFile.findUnique.mockResolvedValue(null);
    mockDb.vmbProjectFile.upsert.mockResolvedValue({ id: "f1", relPath: "plans/a.dxf", kind: "dxf", size: 1000 });
    mockBlob.head.mockResolvedValue({ url: URL1, pathname: "vmb/p1/plans/a-XyZ.dxf", size: 1000, contentType: "image/vnd.dxf" });
    mockBlob.del.mockResolvedValue(undefined);
  });

  it("records a file that is in our store under this project", async () => {
    const r = await registerUploadedFile(base);
    expect(r).toEqual({ ok: true, file: expect.objectContaining({ id: "f1", kind: "dxf" }) });
    expect(mockDb.vmbProjectFile.upsert.mock.calls[0][0].create).toMatchObject({ projectId: "p1", relPath: "plans/a.dxf", size: 1000, uploadedBy: "u1" });
  });

  it("refuses a project outside the user's offices before touching storage", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue(null);
    await expect(registerUploadedFile(base)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(mockBlob.head).not.toHaveBeenCalled();
  });

  it("refuses a URL that is not in our store", async () => {
    mockBlob.head.mockRejectedValue(new Error("not found"));
    await expect(registerUploadedFile(base)).resolves.toEqual({ ok: false, code: "not_in_store" });
  });

  it("refuses a blob that belongs to another project's prefix", async () => {
    mockBlob.head.mockResolvedValue({ url: URL1, pathname: "vmb/p2/plans/a.dxf", size: 1, contentType: "image/vnd.dxf" });
    await expect(registerUploadedFile(base)).resolves.toEqual({ ok: false, code: "bad_path" });
    expect(mockDb.vmbProjectFile.upsert).not.toHaveBeenCalled();
  });

  it("refuses kinds VMB does not read", async () => {
    await expect(registerUploadedFile({ ...base, relPath: "notes.docx" })).resolves.toEqual({ ok: false, code: "bad_kind" });
  });

  it("drops the blob when the project is full", async () => {
    mockDb.vmbProjectFile.aggregate.mockResolvedValue({ _count: { _all: 400 }, _sum: { size: 10 } });
    await expect(registerUploadedFile(base)).resolves.toEqual({ ok: false, code: "too_many_files" });
    expect(mockBlob.del).toHaveBeenCalledWith([URL1], expect.anything());
  });

  it("replacing a path deletes the old blob", async () => {
    mockDb.vmbProjectFile.findUnique.mockResolvedValue({ blobUrl: "https://store/old.dxf" });
    await registerUploadedFile(base);
    expect(mockBlob.del).toHaveBeenCalledWith(["https://store/old.dxf"], expect.anything());
    // The old version's scan is dropped with it.
    expect(mockDb.vmbScanReport.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", fileName: "plans/a.dxf" } });
  });

  it("deletes only a file of the user's own project", async () => {
    mockDb.vmbProjectFile.findFirst.mockResolvedValue(null);
    await expect(deleteProjectFile("u1", "p1", "f9")).resolves.toBe(false);
    expect(mockBlob.del).not.toHaveBeenCalled();
    mockDb.vmbProjectFile.findFirst.mockResolvedValue({ id: "f1", blobUrl: URL1, relPath: "plans/a.dxf" });
    mockDb.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    await expect(deleteProjectFile("u1", "p1", "f1")).resolves.toBe(true);
    expect(mockDb.vmbProjectFile.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
    expect(mockBlob.del).toHaveBeenCalledWith([URL1], expect.anything());
    // Its scan goes with it.
    expect(mockDb.vmbScanReport.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", fileName: "plans/a.dxf" } });
  });
});
