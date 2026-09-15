import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  floorplanFileHash,
  readCachedGrossAreaM2,
  writeCachedGrossAreaM2,
} from "@/lib/projects/floorplan-area-cache";

describe("printed-area disk cache", () => {
  it("returns the same area for the same bytes and nothing for a different file", () => {
    // A second CLI run of the same sheet must not pay for extract again.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fp-area-"));
    const a = Buffer.from("%PDF-apartment-14");
    const b = Buffer.from("%PDF-apartment-15");
    expect(floorplanFileHash(a)).not.toBe(floorplanFileHash(b));
    expect(readCachedGrossAreaM2(a, root)).toBeNull();
    writeCachedGrossAreaM2(a, 111.29, root);
    expect(readCachedGrossAreaM2(a, root)).toBe(111.29);
    expect(readCachedGrossAreaM2(b, root)).toBeNull();
  });
});
