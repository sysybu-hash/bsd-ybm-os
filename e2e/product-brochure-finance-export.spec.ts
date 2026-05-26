import { test, expect } from "@playwright/test";

test.describe("דף מוצר — ייצוא פיננסי", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app?w=dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("כפתורי ייצוא CSV/PDF זמינים בדשבורד", async ({ page }) => {
    const exportCsv = page.getByRole("button", { name: /ייצוא CSV|Export CSV/i });
    const exportPdf = page.getByRole("button", { name: /ייצוא PDF|Export PDF/i });
    await expect(exportCsv.or(page.locator('[aria-label*="export" i]'))).toBeVisible({ timeout: 30_000 });
    await expect(exportPdf).toBeVisible({ timeout: 15_000 });
  });
});
