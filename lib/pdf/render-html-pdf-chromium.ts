import { existsSync } from "fs";
import { env } from "@/lib/env";

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
  return puppeteer.default.launch({ executablePath, headless: true, args: LAUNCH_ARGS });
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
  const browser = await launchBrowser();
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
