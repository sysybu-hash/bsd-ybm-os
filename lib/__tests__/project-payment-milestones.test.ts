import {
  BUSINESS_PAYMENT_MILESTONE_PRESETS,
  filterPaymentMilestonesForDisplay,
  getDefaultPaymentMilestonesForIndustry,
  isConstructionPaymentMilestoneName,
} from "@/lib/project-payment-milestones";

describe("project-payment-milestones", () => {
  it("returns business presets only for COMPANY_MGMT", () => {
    expect(getDefaultPaymentMilestonesForIndustry("COMPANY_MGMT").length).toBeGreaterThan(0);
    expect(getDefaultPaymentMilestonesForIndustry("CONSTRUCTION")).toEqual([]);
  });

  it("detects construction milestone names", () => {
    expect(isConstructionPaymentMilestoneName("אינסטלציה וצנרת")).toBe(true);
    expect(isConstructionPaymentMilestoneName("פרקט סלון")).toBe(true);
    expect(isConstructionPaymentMilestoneName("מקדמה")).toBe(false);
    expect(isConstructionPaymentMilestoneName("חשבונית ביניים")).toBe(false);
  });

  it("filters construction milestones for company mgmt display", () => {
    const rows = [
      { id: "1", name: "הריסה" },
      { id: "2", name: "מקדמה" },
    ];
    const filtered = filterPaymentMilestonesForDisplay("COMPANY_MGMT", rows);
    expect(filtered.map((r) => r.name)).toEqual(["מקדמה"]);
    expect(filterPaymentMilestonesForDisplay("CONSTRUCTION", rows)).toHaveLength(2);
  });

  it("business presets avoid construction keywords", () => {
    for (const p of BUSINESS_PAYMENT_MILESTONE_PRESETS) {
      expect(isConstructionPaymentMilestoneName(p.name)).toBe(false);
    }
  });
});
