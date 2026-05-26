/**
 * צילום מסכים אמיתיים מהמערכת לדף המוצר (PDF).
 * דרישות: שרת על localhost:3000, משתמש דמו (node scripts/seed-test-data.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  primeCookieConsent,
  primeE2eBrowserStorage,
  tryCredentialsSignIn,
  waitForAuthenticatedWorkspace,
} from "../e2e/helpers";
import { PRODUCT_BROCHURE_SCREENSHOT_DIR } from "../lib/pdf/product-brochure-screenshots";

const baseUrl = process.env.PRODUCT_CAPTURE_BASE_URL ?? "http://localhost:3000";
const viewport = { width: 1440, height: 900 };

type ShotSpec = {
  file: string;
  url: string;
  requiresAuth: boolean;
  readySelector: string;
  readyTimeoutMs?: number;
  /** אלמנט לצילום מלא; אם חסר — צילום מסך מלא */
  captureSelector?: string;
};

const PUBLIC_SHOT: ShotSpec = {
  file: "marketing-landing.png",
  url: "/",
  requiresAuth: false,
  readySelector: "main h1",
  captureSelector: "main",
};

const AUTH_SHOTS: ShotSpec[] = [
  {
    file: "workspace-home.png",
    url: "/",
    requiresAuth: true,
    readySelector: '[data-testid="launcher-zone-quickGrid"]',
    readyTimeoutMs: 60_000,
  },
  {
    file: "finance-hub.png",
    url: "/?w=financeHub&tab=overview",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    captureSelector: "[data-widget-shell]",
  },
  {
    file: "projects-hub.png",
    url: "/?w=projectsHub&tab=board",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    captureSelector: "[data-widget-shell]",
  },
  {
    file: "crm-table.png",
    url: "/?w=crmTable",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    captureSelector: "[data-widget-shell]",
  },
  {
    file: "documents-hub.png",
    url: "/?w=documentsHub&tab=archive",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    captureSelector: "[data-widget-shell]",
  },
  {
    file: "ai-hub.png",
    url: "/?w=aiHub&tab=chat",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    captureSelector: "[data-widget-shell]",
  },
];

async function captureTarget(page: Page, locator: Locator, dest: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await locator.screenshot({
    path: dest,
    type: "png",
    animations: "disabled",
    omitBackground: false,
  });
}

async function main() {
  fs.mkdirSync(PRODUCT_BROCHURE_SCREENSHOT_DIR, { recursive: true });

  try {
    const health = await fetch(`${baseUrl}/api/auth/session`);
    if (!health.ok) throw new Error(`שרת לא מגיב ב-${baseUrl}`);
  } catch {
    throw new Error(`שרת לא זמין ב-${baseUrl}. הריצו: PAYPAL_ENV=sandbox npm run dev`);
  }

  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];

  async function runShot(page: Page, shot: ShotSpec): Promise<void> {
    const dest = path.join(PRODUCT_BROCHURE_SCREENSHOT_DIR, shot.file);
    await page.goto(`${baseUrl}${shot.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await dismissCookieBannerIfVisible(page);
    if (shot.requiresAuth) {
      await waitForAuthenticatedWorkspace(page);
      await dismissWorkspaceOverlays(page);
    }
    await page
      .locator(shot.readySelector)
      .first()
      .waitFor({ state: "visible", timeout: shot.readyTimeoutMs ?? 40_000 });

    if (shot.captureSelector) {
      const target = page.locator(shot.captureSelector).first();
      await captureTarget(page, target, dest);
    } else {
      await page.waitForTimeout(400);
      await page.screenshot({
        path: dest,
        type: "png",
        fullPage: false,
        animations: "disabled",
      });
    }
    console.log(`✓ ${shot.file}`);
  }

  try {
    const publicCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      baseURL: baseUrl,
    });
    const publicPage = await publicCtx.newPage();
    try {
      await primeCookieConsent(publicPage);
      await runShot(publicPage, PUBLIC_SHOT);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${PUBLIC_SHOT.file}: ${msg}`);
      console.error(`✗ ${PUBLIC_SHOT.file}: ${msg}`);
    } finally {
      await publicCtx.close();
    }

    const authCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      baseURL: baseUrl,
    });
    const authPage = await authCtx.newPage();
    try {
      await primeCookieConsent(authPage);
      await primeE2eBrowserStorage(authPage);
      if (!(await tryCredentialsSignIn(authPage))) {
        throw new Error("התחברות דמו נכשלה — הריצו: node scripts/seed-test-data.mjs");
      }
      for (const shot of AUTH_SHOTS) {
        try {
          await runShot(authPage, shot);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${shot.file}: ${msg}`);
          console.error(`✗ ${shot.file}: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ אימות: ${msg}`);
      for (const shot of AUTH_SHOTS) {
        if (!fs.existsSync(path.join(PRODUCT_BROCHURE_SCREENSHOT_DIR, shot.file))) {
          failures.push(`${shot.file}: ${msg}`);
        }
      }
    } finally {
      await authCtx.close();
    }
  } finally {
    await browser.close();
  }

  const total = 1 + AUTH_SHOTS.length;
  const captured = [PUBLIC_SHOT.file, ...AUTH_SHOTS.map((s) => s.file)].filter((f) =>
    fs.existsSync(path.join(PRODUCT_BROCHURE_SCREENSHOT_DIR, f)),
  ).length;
  console.log(`\nנשמרו ${captured}/${total} תמונות ב-${PRODUCT_BROCHURE_SCREENSHOT_DIR}`);

  if (failures.length > 0) {
    console.warn("כשלונות:", failures.join("\n"));
    process.exitCode = captured === 0 ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
