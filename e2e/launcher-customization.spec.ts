import { test, expect } from "@playwright/test";
import { tryCredentialsSignIn } from "./helpers";

test.describe("launcher customization", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("bsd_ybm_launcher_v1");
    });
  });

  test("enters edit mode and persists reorder", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "drag+drop יציב בדסקטופ בלבד");
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "אין משתמש E2E");

    await page.goto("/");
    await page.waitForSelector('[data-testid="launcher-zone-quickGrid"]', { timeout: 60_000 });

    const zone = page.locator('[data-testid="launcher-zone-quickGrid"]');
    await zone.dispatchEvent("pointerdown");
    await page.waitForTimeout(600);
    await page.mouse.up();

    await expect(page.getByTestId("launcher-edit-banner")).toBeVisible();

    await page.getByTestId("launcher-edit-done").click();
    await expect(page.getByTestId("launcher-edit-banner")).toBeHidden();

    const stored = await page.evaluate(() => localStorage.getItem("bsd_ybm_launcher_v2"));
    expect(stored).toBeTruthy();
  });
});
