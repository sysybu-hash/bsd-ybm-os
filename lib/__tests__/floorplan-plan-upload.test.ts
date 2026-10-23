import {
  __setPlanUploadStoreForTests,
  beginPlanUpload,
  memoryPlanUploadStore,
  PLAN_UPLOAD_MAX_BYTES,
  PLAN_UPLOAD_PART_BYTES,
  planUploadReady,
  putPlanUploadPart,
  readPlanUpload,
} from "@/lib/projects/floorplan-plan-upload";

const ORG = "org_test";

describe("plan upload parts", () => {
  beforeEach(() => {
    __setPlanUploadStoreForTests(memoryPlanUploadStore());
  });

  afterAll(() => {
    __setPlanUploadStoreForTests(null);
  });

  it("reassembles a drawing that spans two parts and keeps its type", async () => {
    const head = Buffer.alloc(PLAN_UPLOAD_PART_BYTES, 1);
    const tail = Buffer.from("0\nSECTION\n2\nENTITIES\n");
    const whole = Buffer.concat([head, tail]);
    const id = await beginPlanUpload({
      orgId: ORG,
      fileName: "מרכז פסגה.dxf",
      totalBytes: whole.byteLength,
      totalParts: 2,
    });
    expect(id).toBeTruthy();
    expect(await putPlanUploadPart({ orgId: ORG, uploadId: id!, index: 0, bytes: head })).toBe(true);
    expect(await putPlanUploadPart({ orgId: ORG, uploadId: id!, index: 1, bytes: tail })).toBe(true);
    const staged = await readPlanUpload(ORG, id!);
    expect(staged?.bytes).toBe(whole.byteLength);
    expect(staged?.fileName).toBe("מרכז פסגה.dxf");
    expect(staged?.mimeType).toBe("image/vnd.dxf");
    expect(Buffer.from(staged!.base64, "base64").equals(whole)).toBe(true);
  });

  it("refuses a part count that does not match the size", async () => {
    expect(
      await beginPlanUpload({
        orgId: ORG,
        fileName: "plan.pdf",
        totalBytes: PLAN_UPLOAD_PART_BYTES + 1,
        totalParts: 1,
      }),
    ).toBeNull();
  });

  it("accepts a drawing larger than one stored object and refuses one past the cap", async () => {
    const totalBytes = 26 * 1024 * 1024;
    const id = await beginPlanUpload({
      orgId: ORG,
      fileName: "מרכז פסגה.dxf",
      totalBytes,
      totalParts: Math.ceil(totalBytes / PLAN_UPLOAD_PART_BYTES),
    });
    expect(id).toBeTruthy();
    expect(
      await beginPlanUpload({
        orgId: ORG,
        fileName: "huge.dxf",
        totalBytes: PLAN_UPLOAD_MAX_BYTES + 1,
        totalParts: Math.ceil((PLAN_UPLOAD_MAX_BYTES + 1) / PLAN_UPLOAD_PART_BYTES),
      }),
    ).toBeNull();
  });

  it("reports the upload ready only after every part is stored", async () => {
    const head = Buffer.alloc(8, 1);
    const id = await beginPlanUpload({
      orgId: ORG,
      fileName: "plan.dxf",
      totalBytes: head.byteLength,
      totalParts: 1,
    });
    expect(await planUploadReady(ORG, id!)).toBe(false);
    expect(await putPlanUploadPart({ orgId: ORG, uploadId: id!, index: 0, bytes: head })).toBe(true);
    expect(await planUploadReady(ORG, id!)).toBe(true);
  });
});
