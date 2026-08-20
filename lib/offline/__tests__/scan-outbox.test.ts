import { buildOutboxRecord, isNetworkError, SCAN_OUTBOX_MAX_BYTES } from "@/lib/offline/scan-outbox";

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

describe("scan-outbox helpers", () => {
  describe("buildOutboxRecord", () => {
    it("stamps id, createdAt and fileSize from the blob", () => {
      const rec = buildOutboxRecord(
        {
          fileBlob: blob(1234),
          fileName: "invoice.jpg",
          fileType: "image/jpeg",
          scanMode: "INVOICE_FINANCIAL",
          engineRunMode: "AUTO",
          projectId: "proj1",
          userInstruction: null,
        },
        1_700_000_000_000,
      );
      expect(rec.id).toMatch(/^outbox-1700000000000-/);
      expect(rec.createdAt).toBe(1_700_000_000_000);
      expect(rec.fileSize).toBe(1234);
      expect(rec.fileName).toBe("invoice.jpg");
      expect(rec.projectId).toBe("proj1");
    });

    it("generates unique ids", () => {
      const input = {
        fileBlob: blob(1),
        fileName: "a.jpg",
        fileType: "image/jpeg",
        scanMode: "GENERAL_DOCUMENT",
        engineRunMode: "AUTO",
        projectId: null,
        userInstruction: null,
      };
      const a = buildOutboxRecord(input);
      const b = buildOutboxRecord(input);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("isNetworkError", () => {
    it("treats fetch TypeError as a network error", () => {
      expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    });

    it("recognises common offline messages", () => {
      expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
      expect(isNetworkError(new Error("Load failed"))).toBe(true);
      expect(isNetworkError(new Error("network request failed"))).toBe(true);
    });

    it("does not treat server errors as network errors", () => {
      expect(isNetworkError(new Error("tri-engine 500"))).toBe(false);
      expect(isNetworkError(new Error("Unauthorized"))).toBe(false);
    });
  });

  it("exposes a 50MB quota constant", () => {
    expect(SCAN_OUTBOX_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
