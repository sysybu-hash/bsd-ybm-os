import {
  DwgConversionUnavailableError,
  dwgToDxf,
  isDwgConversionConfigured,
} from "@/lib/projects/floorplan-dwg-convert";

describe("dwg conversion", () => {
  it("says it is unavailable rather than failing silently", async () => {
    // No CLOUDCONVERT_API_KEY in the test environment: the caller has to be
    // able to tell the user to export a DXF, which every CAD program does.
    expect(isDwgConversionConfigured()).toBe(false);
    await expect(dwgToDxf(Buffer.from("AC1027"))).rejects.toBeInstanceOf(
      DwgConversionUnavailableError,
    );
  });

  it("carries a message the operator can act on", async () => {
    await expect(dwgToDxf(Buffer.from("AC1027"))).rejects.toThrow(/DXF/);
  });
});
