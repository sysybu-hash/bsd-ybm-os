import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_PROJECT_ID,
  clearServerWorkspaceLayout,
  dismissWorkspaceOverlays,
  gotoWorkspaceProject,
  keepWorkspaceLayoutAcrossReload,
  openAnyHubFromQuickGrid,
  signInWithRetries,
  waitForAuthenticatedWorkspace,
} from "./helpers";

test.describe("mobile workspace windows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    // בידוד layout בין בדיקות מטופל ב-primeE2eBrowserStorage (מנקה בכל ניווט).
  });

  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("project widget uses full width on mobile", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test first");

    const signed = await signInWithRetries(page);
    test.skip(!signed, "login failed");
    await waitForAuthenticatedWorkspace(page);

    await gotoWorkspaceProject(page, E2E_PROJECT_ID);
    const shell = page.locator("[data-widget-shell]").first();
    const box = await shell.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });

  /**
   * מדמה tab-kill של אנדרואיד (המצלמה החיצונית גורמת ל-reload מלא):
   * חלון פתוח חייב להשתחזר מ-localStorage אחרי טעינה מחדש — ולא לחזור למסך הבית.
   * מכסה את fix(scan) 03dec09 + persistence במובייל.
   */
  test("open hub survives a full page reload on mobile (tab-kill restore)", async ({ page }) => {
    const signed = await signInWithRetries(page);
    test.skip(!signed, "login failed");
    await waitForAuthenticatedWorkspace(page);

    await clearServerWorkspaceLayout(page);
    await dismissWorkspaceOverlays(page);
    await openAnyHubFromQuickGrid(page);
    const shell = page.locator("[data-widget-shell]").last();
    await expect(shell).toBeVisible({ timeout: 30_000 });
    const widgetId = await shell.getAttribute("id");

    // מבטל את ניקוי ה-layout שהבידוד עושה בכל ניווט — כדי שהחלון ישרוד את הטעינה
    // מחדש, בדיוק כמו שקורה למשתמש אמיתי כשאנדרואיד מרענן את הטאב אחרי המצלמה.
    await keepWorkspaceLayoutAcrossReload(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);

    // שחזור מחכה ל-hydration מלא (כולל fetch layout מהשרת) — timeout נדיב
    const restored = page.locator("[data-widget-shell]");
    await expect(restored.first()).toBeVisible({ timeout: 60_000 });
    // אותו מופע חלון (id זהה) — שוחזר, לא נפתח מחדש
    await expect(restored.first()).toHaveAttribute("id", widgetId ?? "");
  });

  test("close button dismisses hub widget on mobile", async ({ page }) => {
    const signed = await signInWithRetries(page);
    test.skip(!signed, "login failed");
    await waitForAuthenticatedWorkspace(page);

    await clearServerWorkspaceLayout(page);
    await dismissWorkspaceOverlays(page);
    await openAnyHubFromQuickGrid(page);
    const shell = page.locator("[data-widget-shell]").last();
    await expect(shell).toBeVisible({ timeout: 30_000 });

    const closeBtn = shell.getByRole("button", { name: /סגור|close/i }).first();
    await expect(closeBtn).toBeVisible({ timeout: 15_000 });
    await closeBtn.click({ force: true });

    await expect
      .poll(async () => !(await shell.isVisible().catch(() => false)), { timeout: 15_000 })
      .toBe(true);
  });

  test("hub widget shell exposes touch scroll region", async ({ page }) => {
    const signed = await signInWithRetries(page);
    test.skip(!signed, "login failed");
    await waitForAuthenticatedWorkspace(page);

    await clearServerWorkspaceLayout(page);
    await dismissWorkspaceOverlays(page);
    await openAnyHubFromQuickGrid(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const widget = document.querySelector("[data-widget-shell]");
            if (!widget) return false;
            return Array.from(widget.querySelectorAll<HTMLElement>("*")).some((el) => {
              const oy = getComputedStyle(el).overflowY;
              return oy === "auto" || oy === "scroll";
            });
          }),
        { timeout: 45_000, message: "expected a scrollable region inside the hub shell" },
      )
      .toBe(true);
  });
});
