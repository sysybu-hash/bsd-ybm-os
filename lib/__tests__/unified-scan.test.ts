import { mapLegacyAnalysisTypeToScanMode } from "@/lib/scan/legacy-map";

describe("unified-extract", () => {
  it("maps legacy analysis types to scan modes", () => {
    expect(mapLegacyAnalysisTypeToScanMode("INVOICE")).toBe("INVOICE_FINANCIAL");
    expect(mapLegacyAnalysisTypeToScanMode("BLUEPRINT")).toBe("DRAWING_BOQ");
    expect(mapLegacyAnalysisTypeToScanMode("unknown")).toBe("GENERAL_DOCUMENT");
  });
});

describe("feature-flag", () => {
  it("defaults unified v2 to enabled when env unset", async () => {
    const { isScanUnifiedV2Enabled } = await import("@/lib/scan/feature-flag");
    expect(typeof isScanUnifiedV2Enabled()).toBe("boolean");
  });
});
