import {
  calculateDocumentTotalsFromOrg,
  COMPANY_TYPE,
  shouldApplyVatForIssuedDocument,
} from "@/lib/billing-calculations";

describe("shouldApplyVatForIssuedDocument", () => {
  it("מציעה מחיר מחייבת מע״מ גם בלי דיווח מס", () => {
    expect(
      shouldApplyVatForIssuedDocument(
        { companyType: COMPANY_TYPE.LICENSED_DEALER, isReportable: false },
        "QUOTE",
      ),
    ).toBe(true);
  });

  it("קבלה פנימית ללא מע״מ כשאין דיווח", () => {
    expect(
      shouldApplyVatForIssuedDocument(
        { companyType: COMPANY_TYPE.LICENSED_DEALER, isReportable: false },
        "RECEIPT",
      ),
    ).toBe(false);
  });
});

describe("calculateDocumentTotalsFromOrg", () => {
  it("QUOTE עם isReportable=false — מע״מ 18%", () => {
    const t = calculateDocumentTotalsFromOrg(
      5000,
      {
        companyType: COMPANY_TYPE.LICENSED_DEALER,
        isReportable: false,
        vatRatePercent: 18,
      },
      { docType: "QUOTE" },
    );
    expect(t.vat).toBe(900);
    expect(t.total).toBe(5900);
  });
});
