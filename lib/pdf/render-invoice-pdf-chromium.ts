import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { launchChromium } from "@/lib/pdf/chromium-launch";
import { buildInvoicePrintHtml } from "@/lib/pdf/invoice-print-html";

/** PDF דרך Chromium — עברית/RTL אמין ב-Vercel ובמקומי */
export async function renderInvoicePdfChromium(
  payload: InvoiceExportPayload,
): Promise<Uint8Array> {
  const html = buildInvoicePrintHtml(payload);
  const browser = await launchChromium();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
