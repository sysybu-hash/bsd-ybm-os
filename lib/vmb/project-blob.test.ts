/** @jest-environment node */
const mockEnv: { VMB_BLOB_READ_WRITE_TOKEN?: string; BLOB_READ_WRITE_TOKEN?: string } = {};
const mockBlob = { put: jest.fn(), get: jest.fn(), head: jest.fn(), del: jest.fn() };
jest.mock("server-only", () => ({}));
jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));
jest.mock("@vercel/blob", () => ({
  put: (...a: unknown[]) => mockBlob.put(...a),
  get: (...a: unknown[]) => mockBlob.get(...a),
  head: (...a: unknown[]) => mockBlob.head(...a),
  del: (...a: unknown[]) => mockBlob.del(...a),
}));

import { deleteProjectBlobs, isProjectBlobUrl, projectBlobAccess, putProjectBlob, readProjectBlob } from "@/lib/projects/pipeline/project-blob";

const PRIV = "https://abc.private.blob.vercel-storage.com/vmb-booklets/j1/booklet-x.pdf";
const PUB = "https://abc.public.blob.vercel-storage.com/vmb/p1/a-x.dxf";

describe("project files in Blob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockEnv.VMB_BLOB_READ_WRITE_TOKEN;
    mockEnv.BLOB_READ_WRITE_TOKEN = "pub-token";
  });

  it("writes to the private store once its token is set, else to the public one", async () => {
    mockBlob.put.mockResolvedValue({ url: PUB });
    expect(projectBlobAccess()).toBe("public");
    await putProjectBlob("vmb-booklets/j1/booklet.pdf", Buffer.from("x"), "application/pdf");
    expect(mockBlob.put).toHaveBeenLastCalledWith("vmb-booklets/j1/booklet.pdf", expect.any(Buffer), expect.objectContaining({ access: "public", token: "pub-token" }));
    mockEnv.VMB_BLOB_READ_WRITE_TOKEN = "priv-token";
    expect(projectBlobAccess()).toBe("private");
    await putProjectBlob("vmb-booklets/j1/booklet.pdf", Buffer.from("x"), "application/pdf");
    expect(mockBlob.put).toHaveBeenLastCalledWith("vmb-booklets/j1/booklet.pdf", expect.any(Buffer), expect.objectContaining({ access: "private", token: "priv-token" }));
  });

  it("accepts only Blob's own hosts over https", () => {
    expect(isProjectBlobUrl(PRIV)).toBe(true);
    expect(isProjectBlobUrl(PUB)).toBe(true);
    expect(isProjectBlobUrl("https://evil.example.com/a.pdf")).toBe(false);
    expect(isProjectBlobUrl("http://abc.public.blob.vercel-storage.com/a")).toBe(false);
  });

  it("reads a private file with its token, and not at all without it", async () => {
    expect(await readProjectBlob(PRIV)).toBeNull();
    expect(mockBlob.get).not.toHaveBeenCalled();
    mockEnv.VMB_BLOB_READ_WRITE_TOKEN = "priv-token";
    mockBlob.get.mockResolvedValue({ statusCode: 200, stream: new Response("pdf!").body });
    expect((await readProjectBlob(PRIV))?.toString()).toBe("pdf!");
    expect(mockBlob.get).toHaveBeenCalledWith(PRIV, { access: "private", token: "priv-token" });
    mockBlob.get.mockResolvedValue({ statusCode: 200, stream: new Response("too long").body });
    expect(await readProjectBlob(PRIV, 4)).toBeNull();
    expect(await readProjectBlob("https://evil.example.com/a.pdf")).toBeNull();
  });

  it("deletes each address with its own store's token", async () => {
    mockEnv.VMB_BLOB_READ_WRITE_TOKEN = "priv-token";
    await deleteProjectBlobs([PRIV, PUB]);
    expect(mockBlob.del).toHaveBeenCalledWith([PRIV], { token: "priv-token" });
    expect(mockBlob.del).toHaveBeenCalledWith([PUB], { token: "pub-token" });
  });
});
