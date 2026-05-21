import {
  inferScreenTypeFromFile,
  inferScreenTypeFromFileForIndustry,
  resolvePolicy,
  resolvePolicyForIndustry,
} from "@/lib/ai/screen-decode-policy";

describe("screen-decode-policy", () => {
  it("infers invoice from filename", () => {
    expect(inferScreenTypeFromFile("חשבונית-123.pdf", "application/pdf")).toBe("invoice");
  });

  it("resolves blueprint policy with BOQ post-actions", () => {
    const p = resolvePolicy("blueprint");
    expect(p.scanMode).toBe("DRAWING_BOQ");
    expect(p.postActions).toContain("boq");
  });

  it("maps blueprint to general document for company mgmt", () => {
    const inferred = inferScreenTypeFromFileForIndustry("תוכנית-קומה.pdf", "application/pdf", "COMPANY_MGMT");
    expect(inferred).not.toBe("blueprint");
    const p = resolvePolicyForIndustry("blueprint", "COMPANY_MGMT");
    expect(p.scanMode).toBe("GENERAL_DOCUMENT");
    expect(p.postActions).not.toContain("boq");
  });
});
