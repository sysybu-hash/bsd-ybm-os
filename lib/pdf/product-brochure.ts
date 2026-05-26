import { createLogger } from "@/lib/logger";
import { buildProductBrochureHtml } from "@/lib/pdf/product-brochure-html";
import { renderProductBrochurePdfMake } from "@/lib/pdf/product-brochure-pdfmake";
import { renderHtmlPdfChromium } from "@/lib/pdf/render-html-pdf-chromium";

const log = createLogger("product-brochure-pdf");

export type ProductBrochureRenderResult = {
  bytes: Uint8Array;
  engine: "chromium" | "pdfmake";
};

/**
 * דף מוצר לשיווק — Chromium (RTL מלא + לוגו) עם גיבוי pdfmake.
 */
export async function renderProductBrochurePdf(): Promise<ProductBrochureRenderResult> {
  try {
    const html = buildProductBrochureHtml();
    const bytes = await renderHtmlPdfChromium(html, {
      orientation: "portrait",
    });
    log.info("product brochure rendered via chromium", { bytes: bytes.byteLength });
    return { bytes, engine: "chromium" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("chromium pdf failed, falling back to pdfmake", { error: msg });
    const bytes = await renderProductBrochurePdfMake();
    return { bytes, engine: "pdfmake" };
  }
}
