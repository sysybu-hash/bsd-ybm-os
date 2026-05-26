import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_PROJECT_ID,
  dismissWorkspaceOverlays,
  gotoWorkspaceProject,
  hubQuickGridButton,
  tryCredentialsSignIn,
} from "./helpers";

test.describe("mobile workspace windows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("project widget uses full width on mobile", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await gotoWorkspaceProject(page, E2E_PROJECT_ID);
    const shell = page.locator("[data-widget-shell]").first();
    const box = await shell.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });

  test("hub widget shell exposes touch scroll region", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const scrollHost = page.locator("[data-widget-shell] .custom-scrollbar").first();
    await expect(scrollHost).toBeVisible({ timeout: 20_000 });

    const overflowY = await scrollHost.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY === "auto" || overflowY === "scroll").toBeTruthy();
  });
});
