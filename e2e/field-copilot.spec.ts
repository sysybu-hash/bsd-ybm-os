import { test, expect } from "@playwright/test";

/**
 * דורש ארגון בנייה + E2E_FIELD_COPILOT=1 + התחברות.
 */
test.describe("field copilot", () => {
  test.skip(!process.env.E2E_FIELD_COPILOT, "הגדר E2E_FIELD_COPILOT=1 לבדיקת קופיילוט שטח");

  test("launcher exposes field copilot for construction org", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const tile = page.getByRole("button", { name: /קופיילוט שטח|field copilot|полевой/i });
    await expect(tile.first()).toBeVisible({ timeout: 15_000 });
  });
});
