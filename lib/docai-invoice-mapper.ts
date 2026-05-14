import type { DocAiRawEntity } from "@/lib/ai-extract-docai";
import {
  computePriceAlertPending,
  emptyV5Base,
  type LineItemV5,
  type ScanExtractionV5,
  type ScanModeV5,
} from "@/lib/scan-schema-v5";

function num(s: unknown): number | null {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s === "string" && s.trim()) {
    const v = parseFloat(s.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function str(s: unknown): string | null {
  if (typeof s === "string" && s.trim()) return s.trim();
  return null;
}

function typeMatches(t: string, ...needles: string[]) {
  const x = t.toLowerCase();
  return needles.some((n) => x.includes(n));
}

/**
 * מיפוי ישויות Invoice Parser של Document AI לשורות ERP.
 * תומך בשמות גמישים (line_item, expense_line_item, וכו').
 */
export function mapDocAiEntitiesToInvoiceV5(
  entities: DocAiRawEntity[],
  fullText: string,
  fileName: string,
  scanMode: ScanModeV5,
): ScanExtractionV5 {
  const lineItems: LineItemV5[] = [];
  let vendor = "לא צוין";
  let total: number | null = null;
  let docDate: string | null = null;

  for (const e of entities) {
    const t = String(e.type ?? "");
    const mention = str(e.mentionText) ?? str(e.normalizedValue);
    const p = e.properties ?? {};

    if (typeMatches(t, "supplier", "vendor", "seller", "supplier_name")) {
      if (mention) vendor = mention;
    }
    if (typeMatches(t, "total", "total_amount", "invoice_amount", "net_amount", "amount")) {
      const n = num(mention) ?? num(p.amount) ?? num(p.total);
      if (n != null) total = n;
    }
    if (typeMatches(t, "invoice_date", "receipt_date", "due_date", "date")) {
      if (mention) docDate = mention;
    }

    if (
      typeMatches(
        t,
        "line_item",
        "line-item",
        "item",
        "expense_line_item",
        "invoice_line_item",
      )
    ) {
      const desc =
        str(p.description) ??
        str(p.item_description) ??
        mention ??
        "שורה";
      const qty = num(p.quantity) ?? num(p.qty);
      const unitPrice = num(p.unit_price) ?? num(p.unitprice) ?? num(p.price);
      const lineTotal =
        num(p.amount) ?? num(p.line_amount) ?? num(p.line_total) ?? num(p.total);
      lineItems.push({
        description: desc,
        quantity: qty ?? undefined,
        unitPrice: unitPrice ?? undefined,
        lineTotal: lineTotal ?? undefined,
        sku: str(p.product_code) ?? str(p.sku) ?? undefined,
      });
    }
  }

  const sumLines = lineItems.reduce((s, r) => {
    if (typeof r.lineTotal === "number" && Number.isFinite(r.lineTotal)) return s + r.lineTotal;
    const q = r.quantity;
    const up = r.unitPrice;
    if (typeof q === "number" && typeof up === "number" && q > 0 && up > 0) return s + q * up;
    return s;
  }, 0);
  const inferredTotal = total ?? sumLines;

  const summarySlice = fullText.trim().slice(0, 800);

  return emptyV5Base(fileName, scanMode, {
    documentMetadata: {
      project: null,
      client: null,
      documentDate: docDate,
      drawingRefs: null,
      discipline: "finance",
      sheetIndex: null,
      sourceFileName: fileName,
      scanMode,
    },
    lineItems,
    billOfQuantities: [],
    vendor,
    total: inferredTotal || 0,
    date: docDate,
    docType: "INVOICE",
    summary:
      lineItems.length > 0
        ? `Document AI: ${lineItems.length} שורות חויבו. ${summarySlice ? "מקטע: " + summarySlice : ""}`
        : `Document AI: לא זוהו שורות מחיר — נדרש נירמול נוסף. ${summarySlice}`,
    priceAlertPending: computePriceAlertPending(lineItems),
    enginesUsed: ["document_ai"],
  });
}
