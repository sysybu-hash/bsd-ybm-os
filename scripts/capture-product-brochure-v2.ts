/**
 * צילום מסכים חדש לדף מוצר v2.
 * שיפורים מול v1:
 *   - waitUntil: "networkidle" (לא רק domcontentloaded)
 *   - המתנה ל-document.fonts.ready
 *   - המתנה לטעינה מלאה של כל ה-images על המסך
 *   - המתנה להיעלמות סקלטונים/animate-pulse
 *   - settle delay של 1500ms
 *   - השבתת animations + scroll-behavior
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

const baseUrl = process.env.PRODUCT_CAPTURE_BASE_URL ?? "http://localhost:3000";
const viewport = { width: 1600, height: 1000 };
const OUT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");

type ShotSpec = {
  file: string;
  url: string;
  requiresAuth: boolean;
  readySelector: string;
  readyTimeoutMs?: number;
  captureSelector?: string;
  /** המתנה נוספת ספציפית — סלקטור שצריך להופיע אחרי readySelector */
  extraReadySelector?: string;
  /** מספר התמונות שצריכות להיטען לפני הצילום (אופציונלי) */
  minImagesLoaded?: number;
};

const PUBLIC_SHOT: ShotSpec = {
  file: "01-marketing-landing.png",
  url: "/",
  requiresAuth: false,
  readySelector: "main h1",
  captureSelector: "main",
};

const AUTH_SHOTS: ShotSpec[] = [
  {
    file: "02-workspace-home.png",
    url: "/",
    requiresAuth: true,
    readySelector: '[data-testid="launcher-zone-quickGrid"]',
    readyTimeoutMs: 60_000,
  },
  {
    file: "03-finance-hub.png",
    url: "/?w=financeHub&tab=overview",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "04-projects-hub.png",
    url: "/?w=projectsHub&tab=board",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "05-crm-table.png",
    url: "/?w=crmTable",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "06-documents-hub.png",
    url: "/?w=documentsHub&tab=archive",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "07-ai-hub.png",
    url: "/?w=aiHub&tab=chat",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
    extraReadySelector: '[role="tablist"]',
    captureSelector: "[data-widget-shell]",
  },
  {
    file: "08-project-board.png",
    url: "/?w=projectBoard",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "09-erp-archive.png",
    url: "/?w=erpArchive",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "10-notebook-lm.png",
    url: "/?w=notebookLM",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "11-meckano-reports.png",
    url: "/?w=meckanoReports",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
  {
    file: "12-google-calendar.png",
    url: "/?w=googleCalendar",
    requiresAuth: true,
    readySelector: "[data-widget-shell]",
  },
];

const DISABLE_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  html { scroll-behavior: auto !important; }
`;

async function injectStableCss(page: Page) {
  await page.addStyleTag({ content: DISABLE_MOTION_CSS }).catch(() => {});
}

async function waitForFonts(page: Page) {
  await page
    .evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    })
    .catch(() => {});
}

async function waitForImages(page: Page, timeoutMs = 15_000) {
  await page
    .evaluate(async (timeout) => {
      const start = Date.now();
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            const tick = () => {
              if (img.complete || Date.now() - start > timeout) resolve();
              else setTimeout(tick, 200);
            };
            setTimeout(tick, 200);
          });
        }),
      );
    }, timeoutMs)
    .catch(() => {});
}

async function waitForLoadingGone(page: Page, timeoutMs = 25_000) {
  const start = Date.now();
  let lastCount = -1;
  let stableTicks = 0;
  while (Date.now() - start < timeoutMs) {
    const stillLoading = await page
      .evaluate(() => {
        const loaders = document.querySelectorAll(
          '.animate-pulse, .animate-spin, [role="status"][aria-busy="true"], [data-loading="true"]',
        );
        // Also count widget-shells whose visible text is only the "…" placeholder
        const shells = Array.from(document.querySelectorAll("[data-widget-shell]"));
        const placeholderShells = shells.filter((s) => {
          const txt = (s.textContent ?? "").trim();
          return txt === "…" || txt.length < 8;
        });
        return loaders.length + placeholderShells.length;
      })
      .catch(() => 0);
    if (stillLoading === 0) {
      stableTicks++;
      if (stableTicks >= 2) return;
    } else {
      stableTicks = 0;
    }
    lastCount = stillLoading;
    await page.waitForTimeout(400);
  }
  console.warn(`  ! loaders still present after ${timeoutMs}ms (last count: ${lastCount})`);
}

async function waitForNetworkQuiet(page: Page, idleMs = 800, timeoutMs = 15_000) {
  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(idleMs);
}

async function captureTarget(page: Page, locator: Locator, dest: string) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await locator.screenshot({
    path: dest,
    type: "png",
    animations: "disabled",
    omitBackground: false,
  });
}

async function runShot(page: Page, shot: ShotSpec) {
  const dest = path.join(OUT_DIR, shot.file);
  console.log(`→ ${shot.file} (${shot.url})`);
  await page.goto(`${baseUrl}${shot.url}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await dismissCookieBannerIfVisible(page);
  if (shot.requiresAuth) {
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);
  }

  await page
    .locator(shot.readySelector)
    .first()
    .waitFor({ state: "visible", timeout: shot.readyTimeoutMs ?? 60_000 });

  if (shot.extraReadySelector) {
    await page
      .locator(shot.extraReadySelector)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
  }

  await injectStableCss(page);
  await waitForNetworkQuiet(page, 600, 15_000);
  await waitForFonts(page);
  await waitForImages(page, 15_000);
  await waitForLoadingGone(page, 25_000);
  // final settle — give animations a chance to land
  await page.waitForTimeout(2000);
  // one more round in case data hydration triggered new spinners
  await waitForLoadingGone(page, 10_000);
  await page.waitForTimeout(800);

  if (shot.captureSelector) {
    const target = page.locator(shot.captureSelector).first();
    await captureTarget(page, target, dest);
  } else {
    await page.screenshot({
      path: dest,
      type: "png",
      fullPage: false,
      animations: "disabled",
    });
  }
  console.log(`✓ ${shot.file}`);
}

