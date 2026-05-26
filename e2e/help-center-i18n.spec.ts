import { expect, test } from "@playwright/test";
import { dismissCookieBannerIfVisible, tryCredentialsSignIn } from "./helpers";

test.describe("Help center i18n & mobile nav", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    await context.addCookies([
      { name: "bsd-locale", value: "he", url: origin },
    ]);
  });

  test("help center shows English guide content when locale is en", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const origin = testInfo.project.use.baseURL?.toString() ?? "http://localhost:3001";
    await context.addCookies([{ name: "bsd-locale", value: "en", url: origin }]);
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");

    await dismissCookieBannerIfVisible(page);
    await page.getByRole("button", { name: /Help|עזרה/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /Help center|מרכז העזרה/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("mobile bottom nav has doc creator and no Meckano in bar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "מובייל");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");

    await dismissCookieBannerIfVisible(page);
    const nav = page.getByTestId("mobile-bottom-nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: /מסמכים|Documents|Document creator/i })).toBeVisible();
    await expect(nav.getByRole("button", { name: /Meckano/i })).toHaveCount(0);
  });
});
