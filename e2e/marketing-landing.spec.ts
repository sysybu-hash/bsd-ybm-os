import { test, expect } from "@playwright/test";

async function setHebrewLocale(
  context: import("@playwright/test").BrowserContext,
  baseURL: string | undefined,
) {
  const origin = baseURL ?? "http://127.0.0.1:3001";
  await context.addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
}

test.describe("marketing preview landing", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    await setHebrewLocale(context, baseURL);
    await page.goto("/marketing-preview");
  });

  test("renders cinematic hero and RTL", async ({ page }) => {
    await expect(page.locator(".marketing-cinematic")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("video.mkt-video-bg")).toBeVisible();
  });

  test("shows preview banner and bento modules", async ({ page }) => {
    await expect(page.getByRole("status")).toBeVisible();
    const bentoCards = page.locator("#modules .mkt-glass");
    await expect(bentoCards).toHaveCount(10);
  });

  test("pricing and CTA navigate to login", async ({ page }) => {
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    await expect(page.locator("#pricing")).toBeVisible();
    await page.getByRole("button", { name: /להתחיל עכשיו|Start now/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });
});
