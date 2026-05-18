/**
 * @jest-environment node
 */
import { renderInvoicePdfWithPdfMake } from "@/lib/pdf/invoice-pdfmake";

const samplePayload = {
  type: "QUOTE",
  number: 1008,
  clientName: "יוחנן בוקשפן",
  date: "18/05/2026",
  amount: 76767,
  vat: 0,
  total: 76767,
  vatRatePercent: 18,
  items: [{ desc: "שירות ייעוץ", qty: 1, price: 76767 }],
  orgName: "BSD-YBM – מפתחי פלטפורמה",
  orgTaxId: "123456789",
};

describe("renderInvoicePdfWithPdfMake", () => {
  jest.setTimeout(30_000);

  it("renders valid Hebrew PDF", async () => {
    const buffer = await renderInvoicePdfWithPdfMake(samplePayload);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...buffer.slice(0, 5))).toBe("%PDF-");
  });
});
