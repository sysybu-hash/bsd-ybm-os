import { test, expect, type Page } from "@playwright/test";
import { gotoAuthenticatedWidget } from "./helpers";

/**
 * Unified window-scroll contract — the regression "wall".
 *
 * Every widget must obey the SAME scroll model on desktop and mobile:
 *  1. Single scroll owner: at most one scrollable element inside the window body.
 *  2. Fixed chrome: the window header is never scrolled out of the window.
 *  3. Reachable bottom: the scroller can reach its last pixel (nothing hidden
 *     behind the dock / safe-area).
 *
 * See app/globals.css "Unified window scroll model" and
 * components/os/layout/WindowBody.tsx.
 */

// Widgets that open standalone via /?w=<type> without extra seed params.
// NOTE: crmTable/project are intentionally excluded — their readiness gate
// blocks on seeded contacts/projects (npm run seed:test), which would time the
// harness out in unseeded envs. The sticky-chrome pattern they use is already
// covered here by `crm` and `erpArchive`.
const WIDGETS = [
  "dashboard",
  "crm",
  "cashflow",
  "erp",
  "erpArchive",
  "settings",
  "jewishCalendar",
  "helpCenter",
  "financeHub",
  "documentsHub",
  "aiHub",
  "appBuilder",
  "accessibility",
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type ScrollReport = {
  scrollerCount: number;
  headerVisible: boolean;
  bottomReachable: boolean;
};

async function inspectWindowScroll(page: Page): Promise<ScrollReport> {
  return page.evaluate(async () => {
    const shell = document.querySelector<HTMLElement>("[data-widget-shell]");
    if (!shell) return { scrollerCount: -1, headerVisible: false, bottomReachable: false };

    const isScrollable = (el: HTMLElement) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 2;
    };

    // Active scrollers anywhere in the window body.
    const scrollers = Array.from(shell.querySelectorAll<HTMLElement>("*")).filter(isScrollable);

    // Header (WorkspaceWindowChrome) must sit inside the shell, not scrolled away.
    const header = shell.querySelector<HTMLElement>("header");
    let headerVisible = true;
    if (header) {
      const hb = header.getBoundingClientRect();
      const sb = shell.getBoundingClientRect();
      headerVisible = hb.bottom > sb.top + 1 && hb.top < sb.bottom;
    }

    // Bottom reachable: scroll the (single) scroller fully and confirm it lands.
    let bottomReachable = true;
    const scroller = scrollers[0];
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const remaining = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      bottomReachable = remaining <= 2;
    }

    return { scrollerCount: scrollers.length, headerVisible, bottomReachable };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`window scroll contract — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const widget of WIDGETS) {
      test(`${widget} obeys the unified scroll model`, async ({ page }) => {
        const opened = await gotoAuthenticatedWidget(page, widget);
        test.skip(!opened, "requires E2E credentials / seeded data");

        // Let dynamic content + skeletons settle so the scroll chain is final.
        await page
          .locator("[data-widget-shell] .animate-pulse")
          .first()
          .waitFor({ state: "hidden", timeout: 15_000 })
          .catch(() => {});
        await page.waitForTimeout(500);

        const report = await inspectWindowScroll(page);

        expect(report.scrollerCount, "exactly one scroll owner (no nested/double scroll)").toBeLessThanOrEqual(1);
        expect(report.headerVisible, "window header stays fixed in view").toBeTruthy();
        expect(report.bottomReachable, "scroller reaches its bottom (nothing clipped)").toBeTruthy();

        if (process.env.UPDATE_SCROLL_SNAPSHOTS) {
          await expect(page.locator("[data-widget-shell]").first()).toHaveScreenshot(
            `${widget}-${vp.name}.png`,
            { maxDiffPixelRatio: 0.02 },
          );
        }
      });
    }
  });
}
