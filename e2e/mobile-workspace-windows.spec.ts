import { test, expect } from "@playwright/test";
import { E2E_PROJECT_ID, tryCredentialsSignIn } from "./helpers";

test.describe("mobile workspace windows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("project widget uses full width on mobile", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await page.goto(`/os?widget=project&projectId=${encodeURIComponent(E2E_PROJECT_ID)}`);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15000 });
    const box = await shell.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });
});
