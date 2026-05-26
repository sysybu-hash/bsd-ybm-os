/**
 * הפקת PDF v2 — תוכן ועיצוב חדשים, צילומי מסך מ-assets/product-brochure-v2/.
 * משתמש ב-Chromium ישירות כדי לאפשר footerTemplate עם מספור עמודים.
 */
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { buildProductBrochureV2Html } from "../lib/pdf/product-brochure-v2-html";

const outDir = path.join(process.cwd(), "docs");
const outFile = path.join(outDir, "BSD-YBM-OS-דף-מוצר-v2.pdf");

const FOOTER_TEMPLATE = `
<div style="
  width: 100%;
  font-size: 8pt;
  font-family: 'Heebo', 'Segoe UI', Arial, sans-serif;
  color: #94a3b8;
  padding: 0 14mm;
  direction: rtl;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #e2e8f0;
  padding-top: 4mm;
">
  <span style="font-weight: 700; color: #4338ca;">BSD-YBM OS</span>
  <span style="color: #64748b;">יוחנן בוקשפן · 052-564-0021 · bsd-ybm.co.il</span>
  <span style="font-variant-numeric: tabular-nums;">
    עמוד <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
</div>
`;

const HEADER_TEMPLATE = `<div style="display:none"></div>`;

function findChrome(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error("לא נמצא Chrome");
}

async function renderWithFooter(html: string): Promise<Uint8Array> {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.default.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // עמוד אחד = עמוד אחד. ה-footer ייכנס באזור התחתון של ה-margin.
      margin: { top: "0mm", right: "0mm", bottom: "16mm", left: "0mm" },
      displayHeaderFooter: true,
      headerTemplate: HEADER_TEMPLATE,
      footerTemplate: FOOTER_TEMPLATE,
      preferCSSPageSize: false,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

async function main() {
  const html = buildProductBrochureV2Html();
  const bytes = await renderWithFooter(html);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = `${outFile}.tmp`;
  fs.writeFileSync(tmp, bytes);
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.renameSync(tmp, outFile);
  } catch {
    const alt = path.join(outDir, "BSD-YBM-OS-דף-מוצר-v2-חדש.pdf");
    fs.copyFileSync(tmp, alt);
    fs.unlinkSync(tmp);
    console.warn(`קובץ היעד פתוח — נשמר ב-${alt}`);
    console.log(`נוצר: ${alt} (${bytes.byteLength.toLocaleString("he-IL")} bytes)`);
    return;
  }
  console.log(`נוצר: ${outFile} (${bytes.byteLength.toLocaleString("he-IL")} bytes)`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("נכשל:", msg);
  process.exitCode = 1;
});
