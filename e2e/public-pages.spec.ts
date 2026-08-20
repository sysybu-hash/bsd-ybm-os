import { test, expect } from "@playwright/test";

/**
 * Phase-1 marketing-chrome smoke: every standalone public page must render the
 * shared PublicNavbar (with top-level links) and the MarketingFooter.
 */
const PUBLIC_ROUTES = ["/pricing", "/solutions", "/contact", "/blog", "/about"] as const;

const NAV_HREFS = ["/pricing", "/solutions", "/blog", "/contact", "/about"] as const;

for (const route of PUBLIC_ROUTES) {
  test(`public page ${route} renders shared chrome`, async ({ page }) => {
    await page.goto(route);

    // Navbar with all top-level links
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    for (const href of NAV_HREFS) {
      await expect(header.locator(`a[href="${href}"]`).first()).toBeAttached();
    }

    // Footer present with legal links
    const footer = page.locator("footer").last();
    await expect(footer).toBeAttached();
    await expect(footer.locator('a[href="/privacy"]').first()).toBeAttached();
  });
}

test("homepage navbar exposes the new top-level links", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  for (const href of ["/pricing", "/solutions", "/blog", "/contact"]) {
    await expect(header.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
});
