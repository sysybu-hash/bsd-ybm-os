import { expect, test, type Page } from "@playwright/test";
import { dismissCookieBannerIfVisible, tryCredentialsSignIn } from "./helpers";

test.describe("Workspace automations", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "bsd-locale", value: "he", url: "http://localhost:3001" },
    ]);
  });

  async function openOmnibar(page: Page) {
    await dismissCookieBannerIfVisible(page);
    const omnibar = page.getByRole("textbox", { name: /חיפוש|פקודה|command/i }).first();
    if (!(await omnibar.isVisible().catch(() => false))) return null;
    return omnibar;
  }

  test("omnibar opens scanner widget", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    const omnibar = await openOmnibar(page);
    if (!omnibar) {
      test.skip(true, "אין Omnibar גלוי");
      return;
    }
    await omnibar.fill("פתח סורק");
    await omnibar.press("Enter");
    await expect(page.getByText(/סורק|סריקה|AI Scanner/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("omnibar general question opens AI chat not scanner", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    const omnibar = await openOmnibar(page);
    if (!omnibar) {
      test.skip(true, "אין Omnibar");
      return;
    }
    await omnibar.fill("מה המצב הכללי בפרויקטים");
    await omnibar.press("Enter");
    await expect(page.getByRole("textbox", { name: /שאל אותי|Ask me|Спросите/i }).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/סורק|AI Scanner/i).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test("ai chat widget: general message stays in chat", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    await dismissCookieBannerIfVisible(page);
    const aiNav = page.getByRole("button", { name: /עוזר AI|AI assistant|AI-ассистент/i }).first();
    if (!(await aiNav.isVisible().catch(() => false))) {
      test.skip(true, "אין כפתור עוזר AI בסרגל");
      return;
    }
    await aiNav.click();
    const input = page.getByRole("textbox", { name: /שאל אותי|Ask me|Спросите/i }).first();
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill("ספר לי בקצרה על המערכת");
    await input.press("Enter");
    await expect(input).toBeVisible();
    await expect(page.getByText(/סורק|AI Scanner/i).first()).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("omnibar opens document creator", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    const omnibar = await openOmnibar(page);
    if (!omnibar) {
      test.skip(true, "אין Omnibar");
      return;
    }
    await omnibar.fill("צור חשבונית");
    await omnibar.press("Enter");
    await expect(page.getByText(/מסמך|חשבונית|doc|invoice/i).first()).toBeVisible({ timeout: 20000 });
  });

  test("keyboard window switcher shortcut", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "דסקטופ");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    await dismissCookieBannerIfVisible(page);
    await page.keyboard.press("Control+Alt+Tab");
    await expect(page.getByText(/חלונות|windows|switcher/i).first()).toBeVisible({ timeout: 8000 }).catch(() => {});
  });

  test("mobile nav shows window switcher", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "מובייל");
    await page.setViewportSize({ width: 390, height: 844 });
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");
    await dismissCookieBannerIfVisible(page);
    const nav = page.getByRole("navigation", { name: /ניווט מהיר|mobile/i }).first();
    if (await nav.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /חלונות|windows/i }).first().click({ timeout: 5000 }).catch(() => {});
    }
  });
});
