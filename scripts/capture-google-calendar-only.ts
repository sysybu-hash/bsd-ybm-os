/**
 * צילום בודד של widget יומן Google — תוספת ל-brochure-v2.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  primeCookieConsent,
  primeE2eBrowserStorage,
  tryCredentialsSignIn,
  waitForAuthenticatedWorkspace,
} from "../e2e/helpers";

const baseUrl = process.env.PRODUCT_CAPTURE_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");
const FILE = "12-google-calendar.png";
const URL_PATH = "/?w=googleCalendar";

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  try {
    const r = await fetch(`${baseUrl}/api/auth/session`);
    if (!r.ok) throw new Error(`שרת לא מגיב`);
  } catch {
    throw new Error(`שרת לא זמין ב-${baseUrl}. הריצו: npm run dev`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
      baseURL: baseUrl,
      locale: "he-IL",
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await primeCookieConsent(page);
    await primeE2eBrowserStorage(page);
    if (!(await tryCredentialsSignIn(page))) {
      throw new Error("התחברות דמו נכשלה");
    }
    console.log(`→ ${FILE}`);
    await page.goto(`${baseUrl}${URL_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await dismissCookieBannerIfVisible(page);
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);
    await page.locator("[data-widget-shell]").first().waitFor({ state: "visible", timeout: 60_000 });

    await page.addStyleTag({ content: DISABLE_MOTION_CSS }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready);

    // wait for spinners gone
    const start = Date.now();
    while (Date.now() - start < 25_000) {
      const loading = await page.evaluate(() =>
        document.querySelectorAll(".animate-pulse, .animate-spin").length,
      );
      if (loading === 0) break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(2500);

    const dest = path.join(OUT_DIR, FILE);
    await page.screenshot({ path: dest, type: "png", fullPage: false });
    console.log(`✓ ${dest}`);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
