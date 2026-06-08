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

  test("close button dismisses hub widget on mobile", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const closeBtn = shell.getByRole("button", { name: /סגור|close/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click({ force: true });

    await expect(shell).toBeHidden({ timeout: 10_000 });
  });

  test("hub widget shell exposes touch scroll region", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Hub widgets are sticky-chrome: the outer shell-scroll-host is overflow:hidden
    // and the inner [data-widget-scroll-pane] is the actual scroll owner.
    // Accept either pattern so the test works for both flow and sticky-chrome widgets.
    const scrollPane = shell.locator("[data-widget-scroll-pane]").first();
    const shellScrollHost = shell.locator("[data-shell-scroll]").first();

    const paneOverflow = await scrollPane.isVisible()
      ? await scrollPane.evaluate((el) => getComputedStyle(el).overflowY)
      : "hidden";
    const hostOverflow = await shellScrollHost.evaluate((el) => getComputedStyle(el).overflowY);

    const hasScrollRegion =
      paneOverflow === "auto" || paneOverflow === "scroll" ||
      hostOverflow === "auto" || hostOverflow === "scroll";

    expect(hasScrollRegion).toBeTruthy();
  });
});
