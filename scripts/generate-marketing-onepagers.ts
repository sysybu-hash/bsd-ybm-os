/**
 * One-pagers שיווקיים — 2 פורמטים, כל אחד כ-PDF וכ-PNG.
 *   • portrait → A4 לאורך, להדפסה ולשיתוף PDF
 *   • mobile   → 9:16, לסטטוס WhatsApp / Instagram Story / שיתוף במובייל
 */
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { buildMarketingOnePagerHtml } from "../lib/pdf/marketing-onepager-html";

const outDir = path.join(process.cwd(), "docs");

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

type Variant = {
  name: "portrait" | "mobile";
  // viewport for crisp PNG render
  pxWidth: number;
  pxHeight: number;
  // PDF page size (mm)
  pdfWidthMm: number;
  pdfHeightMm: number;
};

const VARIANTS: Variant[] = [
  // A4 portrait: 210x297mm @ 96dpi ≈ 794x1123. נריץ ב-deviceScaleFactor=2.
  { name: "portrait", pxWidth: 794, pxHeight: 1123, pdfWidthMm: 210, pdfHeightMm: 297 },
  // Mobile 9:16: יעד 1080×1920 לסטטוס/סטורי. עיצוב CSS ב-108×192mm (proportional).
  { name: "mobile", pxWidth: 540, pxHeight: 960, pdfWidthMm: 108, pdfHeightMm: 192 },
];

async function renderVariant(v: Variant) {
  const html = buildMarketingOnePagerHtml(v.name);
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.default.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: v.pxWidth,
      height: v.pxHeight,
      deviceScaleFactor: 2,
    });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 400));

    // PNG (full clip = exact page)
    const pngPath = path.join(outDir, `BSD-YBM-OS-one-pager-${v.name}.png`);
    await page.screenshot({
      path: pngPath,
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width: v.pxWidth, height: v.pxHeight },
    });

    // PDF
    const pdfPath = path.join(outDir, `BSD-YBM-OS-one-pager-${v.name}.pdf`);
    const pdfBytes = await page.pdf({
      printBackground: true,
      width: `${v.pdfWidthMm}mm`,
      height: `${v.pdfHeightMm}mm`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: "1",
    });
    fs.writeFileSync(pdfPath, pdfBytes);

    const pngStat = fs.statSync(pngPath);
    const pdfStat = fs.statSync(pdfPath);
    console.log(
      `✓ ${v.name.padEnd(8)} · PNG ${(pngStat.size / 1024).toFixed(0)}KB · PDF ${(pdfStat.size / 1024).toFixed(0)}KB`,
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const v of VARIANTS) {
    try {
      await renderVariant(v);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${v.name}: ${msg}`);
    }
  }
  console.log(`\nכל הקבצים ב-${outDir}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("נכשל:", msg);
  process.exitCode = 1;
});
