import { test, expect } from "@playwright/test";

test.describe("דף מוצר — ארכיון bulk", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app?w=erpArchive");
    await page.waitForLoadState("domcontentloaded");
  });

  test("מצב בחירה מרובה וייצוא ZIP", async ({ page }) => {
    const selectBtn = page.getByRole("button", {
      name: /בחירה מרובה|Multi-select|Множественный/i,
    });
    await expect(selectBtn).toBeVisible({ timeout: 30_000 });
    await selectBtn.click();
    await expect(
      page.getByRole("button", { name: /ייצוא נבחרים|Export selected/i }),
    ).toBeVisible();
  });
});
