import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBannerIfVisible, primeCookieConsent, tryCredentialsSignIn } from "./helpers";

const MOBILE_PROJECTS = new Set(["mobile-chrome", "mobile-safari"]);

function isMobileProject(projectName: string) {
  return MOBILE_PROJECTS.has(projectName);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe("Site quality", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "bsd-locale",
        value: "he",
        url: "http://localhost:3001",
      },
    ]);
  });

  test("landing page presents the product clearly", async ({ page }) => {
    await primeCookieConsent(page);
    await page.goto("/");

    await expect(page).toHaveTitle(/BSD-YBM/i);
    await expect(page.getByRole("heading", { level: 1, name: /מערכת ההפעלה/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /התחל לעבוד/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gemini Live" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expectNoHorizontalOverflow(page);
  });

  test("login page is usable and quiet", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "כניסה למערכת העבודה" })).toBeVisible();
    await expect(page.getByRole("button", { name: /התחבר עם Google/ })).toBeVisible();
    await expect(page.getByText("חזרה לדף הבית")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile landing has no clipped primary UI", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), "בדיקת מובייל רק בפרויקטי מובייל");

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: /מערכת ההפעלה/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /התחל לעבוד/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("locale cookie switches landing copy to English", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "bsd-locale",
        value: "en",
        url: "http://localhost:3001",
      },
    ]);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Get started/i })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expectNoHorizontalOverflow(page);
  });

  test("has no browser console errors on public pages", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-safari", "Safari WebKit — רעש קונסולה לא יציב ב-CI");
    const errors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() !== "error") return;
      if (text.includes("401 (Unauthorized)")) return;
      if (text.includes("favicon")) return;
      errors.push(text);
    });

    await primeCookieConsent(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });

  test("desktop workspace shows sidebar when signed in", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "רק דסקטופ כרום");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש credentials ב-DB — דלג או הגדר E2E_EMAIL / E2E_PASSWORD");

    await dismissCookieBannerIfVisible(page);
    await expect(page.getByRole("navigation", { name: /יישומים|Apps/i })).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile workspace shows bottom nav when signed in", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), "רק מובייל");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש credentials ב-DB — דלג או הגדר E2E_EMAIL / E2E_PASSWORD");

    await dismissCookieBannerIfVisible(page);
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
    await page.getByRole("button", { name: "פתח שורת פקודה וחיפוש" }).click();
    await expect(page.getByTestId("mobile-omnibar-sheet")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
