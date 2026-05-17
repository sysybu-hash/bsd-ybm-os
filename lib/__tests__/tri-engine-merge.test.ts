import { enrichInvoiceV5, mergeScanResults } from "@/lib/tri-engine-merge";
import { emptyV5Base } from "@/lib/scan-schema-v5";

describe("tri-engine-merge", () => {
  it("mergeScanResults deduplicates line items for invoices", () => {
    const a = emptyV5Base("inv.pdf", "INVOICE_FINANCIAL", {
      lineItems: [{ description: "שורה א", quantity: 1, lineTotal: 100 }],
      total: 100,
    });
    const b = emptyV5Base("inv.pdf", "INVOICE_FINANCIAL", {
      lineItems: [{ description: "שורה א", quantity: 1, lineTotal: 100 }],
      total: 50,
    });
    const merged = mergeScanResults(a, b, "inv.pdf", "INVOICE_FINANCIAL");
    expect(merged.lineItems).toHaveLength(1);
    expect(merged.total).toBe(100);
  });

  it("enrichInvoiceV5 fills client from vendor and sums line totals", () => {
    const v5 = emptyV5Base("x.pdf", "INVOICE_FINANCIAL", {
      vendor: "ספק בע״מ",
      total: 0,
      lineItems: [
        { description: "א", quantity: 1, lineTotal: 80 },
        { description: "ב", quantity: 1, lineTotal: 20 },
      ],
    });
    const enriched = enrichInvoiceV5(v5);
    expect(enriched.documentMetadata.client).toBe("ספק בע״מ");
    expect(enriched.total).toBe(100);
  });
});
