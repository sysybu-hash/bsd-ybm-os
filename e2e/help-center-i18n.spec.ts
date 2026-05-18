import { expect, test } from "@playwright/test";
import { dismissCookieBannerIfVisible, tryCredentialsSignIn } from "./helpers";

test.describe("Help center i18n & mobile nav", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "bsd-locale", value: "he", url: "http://localhost:3001" },
    ]);
  });

  test("help center shows English guide content when locale is en", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    await context.addCookies([
      { name: "bsd-locale", value: "en", url: "http://localhost:3001" },
    ]);
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");

    await dismissCookieBannerIfVisible(page);
    await page.getByRole("button", { name: /Help|עזרה/i }).first().click();
    await expect(page.getByRole("heading", { name: "Help center" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Quick start", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Welcome to BSD-YBM", { exact: false }).first()).toBeVisible();
  });

  test("mobile bottom nav has doc creator and no Meckano in bar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "מובייל");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");

    await dismissCookieBannerIfVisible(page);
    const nav = page.getByTestId("mobile-bottom-nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: /הפקת מסמכים|Document/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /Meckano/i })).toHaveCount(0);
  });
});
