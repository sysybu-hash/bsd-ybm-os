import { test, expect } from "@playwright/test";
import { E2E_LAUNCHER_EMAIL, signInAsSpecUser } from "./helpers";

/**
 * Shares one seeded account with the other layout-resetting specs (hubs,
 * logistics, launcher-customization, universal-command) and starts by wiping
 * that account's server-side workspace layout. Run in parallel, one test wipes
 * the layout while another is opening a window, and the click lands on a shell
 * being torn down — Playwright reports "subtree intercepts pointer events".
 *
 * `default` sequences them within the file without the cascade-skip `serial`
 * adds. Full isolation needs a per-spec account; see docs/E2E-SHARED-STATE.md.
 */
test.describe.configure({ mode: "default" });

test.describe("launcher customization", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("bsd_ybm_launcher_v1");
    });
  });

  test("enters edit mode and persists reorder", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "drag+drop יציב בדסקטופ בלבד");
    const signed = await signInAsSpecUser(page, E2E_LAUNCHER_EMAIL);
    test.skip(!signed, "אין משתמש E2E");

    // The launcher grid only renders when no windows are open. Other E2E specs
    // sharing this seeded account persist their own open windows server-side,
    // so reset the layout before testing the launcher itself.
    await page.request.patch("/api/user/workspace-layout", { data: { widgets: [] } });

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
