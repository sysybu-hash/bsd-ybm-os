jest.mock("@/lib/pdf/hebrew-pdf", () => ({
  renderHebrewInvoicePdf: jest.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
}));

import { buildInvoicePdfBuffer } from "@/lib/invoice-export";

const samplePayload = {
  type: "INVOICE",
  number: 1001,
  clientName: "לקוח בדיקה",
  date: "16/05/2026",
  amount: 1000,
  vat: 180,
  total: 1180,
  items: [{ desc: "שירות", qty: 1, price: 1000 }],
  orgName: "BSD-YBM",
  orgTaxId: "123456789",
};

describe("buildInvoicePdfBuffer", () => {
  it("returns non-empty PDF bytes", async () => {
    const buffer = await buildInvoicePdfBuffer(samplePayload);
    expect(buffer.byteLength).toBeGreaterThan(4);
    const header = String.fromCharCode(...buffer.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
