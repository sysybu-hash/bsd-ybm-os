/**
 * @jest-environment node
 */
import { renderInvoicePdfWithPdfKit } from "@/lib/pdf/invoice-pdfkit";

const samplePayload = {
  type: "QUOTE",
  number: 1005,
  clientName: "יוחנן בוקשפן",
  date: "18/05/2026",
  amount: 1105000,
  vat: 0,
  total: 1105000,
  vatRatePercent: 18,
  items: [{ desc: "רלייחיחל", qty: 13, price: 85000 }],
  orgName: "BSD-YBM",
  orgTaxId: "123456789",
};

describe("renderInvoicePdfWithPdfKit", () => {
  jest.setTimeout(30_000);

  it("renders valid PDF bytes with Hebrew fonts", async () => {
    const buffer = await renderInvoicePdfWithPdfKit(samplePayload);
    expect(buffer.byteLength).toBeGreaterThan(500);
    const header = String.fromCharCode(...buffer.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
