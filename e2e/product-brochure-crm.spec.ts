import { test, expect } from "@playwright/test";

test.describe("דף מוצר — CRM", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app?w=crmTable");
    await page.waitForLoadState("domcontentloaded");
  });

  test("ייצוא CSV וחיפוש חכם בכותרת CRM", async ({ page }) => {
    await expect(page.getByRole("button", { name: /ייצוא CSV|Export CSV/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/חיפוש חכם|Smart search/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ייבוא מ-Google|Import from Google/i })).toBeVisible();
  });
});
