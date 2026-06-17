import {
  parseExpenseAmountsFromV5,
  pickInvoiceNumberFromV5,
} from "@/lib/workspace-api/expense-from-scan";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";

describe("expense-from-scan", () => {
  it("parses amounts from line items when available", () => {
    const v5: ScanExtractionV5 = {
      schemaVersion: 5,
      documentMetadata: {
        project: null,
        client: null,
        documentDate: null,
        drawingRefs: null,
        discipline: null,
        sheetIndex: null,
        sourceFileName: null,
        scanMode: "INVOICE_FINANCIAL",
      },
      billOfQuantities: [],
      lineItems: [
        { description: "A", lineTotal: 100, vatAmount: 17 },
        { description: "B", lineTotal: 200, vatAmount: 34 },
      ],
      vendor: "Vendor",
      total: 351,
      date: "2026-06-01",
      docType: "INV-99",
      summary: "test",
      priceAlertPending: false,
    };

    const amounts = parseExpenseAmountsFromV5(v5);
    expect(amounts.amountNet).toBe(300);
    expect(amounts.vat).toBe(51);
    expect(amounts.total).toBe(351);
    expect(pickInvoiceNumberFromV5(v5)).toBe("INV-99");
  });

  it("falls back to VAT split from header total", () => {
    const v5: ScanExtractionV5 = {
      schemaVersion: 5,
      documentMetadata: {
        project: null,
        client: null,
        documentDate: null,
        drawingRefs: null,
        discipline: null,
        sheetIndex: null,
        sourceFileName: null,
        scanMode: "INVOICE_FINANCIAL",
      },
      billOfQuantities: [],
      lineItems: [],
      vendor: "Rent",
      total: 117,
      date: null,
      docType: "general",
      summary: "",
      priceAlertPending: false,
    };

    const amounts = parseExpenseAmountsFromV5(v5);
    expect(amounts.total).toBe(117);
    expect(amounts.amountNet).toBe(100);
    expect(amounts.vat).toBe(17);
    expect(pickInvoiceNumberFromV5(v5)).toBeNull();
  });
});
