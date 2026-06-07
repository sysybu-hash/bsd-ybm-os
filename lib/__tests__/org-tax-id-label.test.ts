import { formatOrgTaxIdLine, getOrgTaxIdLabelShort } from "@/lib/org-tax-id-label";

describe("org-tax-id-label", () => {
  it("uses ח.פ for LTD_COMPANY", () => {
    expect(getOrgTaxIdLabelShort("LTD_COMPANY")).toBe("ח.פ");
    expect(formatOrgTaxIdLine("517119798", "LTD_COMPANY")).toBe("ח.פ: 517119798");
  });

  it("uses ע.מ for licensed and exempt dealers", () => {
    expect(formatOrgTaxIdLine("123456789", "LICENSED_DEALER")).toBe("ע.מ: 123456789");
    expect(formatOrgTaxIdLine("123456789", "EXEMPT_DEALER")).toBe("ע.מ: 123456789");
  });

  it("returns null when tax id is empty", () => {
    expect(formatOrgTaxIdLine("", "LTD_COMPANY")).toBeNull();
    expect(formatOrgTaxIdLine("  ", "LTD_COMPANY")).toBeNull();
  });
});
