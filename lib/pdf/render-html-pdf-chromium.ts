import { PDFArray, PDFName, PDFString, type PDFPage } from "pdf-lib";

import { launchChromium } from "@/lib/pdf/chromium-launch";

function addUriLink(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  uri: string,
): void {
  if (!(rect.width > 2) || !(rect.height > 2) || !uri) return;
  const context = page.doc.context;
  const annot = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri) },
    }),
  );
  const existing = page.node.lookup(PDFName.of("Annots"));
  if (existing instanceof PDFArray) {
    existing.push(annot);
    return;
  }
  page.node.set(PDFName.of("Annots"), context.obj([annot]));
}

export type RenderHtmlPdfOptions = {
  /** A4 orientation */
  orientation?: "portrait" | "landscape";
  margin?: { top: string; right: string; bottom: string; left: string };
  waitForImages?: boolean;
  timeoutMs?: number;
  /** טקסט קטן בתחתית כל עמוד (עברית נתמכת ב-Arial/Segoe) */
  footer?: string;
};

/**
 * רינדור גנרי של HTML ל-PDF דרך Chromium עם תמיכה מלאה ב-RTL/עברית.
 * משמש למשל לדוחות Meckano / דוחות כלליים. עבור חשבוניות, השתמשו ב-renderInvoicePdfChromium.
 */
export async function renderHtmlPdfChromium(
  html: string,
  options: RenderHtmlPdfOptions = {},
): Promise<Uint8Array> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const isLandscape = options.orientation === "landscape";
    const width = isLandscape ? 1123 : 794;
    const height = isLandscape ? 794 : 1123;
    const timeout = options.timeoutMs ?? 45_000;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout });
    await page.evaluate(() => document.fonts.ready);
    if (options.waitForImages) {
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                }),
          ),
        );
      });
    }

    const footer = options.footer?.trim();
    const pdf = await page.pdf({
      format: "A4",
      landscape: isLandscape,
      printBackground: true,
      margin: options.margin ?? { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      displayHeaderFooter: Boolean(footer),
      headerTemplate: footer ? "<div></div>" : undefined,
      footerTemplate: footer
        ? `<div dir="rtl" style="box-sizing:border-box;font-size:8px;width:100%;max-width:100%;padding:0 22mm;text-align:center;color:#78716c;font-family:'Segoe UI',Arial,sans-serif;overflow:hidden;white-space:nowrap;">${footer.replace(/</g, "")} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`
        : undefined,
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Chromium's page.pdf() stores RTL Hebrew backwards. Screenshot each section
 * and embed the pixels — the booklet stays readable.
 */
export async function renderHtmlSectionsPdf(
  html: string,
  options: RenderHtmlPdfOptions = {},
): Promise<Uint8Array> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const timeout = options.timeoutMs ?? 45_000;
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.emulateMediaType("screen");
    await page.setContent(html, { waitUntil: "load", timeout });
    await page.evaluate(() => document.fonts.ready);
    if (options.waitForImages) {
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                }),
          ),
        );
      });
    }
    await page.addStyleTag({
      content: `
        html, body { width: 794px; height: auto; margin: 0; padding: 0 !important; background: #fff; overflow: visible; }
        .cover, .plate {
          width: 794px;
          height: 1123px !important;
          min-height: 1123px !important;
          max-height: 1123px !important;
          overflow: hidden !important;
          break-before: auto !important;
          page-break-before: auto !important;
          box-sizing: border-box;
        }
      `,
    });
    const handles = await page.$$(".cover, .plate");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const a4w = 595.28;
    const a4h = 841.89;
    const inset = 0;
    for (const handle of handles) {
      // Clip against the page viewport reused the first sheet four times.
      // Screenshot the section node itself — each cover/plate is one page.
      await handle.evaluate((el) => {
        el.scrollIntoView({ block: "start" });
      });
      const png = await handle.screenshot({ type: "png" });
      const links = await handle.evaluate((el) => {
        const root = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll("a.brand-link")).map((node) => {
          const r = node.getBoundingClientRect();
          return {
            href: node.getAttribute("href") ?? "",
            x: r.left - root.left,
            y: r.top - root.top,
            width: r.width,
            height: r.height,
          };
        });
      });
      const image = await doc.embedPng(png);
      const sheet = doc.addPage([a4w, a4h]);
      const scale = Math.min((a4w - inset * 2) / image.width, (a4h - inset * 2) / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      const originX = (a4w - w) / 2;
      const originY = (a4h - h) / 2;
      sheet.drawImage(image, {
        x: originX,
        y: originY,
        width: w,
        height: h,
      });
      for (const link of links) {
        addUriLink(
          sheet,
          {
            x: originX + (link.x / 794) * w,
            y: originY + (1 - (link.y + link.height) / 1123) * h,
            width: (link.width / 794) * w,
            height: (link.height / 1123) * h,
          },
          link.href,
        );
      }
    }
    if (doc.getPageCount() === 0) {
      throw new Error("לא נוצרו עמודי חוברת");
    }
    return await doc.save();
  } finally {
    await browser.close();
  }
}
