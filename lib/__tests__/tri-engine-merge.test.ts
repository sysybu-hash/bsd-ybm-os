import { enrichInvoiceV5, mergeScanResults, mergeScanResultsMany } from "@/lib/tri-engine-merge";
import { emptyV5Base, type ScanExtractionV5 } from "@/lib/scan-schema-v5";

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

  it("enrichInvoiceV5 fills vendor from client metadata", () => {
    const v5 = emptyV5Base("x.pdf", "INVOICE_FINANCIAL", {
      vendor: "לא צוין",
      documentMetadata: { client: "חברת חשמל בע״מ" },
      total: 0,
      lineItems: [{ description: "א", quantity: 1, lineTotal: 50 }],
    } as Partial<ScanExtractionV5>);
    const enriched = enrichInvoiceV5(v5);
    expect(enriched.vendor).toBe("חברת חשמל בע״מ");
    expect(enriched.total).toBe(50);
  });

  it("enrichInvoiceV5 is a no-op for non-invoice scan modes", () => {
    const v5 = emptyV5Base("drawing.pdf", "DRAWING_BOQ", { total: 10 });
    expect(enrichInvoiceV5(v5)).toBe(v5);
  });

  it("mergeScanResults merges DRAWING_BOQ with deduplicated BOQ rows", () => {
    const boqRow = (description: string, unit: string, quantity: number, itemRef: string | null = null) => ({
      itemRef,
      description,
      material: null,
      dimensions: null,
      mepPoints: null,
      quantity,
      unit,
      notes: null,
    });
    const a = emptyV5Base("plan.pdf", "DRAWING_BOQ", {
      billOfQuantities: [boqRow("בטון", "מ\"ק", 2)],
      lineItems: [{ description: "קיר", quantity: 1 }],
      documentMetadata: { project: "פרויקט א", drawingRefs: ["A-1"] },
      total: 100,
      summary: "מנוע א",
    } as Partial<ScanExtractionV5>);
    const b = emptyV5Base("plan.pdf", "DRAWING_BOQ", {
      billOfQuantities: [
        boqRow("בטון", "מ\"ק", 2),
        boqRow("פלדה", "ק\"ג", 5),
      ],
      lineItems: [{ description: "קיר", quantity: 1 }],
      documentMetadata: { client: "לקוח ב", drawingRefs: ["B-2"] },
      total: 80,
      summary: "מנוע ב",
    } as Partial<ScanExtractionV5>);
    const merged = mergeScanResults(a, b, "plan.pdf", "DRAWING_BOQ");
    expect(merged.billOfQuantities).toHaveLength(2);
    expect(merged.lineItems).toHaveLength(1);
    expect(merged.documentMetadata.project).toBe("פרויקט א");
    expect(merged.documentMetadata.client).toBe("לקוח ב");
    expect(merged.total).toBe(100);
    expect(merged.enginesUsed).toEqual(["gemini", "openai"]);
  });

  it("mergeScanResults deduplicates billOfQuantities for standard scan modes", () => {
    const boqRow = (itemRef: string, description: string, quantity: number) => ({
      itemRef,
      description,
      material: null,
      dimensions: null,
      mepPoints: null,
      quantity,
      unit: null,
      notes: null,
    });
    const a = emptyV5Base("quote.pdf", "QUOTE_BOQ", {
      billOfQuantities: [boqRow("1", "עבודה", 3)],
    });
    const b = emptyV5Base("quote.pdf", "QUOTE_BOQ", {
      billOfQuantities: [
        boqRow("1", "עבודה", 3),
        boqRow("2", "חומר", 1),
      ],
    });
    const merged = mergeScanResults(a, b, "quote.pdf", "QUOTE_BOQ");
    expect(merged.billOfQuantities).toHaveLength(2);
  });

  describe("mergeScanResultsMany — confidence-weighted field voting", () => {
    const engine = (
      name: string,
      partial: Partial<ScanExtractionV5>,
    ): ScanExtractionV5 =>
      emptyV5Base("inv.pdf", "INVOICE_FINANCIAL", { enginesUsed: [name], ...partial });

    it("returns the single result unchanged when only one engine succeeded", () => {
      const only = engine("gemini", { vendor: "ספק יחיד", total: 50 });
      expect(mergeScanResultsMany([only], "inv.pdf", "INVOICE_FINANCIAL")).toBe(only);
    });

    it("picks the vendor whose combined confidence weight is highest", () => {
      const results = [
        engine("gemini", { vendor: "ACME", total: 100, confidenceScore: 0.9 }),
        engine("openai", { vendor: "ACME", total: 100, confidenceScore: 0.85 }),
        engine("docai", { vendor: "OTHER", total: 200, confidenceScore: 0.95 }),
      ];
      const merged = mergeScanResultsMany(results, "inv.pdf", "INVOICE_FINANCIAL");
      // ACME: 0.9 + 0.85 = 1.75 > OTHER: 0.95
      expect(merged.vendor).toBe("ACME");
      expect(merged.total).toBe(100);
      expect(merged.fieldProvenance?.vendor).toBe("gemini");
      expect(merged.fieldProvenance?.total).toBe("gemini");
    });

    it("lets a single high-confidence engine outvote two low-confidence ones", () => {
      const results = [
        engine("gemini", { vendor: "LOW", confidenceScore: 0.2 }),
        engine("openai", { vendor: "LOW", confidenceScore: 0.2 }),
        engine("docai", { vendor: "HIGH", confidenceScore: 0.95 }),
      ];
      const merged = mergeScanResultsMany(results, "inv.pdf", "INVOICE_FINANCIAL");
      // LOW: 0.4 < HIGH: 0.95
      expect(merged.vendor).toBe("HIGH");
      expect(merged.fieldProvenance?.vendor).toBe("docai");
    });

    it("deduplicates line items across all engines", () => {
      const results = [
        engine("gemini", { lineItems: [{ description: "שורה א", quantity: 1, lineTotal: 100 }] }),
        engine("openai", { lineItems: [{ description: "שורה א", quantity: 1, lineTotal: 100 }] }),
        engine("docai", { lineItems: [{ description: "שורה ב", quantity: 2, lineTotal: 50 }] }),
      ];
      const merged = mergeScanResultsMany(results, "inv.pdf", "INVOICE_FINANCIAL");
      expect(merged.lineItems).toHaveLength(2);
      expect(merged.enginesUsed).toEqual(["gemini", "openai", "docai"]);
    });

    it("ignores placeholder vendors and UNKNOWN docTypes when voting", () => {
      const results = [
        engine("gemini", { vendor: "לא צוין", docType: "UNKNOWN", total: 0 }),
        engine("openai", { vendor: "ספק אמיתי", docType: "INVOICE", total: 120, confidenceScore: 0.7 }),
      ];
      const merged = mergeScanResultsMany(results, "inv.pdf", "INVOICE_FINANCIAL");
      expect(merged.vendor).toBe("ספק אמיתי");
      expect(merged.docType).toBe("INVOICE");
      expect(merged.total).toBe(120);
      expect(merged.fieldProvenance?.vendor).toBe("openai");
    });
  });
});
