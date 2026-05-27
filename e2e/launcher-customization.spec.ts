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

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="launcher-zone-quickGrid"]', { timeout: 60_000 });

    const zone = page.locator('[data-testid="launcher-zone-quickGrid"]');
    const box = await zone.boundingBox();
    if (!box) throw new Error("launcher-zone-quickGrid bounding box not found");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect(page.getByTestId("launcher-edit-banner")).toBeVisible();

    await page.getByTestId("launcher-edit-done").click();
    await expect(page.getByTestId("launcher-edit-banner")).toBeHidden();

    const stored = await page.evaluate(() => localStorage.getItem("bsd_ybm_launcher_v2"));
    expect(stored).toBeTruthy();
  });
});
