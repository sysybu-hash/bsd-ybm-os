import { validateScanV5, REVIEW_CONFIDENCE_THRESHOLD } from "@/lib/scan-validate";
import { emptyV5Base, type ScanExtractionV5 } from "@/lib/scan-schema-v5";

const invoice = (partial: Partial<ScanExtractionV5>): ScanExtractionV5 =>
  emptyV5Base("inv.pdf", "INVOICE_FINANCIAL", partial);

describe("validateScanV5 — human-review routing (P0.4)", () => {
  it("flags a clean invoice as not requiring review", () => {
    const v5 = invoice({
      vendor: "ספק אמיתי בע״מ",
      total: 100,
      date: "2026-03-01",
      confidenceScore: 0.95,
      lineItems: [{ description: "פריט", quantity: 1, lineTotal: 100 }],
    });
    const result = validateScanV5(v5);
    expect(result.requiresHumanReview).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.effectiveConfidence).toBeGreaterThanOrEqual(REVIEW_CONFIDENCE_THRESHOLD);
  });

  it("requires review when the model self-reports low confidence", () => {
    const v5 = invoice({
      vendor: "ספק אמיתי בע״מ",
      total: 100,
      date: "2026-03-01",
      confidenceScore: 0.4,
      lineItems: [{ description: "פריט", quantity: 1, lineTotal: 100 }],
    });
    const result = validateScanV5(v5);
    expect(result.effectiveConfidence).toBeLessThan(REVIEW_CONFIDENCE_THRESHOLD);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("requires review and is not ok when a hard error is present (missing total)", () => {
    const v5 = invoice({ vendor: "ספק", total: 0, confidenceScore: 0.95 });
    const result = validateScanV5(v5);
    expect(result.ok).toBe(false);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.fieldConfidence.total).toBeLessThan(0.5);
  });

  it("records per-field confidence for flagged fields only", () => {
    const v5 = invoice({
      vendor: "ספק",
      total: 100,
      taxId: "123456789", // fails Israeli checksum → warning
      date: "2026-03-01",
      confidenceScore: 0.95,
      lineItems: [{ description: "פריט", quantity: 1, lineTotal: 100 }],
    });
    const result = validateScanV5(v5);
    expect(result.fieldConfidence.taxId).toBeDefined();
    expect(result.fieldConfidence.taxId).toBeLessThan(0.85);
    expect(result.fieldConfidence.vendor).toBeUndefined();
  });

  it("blends model confidence with validation penalty (takes the lower)", () => {
    // High model confidence but a warning lowers validation confidence; effective = min.
    const v5 = invoice({
      vendor: "לא צוין", // placeholder → vendor_missing warning
      total: 100,
      confidenceScore: 0.99,
      lineItems: [{ description: "פריט", quantity: 1, lineTotal: 100 }],
    });
    const result = validateScanV5(v5);
    expect(result.effectiveConfidence).toBeLessThanOrEqual(result.confidence);
    expect(result.effectiveConfidence).toBeLessThan(0.99);
  });
});
