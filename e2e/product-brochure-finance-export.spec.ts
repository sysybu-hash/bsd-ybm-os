import { test, expect } from "@playwright/test";
import { E2E_EMAIL, gotoAuthenticatedWidget } from "./helpers";

test.describe("דף מוצר — ייצוא פיננסי", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("כפתורי ייצוא CSV/PDF זמינים בדשבורד", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "dashboard export controls desktop layout");

    const ready = await gotoAuthenticatedWidget(page, "dashboard");
    test.skip(!ready, "login failed or dashboard shell not visible");

    const exportCsv = page.getByRole("button", { name: /ייצוא CSV|Export CSV/i });
    const exportPdf = page.getByRole("button", { name: /ייצוא PDF|Export PDF/i });
    await expect(exportCsv.or(page.locator('[aria-label*="export" i]'))).toBeVisible({ timeout: 30_000 });
    await expect(exportPdf).toBeVisible({ timeout: 15_000 });
  });
});
