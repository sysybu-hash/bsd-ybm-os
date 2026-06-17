import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_PROJECT_ID,
  dismissWorkspaceOverlays,
  gotoWorkspaceProject,
  hubQuickGridButton,
  openAnyHubFromQuickGrid,
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
    await openAnyHubFromQuickGrid(page);
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
    await openAnyHubFromQuickGrid(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Under the unified scroll model the outer shell-scroll-host is overflow:hidden
    // and a sticky-chrome widget's inner [data-widget-scroll-pane] owns the scroll —
    // but that pane mounts only after the hub's content finishes loading. Poll for
    // ANY scrollable region inside the shell so we don't race the async render.
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
        { timeout: 15_000, message: "expected a scrollable region inside the hub shell" },
      )
      .toBe(true);
  });
});
