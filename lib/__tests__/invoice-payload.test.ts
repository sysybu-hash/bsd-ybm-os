import { COMPANY_TYPE } from "@/lib/billing-calculations";
import { resolveExportTotals } from "@/lib/invoice-payload";

const licensedReportable = {
  companyType: COMPANY_TYPE.LICENSED_DEALER,
  isReportable: true,
  vatRatePercent: 18,
} as const;

describe("resolveExportTotals", () => {
  it("מחשב מע״מ מפריטים גם כשב-DB vat=0", () => {
    const totals = resolveExportTotals(
      {
        amount: 7500,
        vat: 0,
        total: 7500,
        items: [{ desc: "שירות", qty: 1, price: 7500 }],
      },
      licensedReportable,
    );
    expect(totals.amount).toBe(7500);
    expect(totals.vat).toBe(1350);
    expect(totals.total).toBe(8850);
    expect(totals.vatRatePercent).toBe(18);
  });

  it("מחזיר 0 מע״מ לעוסק פטור", () => {
    const totals = resolveExportTotals(
      {
        amount: 1000,
        vat: 180,
        total: 1180,
        items: [{ desc: "פריט", qty: 1, price: 1000 }],
      },
      {
        companyType: COMPANY_TYPE.EXEMPT_DEALER,
        isReportable: true,
        vatRatePercent: 18,
      },
    );
    expect(totals.vat).toBe(0);
    expect(totals.total).toBe(1000);
  });
});
