import { expect, test } from "@playwright/test";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  primeCookieConsent,
  tryCredentialsSignIn,
  waitForAuthenticatedWorkspace,
} from "./helpers";

const MOBILE_PROJECTS = new Set(["mobile-chrome", "mobile-safari"]);

const LANDING_H1 = /מערכת אחת לניהול העסק|One system to run your business/i;
const LANDING_CTA = /פתיחת חשבון|Create account/i;
const AUTH_HERO = /ברוכים הבאים|Welcome/i;
const AUTH_TAB_SIGN_IN = /כניסה|Sign in/i;
const AUTH_BACK_HOME = /חזרה לדף הבית|Back to home/i;
const OMNIBAR_OPEN = /פתח שורת פקודה|Open command bar/i;

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

async function setLocaleCookie(context: import("@playwright/test").BrowserContext, baseURL: string, locale: string) {
  await context.addCookies([
    {
      name: "bsd-locale",
      value: locale,
      url: baseURL,
    },
  ]);
}

test.describe("Site quality", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3330";
    await setLocaleCookie(context, origin, "he");
  });

  test("landing page presents the product clearly", async ({ page }) => {
    await primeCookieConsent(page);
    await page.goto("/");

    await expect(page).toHaveTitle(/BSD-YBM/i);
    await expect(page.getByRole("heading", { level: 1, name: LANDING_H1 })).toBeVisible();
    await expect(page.getByRole("link", { name: LANDING_CTA })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expectNoHorizontalOverflow(page);
  });

  test("login page is usable and quiet", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: AUTH_HERO })).toBeVisible();
    await expect(page.getByRole("tab", { name: AUTH_TAB_SIGN_IN })).toBeVisible();
    await expect(page.getByRole("button", { name: /התחבר עם Google|Google/i })).toBeVisible();
    await expect(page.getByText(AUTH_BACK_HOME)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile landing has no clipped primary UI", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), "בדיקת מובייל רק בפרויקטי מובייל");

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: LANDING_H1 })).toBeVisible();
    await expect(page.getByRole("link", { name: LANDING_CTA })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("locale cookie switches platform copy to English", async ({ page, context, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3330";
    await setLocaleCookie(context, origin, "en");
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();
    await expect(page.locator('[lang="en"]')).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1, name: LANDING_H1 })).toBeVisible();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: AUTH_HERO })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("desktop workspace shows sidebar when signed in", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "רק דסקטופ כרום");
    await page.setViewportSize({ width: 1280, height: 900 });
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש credentials ב-DB — דלג או הגדר E2E_EMAIL / E2E_PASSWORD");

    await dismissCookieBannerIfVisible(page);
    await dismissWorkspaceOverlays(page);
    await waitForAuthenticatedWorkspace(page);
    await expect(
      page.getByRole("complementary", { name: /Workspace navigation|ניווט סביבת עבודה/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile workspace shows bottom nav when signed in", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), "רק מובייל");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש credentials ב-DB — דלג או הגדר E2E_EMAIL / E2E_PASSWORD");

    await dismissCookieBannerIfVisible(page);
    await dismissWorkspaceOverlays(page);
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
    await page.getByRole("button", { name: OMNIBAR_OPEN }).click();
    await expect(page.getByTestId("mobile-omnibar-sheet")).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
  });
});
