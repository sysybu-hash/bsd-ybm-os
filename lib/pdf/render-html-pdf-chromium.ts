import { existsSync } from "fs";

const isVercel = Boolean(process.env.VERCEL);

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
];

function findLocalChromeExecutable(): string | null {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
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
  return puppeteer.default.launch({ executablePath, headless: true, args: LAUNCH_ARGS });
}

export type RenderHtmlPdfOptions = {
  /** A4 orientation */
  orientation?: "portrait" | "landscape";
};

/**
 * רינדור גנרי של HTML ל-PDF דרך Chromium עם תמיכה מלאה ב-RTL/עברית.
 * משמש למשל לדוחות Meckano / דוחות כלליים. עבור חשבוניות, השתמשו ב-renderInvoicePdfChromium.
 */
export async function renderHtmlPdfChromium(
  html: string,
  options: RenderHtmlPdfOptions = {},
): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const isLandscape = options.orientation === "landscape";
    const width = isLandscape ? 1123 : 794;
    const height = isLandscape ? 794 : 1123;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      landscape: isLandscape,
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      displayHeaderFooter: false,
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
