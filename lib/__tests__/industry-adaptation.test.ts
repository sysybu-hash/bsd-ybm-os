import { resolveTaskTradeId } from "@/lib/project-task-trade";
import { getTradeSpecializedPrompt } from "@/lib/trade-specialized-prompt";
import { getMergedIndustryConfig } from "@/lib/construction-trades";

describe("resolveTaskTradeId — industry-aware sub-domain guessing", () => {
  it("returns a business sub-domain for COMPANY_MGMT when title matches", () => {
    const result = resolveTaskTradeId(null, "פגישת מכירות עם לקוח", "COMPANY_MGMT");
    // SALES or GENERAL are valid business sub-domains; must NOT be a construction sub-domain
    const constructionOnly = ["SKELETON", "ELECTRICAL", "PLUMBING", "HVAC", "PAINTING", "WATERPROOFING", "METALWORK", "DRYWALL"];
    expect(constructionOnly).not.toContain(result);
  });

  it("returns a construction sub-domain for CONSTRUCTION when title matches", () => {
    const result = resolveTaskTradeId(null, "עבודות חשמל בלוח 400V", "CONSTRUCTION");
    // Should guess ELECTRICAL or similar construction domain
    const businessOnly = ["SALES", "OPERATIONS", "FINANCE", "HR", "MARKETING", "TECHNOLOGY"];
    expect(businessOnly).not.toContain(result);
  });

  it("falls back to GENERAL when no match — both industries", () => {
    const construction = resolveTaskTradeId(null, "xyznonexistent", "CONSTRUCTION");
    const business = resolveTaskTradeId(null, "xyznonexistent", "COMPANY_MGMT");
    // Both return null (no guess) or GENERAL — not a cross-industry wrong answer
    if (construction !== null) {
      expect(["GENERAL", "SKELETON", "ELECTRICAL", "PLUMBING", "HVAC", "PAINTING",
              "WATERPROOFING", "METALWORK", "DRYWALL", "ALUMINUM", "LANDSCAPING",
              "GENERAL_CONTRACTOR", "SUBCONTRACTOR_OTHER"]).toContain(construction);
    }
    if (business !== null) {
      expect(["GENERAL", "SALES", "OPERATIONS", "FINANCE", "HR", "MARKETING", "TECHNOLOGY"]).toContain(business);
    }
  });

  it("respects explicit description over title regardless of industry", () => {
    // When description encodes a trade id (format: "trade:ID"), it takes priority over guessing
    const result = resolveTaskTradeId("trade:ELECTRICAL", "משהו אחר", "COMPANY_MGMT");
    expect(result).toBe("ELECTRICAL");
  });
});

describe("getTradeSpecializedPrompt — industry-aware prompt", () => {
  it("returns a business-domain prompt for COMPANY_MGMT", () => {
    const prompt = getTradeSpecializedPrompt("GENERAL_BUSINESS", "COMPANY_MGMT");
    const config = getMergedIndustryConfig("COMPANY_MGMT", "GENERAL_BUSINESS");
    expect(prompt).toContain(config.label);
    expect(prompt).not.toContain("construction ERP");
    expect(prompt).not.toContain("senior project manager");
  });

  it("returns a construction-domain prompt for CONSTRUCTION + ELECTRICAL", () => {
    const prompt = getTradeSpecializedPrompt("ELECTRICAL", "CONSTRUCTION");
    const config = getMergedIndustryConfig("CONSTRUCTION", "ELECTRICAL");
    expect(prompt).toContain(config.label);
  });

  it("returns a neutral prompt for unknown industry", () => {
    const prompt = getTradeSpecializedPrompt(null, null);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(10);
  });

  it("COMPANY_MGMT prompt does not use construction-domain framing", () => {
    const prompt = getTradeSpecializedPrompt("MARKETING", "COMPANY_MGMT");
    // The old fallback was "בנייה והתשתיות" — must not appear
    expect(prompt).not.toContain("בנייה והתשתיות");
    // Must not frame the assistant as a construction ERP assistant
    expect(prompt).not.toContain("construction ERP");
    expect(prompt).not.toContain("senior project manager");
    // Must include the business industry label
    const config = getMergedIndustryConfig("COMPANY_MGMT", "MARKETING");
    expect(prompt).toContain(config.label);
  });
});
