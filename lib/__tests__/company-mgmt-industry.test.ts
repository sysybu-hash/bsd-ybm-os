import { isCompanyMgmtIndustry, normalizeBusinessLine } from "@/lib/business-lines";
import { getMergedIndustryConfig } from "@/lib/construction-trades";
import { getProjectSubDomainsForIndustry } from "@/lib/project-sub-domains";
import { normalizeIndustryType } from "@/lib/professions/config";
import { clampScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";

describe("COMPANY_MGMT industry", () => {
  it("normalizes industry aliases", () => {
    expect(normalizeIndustryType("BUSINESS")).toBe("COMPANY_MGMT");
    expect(normalizeIndustryType("company_mgmt")).toBe("COMPANY_MGMT");
  });

  it("detects company mgmt industry", () => {
    expect(isCompanyMgmtIndustry("COMPANY_MGMT")).toBe(true);
    expect(isCompanyMgmtIndustry("CONSTRUCTION")).toBe(false);
  });

  it("returns business sub-domains for company mgmt", () => {
    const subs = getProjectSubDomainsForIndustry("COMPANY_MGMT");
    expect(subs.map((s) => s.id)).toContain("SALES");
    expect(subs.map((s) => s.id)).not.toContain("SKELETON");
  });

  it("limits UI scan modes for company mgmt", () => {
    const modes = getScanModesForUi("COMPANY_MGMT").map((m) => m.id);
    expect(modes).toContain("INVOICE_FINANCIAL");
    expect(modes).toContain("GENERAL_DOCUMENT");
    expect(modes).not.toContain("DRAWING_BOQ");
    expect(clampScanModeForIndustry("SITE_LOG", "COMPANY_MGMT")).toBe("GENERAL_DOCUMENT");
  });

  it("merges business line into industry config", () => {
    const cfg = getMergedIndustryConfig("COMPANY_MGMT", "TECH");
    expect(cfg.label).toBeTruthy();
    expect(cfg.scanner.analysisTypes).not.toContain("BOQ_DOCUMENT");
    expect(normalizeBusinessLine("unknown")).toBe("GENERAL_BUSINESS");
  });
});
