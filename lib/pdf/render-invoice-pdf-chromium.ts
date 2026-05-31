import { existsSync } from "fs";
import { env } from "@/lib/env";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { buildInvoicePrintHtml } from "@/lib/pdf/invoice-print-html";

const isVercel = Boolean(env.VERCEL);

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
];

function findLocalChromeExecutable(): string | null {
  const candidates = [
    env.PUPPETEER_EXECUTABLE_PATH,
    env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");

  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.default.launch({
      args: [...chromium.args, ...LAUNCH_ARGS],
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = findLocalChromeExecutable();
  if (!executablePath) {
    throw new Error(
      "לא נמצא Chrome לייצוא PDF. התקינו Google Chrome או הגדירו PUPPETEER_EXECUTABLE_PATH.",
    );
  }

  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: LAUNCH_ARGS,
  });
}

/** PDF דרך Chromium — עברית/RTL אמין ב-Vercel ובמקומי */
export async function renderInvoicePdfChromium(
  payload: InvoiceExportPayload,
): Promise<Uint8Array> {
  const html = buildInvoicePrintHtml(payload);
  const browser = await launchBrowser();

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