function filterShots<T extends { file: string }>(shots: T[]): T[] {
  const only = process.env.PRODUCT_CAPTURE_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!only?.length) return shots;
  return shots.filter((s) => only.includes(s.file));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const authShots = filterShots(AUTH_SHOTS);
  const runPublic = !process.env.PRODUCT_CAPTURE_ONLY || process.env.PRODUCT_CAPTURE_ONLY.includes(PUBLIC_SHOT.file);

  try {
    const health = await fetch(`${baseUrl}/api/auth/session`);
    if (!health.ok) throw new Error(`שרת לא מגיב ב-${baseUrl}`);
  } catch {
    throw new Error(`שרת לא זמין ב-${baseUrl}. הריצו: npm run dev`);
  }

  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];

  try {
    const publicCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      baseURL: baseUrl,
      locale: "he-IL",
      reducedMotion: "reduce",
    });
    const publicPage = await publicCtx.newPage();
    if (runPublic) {
      try {
        await primeCookieConsent(publicPage);
        await runShot(publicPage, PUBLIC_SHOT);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${PUBLIC_SHOT.file}: ${msg}`);
        console.error(`✗ ${PUBLIC_SHOT.file}: ${msg}`);
      }
    }
    await publicCtx.close();

    const authCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      baseURL: baseUrl,
      locale: "he-IL",
      reducedMotion: "reduce",
    });
    const authPage = await authCtx.newPage();
    try {
      await primeCookieConsent(authPage);
      await primeE2eBrowserStorage(authPage);
      if (!(await tryCredentialsSignIn(authPage))) {
        throw new Error("התחברות דמו נכשלה — הריצו: node scripts/seed-test-data.mjs");
      }
      for (const shot of authShots) {
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
      failures.push(`auth: ${msg}`);
    } finally {
      await authCtx.close();
    }
  } finally {
    await browser.close();
  }

  const allFiles = [
    ...(runPublic ? [PUBLIC_SHOT.file] : []),
    ...authShots.map((s) => s.file),
  ];
  const captured = allFiles.filter((f) => fs.existsSync(path.join(OUT_DIR, f))).length;
  console.log(`\nנשמרו ${captured}/${allFiles.length} תמונות ב-${OUT_DIR}`);

  if (failures.length > 0) {
    console.warn("כשלונות:\n  " + failures.join("\n  "));
    process.exitCode = captured === 0 ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
