import { mapLegacyAnalysisTypeToScanMode } from "@/lib/scan/legacy-map";
import { isScanUnifiedV2Enabled } from "@/lib/scan/feature-flag";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";

describe("unified-extract legacy map", () => {
  it("maps legacy analysis types to scan modes", () => {
    expect(mapLegacyAnalysisTypeToScanMode("INVOICE")).toBe("INVOICE_FINANCIAL");
    expect(mapLegacyAnalysisTypeToScanMode("BLUEPRINT")).toBe("DRAWING_BOQ");
    expect(mapLegacyAnalysisTypeToScanMode("unknown")).toBe("GENERAL_DOCUMENT");
  });
});

describe("feature-flag SCAN_UNIFIED_V2", () => {
  it("defaults unified v2 to enabled when env unset", () => {
    expect(typeof isScanUnifiedV2Enabled()).toBe("boolean");
    expect(isScanUnifiedV2Enabled()).toBe(true);
  });
});

describe("unified save targets", () => {
  const targets: UnifiedSaveTarget[] = ["erp", "crm", "project", "notebook", "expense"];

  it("exposes all save destinations used by the hub", () => {
    expect(targets).toHaveLength(5);
    expect(new Set(targets).size).toBe(5);
  });
});
