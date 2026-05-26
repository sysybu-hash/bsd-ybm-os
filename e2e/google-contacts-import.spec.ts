import { test, expect } from "@playwright/test";

test.describe("Google Contacts import", () => {
  test("ממשק ייבוא Google ב-CRM", async ({ page }) => {
    test.skip(
      !process.env.E2E_GOOGLE_CONTACTS,
      "דורש E2E_GOOGLE_CONTACTS=1 ו-OAuth בדיקות",
    );
    await page.goto("/app?w=crmTable");
    await page.getByRole("button", { name: /ייבוא מ-Google|Import from Google/i }).click();
    await expect(page).toHaveURL(/google_contacts|accounts\.google/, { timeout: 60_000 });
  });

  test("כפתור ייבוא Google גלוי ללא OAuth", async ({ page }) => {
    await page.goto("/app?w=crmTable");
    await expect(
      page.getByRole("button", { name: /ייבוא מ-Google|Import from Google/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
