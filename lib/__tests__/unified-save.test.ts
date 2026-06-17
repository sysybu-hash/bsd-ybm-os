import { mapLegacyAnalysisTypeToScanMode } from "@/lib/scan/legacy-map";

describe("unified-save targets", () => {
  it("maps blueprint analysis types", () => {
    expect(mapLegacyAnalysisTypeToScanMode("BLUEPRINT")).toBe("DRAWING_BOQ");
  });
});
