import { expect, test, type Page } from "@playwright/test";

const MOBILE_PROJECTS = new Set(["mobile-chrome", "mobile-safari"]);

function isMobileProject(projectName: string) {
  return MOBILE_PROJECTS.has(projectName);
}

const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo!2026";

/** ניסיון התחברות עם Credentials (משתמש קיים ב-DB מקומי / CI). */
async function tryCredentialsSignIn(page: Page): Promise<boolean> {
  try {
    await page.goto("/login");
    const ok = await page.evaluate(
      async ({ email, password }) => {
        const csrf = await fetch(`${window.location.origin}/api/auth/csrf`).then((r) => r.json()) as {
          csrfToken: string;
        };
        const body = new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email,
          password,
          callbackUrl: `${window.location.origin}/`,
          json: "true",
        });
        const res = await fetch(`${window.location.origin}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        return res.ok;
      },
      { email: E2E_EMAIL, password: E2E_PASSWORD },
    );
    if (!ok) return false;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    return true;
  } catch {
    return false;
  }
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
    await page.goto("/");

    await expect(page).toHaveTitle(/BSD-YBM/i);
    await expect(page.getByRole("heading", { level: 1, name: /מערכת ההפעלה/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /התחל לעבוד עכשיו/ })).toBeVisible();
    await expect(page.getByText("הדור הבא של ניהול תשתיות ובנייה")).toBeVisible();
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
    await expect(page.getByRole("button", { name: /התחל לעבוד עכשיו/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("has no browser console errors on public pages", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("401 (Unauthorized)")) {
        errors.push(msg.text());
      }
    });

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

    await expect(page.getByRole("navigation", { name: "ניווט סביבת עבודה" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile workspace shows bottom nav when signed in", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo.project.name), "רק מובייל");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש credentials ב-DB — דלג או הגדר E2E_EMAIL / E2E_PASSWORD");

    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
    await page.getByRole("button", { name: "פתח שורת פקודה וחיפוש" }).click();
    await expect(page.getByTestId("mobile-omnibar-sheet")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
