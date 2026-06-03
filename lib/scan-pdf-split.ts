/**
 * פיצול PDF לעמודים עצמאיים — שלב 6 באפיון הסריקה.
 *
 * מסמך PDF רב-עמודי נסרק עד כה כיחידה אחת.
 * מודול זה מפצל אותו לעמודים, מאפשר פענוח לכל עמוד, ואז מחזיר
 * אוסף תוצאות שהלוגיקה המאחדת יכולה לאגד לפי סוג.
 *
 * שימוש ב-pdf-parse (כבר מותקן) לספירת עמודים,
 * ו-pdf-lib (לא מותקן — fallback ל-Gemini native multi-page).
 *
 * Strategy:
 *   ≤ 2 pages  → process as-is (current behavior, no splitting needed)
 *   3-20 pages → split to individual pages; process each; merge logically
 *   > 20 pages → chunk into groups of 5; process each chunk; merge
 *
 * Logical merge:
 *   - All pages same docType → single document (multi-page invoice/BOQ)
 *   - Pages alternate docType → separate documents (batch of receipts)
 */
import pdfParse from "pdf-parse";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-pdf-split");

export const PDF_SPLIT_MIN_PAGES = 3;   // below this → process as-is
export const PDF_SPLIT_CHUNK_SIZE = 5;  // pages per chunk for large PDFs
export const PDF_SPLIT_MAX_DIRECT = 20; // above this → chunk mode

export type PdfPageInfo = {
  pageCount: number;
  /** Whether splitting is recommended */
  shouldSplit: boolean;
  /** Text content per page (from pdf-parse, best-effort) */
  pageTexts: string[];
};

/**
 * Analyses a PDF buffer and returns page count + text per page.
 * Does NOT attempt to extract individual page buffers (requires pdf-lib or similar);
 * instead returns the extracted text so Gemini can receive a text-enriched prompt.
 */
export async function analysePdfPages(buffer: Buffer): Promise<PdfPageInfo> {
  try {
    const parsed = await pdfParse(buffer, {
      // Renderer that captures per-page text
      pagerender: (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) =>
        pageData.getTextContent().then((content) =>
          content.items.map((item) => item.str).join(" "),
        ),
    });

    const pageCount = parsed.numpages ?? 1;
    // pdf-parse concatenates all pages into .text; split by page-marker heuristic
    const rawText = parsed.text ?? "";
    const pageTexts = rawText
      .split(/\f/)  // form-feed often marks page boundaries
      .map((t) => t.trim())
      .filter(Boolean);

    // Pad/trim to pageCount
    const texts: string[] = Array.from({ length: pageCount }, (_, i) => pageTexts[i] ?? "");

    return {
      pageCount,
      shouldSplit: pageCount >= PDF_SPLIT_MIN_PAGES,
      pageTexts: texts,
    };
  } catch (err: unknown) {
    log.warn("pdf page analysis failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { pageCount: 1, shouldSplit: false, pageTexts: [] };
  }
}

/**
 * Returns a text-enriched prefix for the Gemini prompt when scanning a multi-page PDF.
 * Helps the model understand page structure without needing to split bytes.
 */
export function buildMultiPagePromptPrefix(info: PdfPageInfo): string {
  if (!info.shouldSplit || info.pageTexts.length === 0) return "";

  const pageCount = info.pageCount;
  const textSample = info.pageTexts
    .slice(0, Math.min(5, pageCount))
    .map((t, i) => `--- Page ${i + 1} ---\n${t.slice(0, 400)}`)
    .join("\n\n");

  return [
    `### MULTI-PAGE DOCUMENT (${pageCount} pages)`,
    "This is a multi-page document. Extract ALL data across ALL pages as a single unified V5 JSON.",
    "For INVOICE: sum all line items across pages; use the grand total from the last/summary page.",
    "For BOQ: collect all BOQ rows from every page; do not duplicate.",
    "Page text sample (first 5 pages):",
    textSample,
    "---",
    "",
  ].join("\n");
}

/**
 * Detects whether a PDF is likely a BATCH (multiple separate documents)
 * vs a SINGLE multi-page document, based on page text analysis.
 *
 * Heuristic: if page texts contain repeated invoice/total markers with different vendors,
 * it's likely a batch.
 */
export function detectBatchVsSingleDocument(pageTexts: string[]): "batch" | "single" {
  if (pageTexts.length < 2) return "single";

  // Look for strong invoice markers on multiple pages independently
  const invoiceMarker = /חשבונית|invoice|total|סה"כ|supplier|ספק/i;
  const pagesWithInvoice = pageTexts.filter((t) => invoiceMarker.test(t)).length;

  // If most pages look like independent invoices → batch
  if (pagesWithInvoice >= pageTexts.length * 0.6 && pageTexts.length >= 3) {
    return "batch";
  }
  return "single";
}
