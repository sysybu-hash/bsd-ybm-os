import { test, expect } from "@playwright/test";
import { primeCookieConsent } from "./helpers";

async function setHebrewLocale(
  context: import("@playwright/test").BrowserContext,
  baseURL: string | undefined,
) {
  const origin = baseURL ?? "http://127.0.0.1:3001";
  await context.addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
}

// MarketingExploreHub is wrapped in DeferUntilVisible (IntersectionObserver, 200px
// rootMargin) — its placeholder div has no id, so "#explore" isn't in the DOM until
// the section scrolls near the viewport. scrollIntoViewIfNeeded() on a not-yet-existing
// locator just hangs forever, so nudge the window scroll incrementally instead.
async function scrollUntilAttached(page: import("@playwright/test").Page, selector: string) {
  const locator = page.locator(selector);
  for (let i = 0; i < 30; i++) {
    if (await locator.count() > 0) break;
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(150);
  }
  await locator.scrollIntoViewIfNeeded();
}

test.describe("marketing preview landing", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    await setHebrewLocale(context, baseURL);
    await primeCookieConsent(page);
    await page.goto("/marketing-preview");
  });

  test("renders cinematic hero and RTL", async ({ page }) => {
    await expect(page.locator(".marketing-cinematic")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    // VideoBackground.tsx deliberately stays static-only (poster, no <video> mount) below
    // the 767px breakpoint and under prefers-reduced-motion — a performance/data-saving
    // choice, not a bug — so only assert the video mounts on non-mobile viewports.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      await expect(page.locator("video.mkt-video-bg")).toBeVisible();
    }
  });

  // The "modules"/"pricing" sections don't sit inline on the scrollable page —
  // they only render inside a detail sheet (role="dialog") opened from a tile
  // in the "#explore" grid (MarketingExploreHub) further down the page. This
  // has been true since the page was first built; it was never wired to a
  // flat scroll layout, so opening the panel first is required, not optional.
  test("modules explore tile opens a panel with the full bento grid", async ({ page }) => {
    await scrollUntilAttached(page, "#explore");
    await page.getByRole("button", { name: "מודולים ויכולות" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.locator(".mkt-glass")).toHaveCount(11);
  });

  test("pricing explore tile opens a panel and its CTA navigates to login", async ({ page }) => {
    await scrollUntilAttached(page, "#explore");
    await page.getByRole("button", { name: "מסלולים ותמחור" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.locator(".mkt-glass")).toHaveCount(4); // 4 pricing tiers

    const ctaButton = dialog.locator(".mkt-glass button").first();
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();
    // First hit of /login in a fresh dev server triggers an on-demand compile —
    // observed up to ~10.4s alone, more under concurrent Fast Refresh rebuilds —
    // so the default 5s assertion timeout is far too tight for that cold path.
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});
