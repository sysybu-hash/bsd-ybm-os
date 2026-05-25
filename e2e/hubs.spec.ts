import { test, expect } from "@playwright/test";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  hubQuickGridButton,
  primeCookieConsent,
  tryCredentialsSignIn,
} from "./helpers";

test.describe("dashboard hubs", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([
      { name: "bsd-locale", value: "he", url: origin },
    ]);
    await primeCookieConsent(page);
    await page.goto("/");
    await dismissCookieBannerIfVisible(page);
    const signedIn = await tryCredentialsSignIn(page);
    if (!signedIn) {
      test.skip(true, "E2E credentials not configured");
    }
    await dismissWorkspaceOverlays(page);
  });

  test("quick grid shows consolidated hub tiles", async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    const finance = page.getByRole("button", { name: /פיננסים|finance/i });
    const projects = page.getByRole("button", { name: /פרויקטים|projects hub/i });
    const documents = page.getByRole("button", { name: /מסמכים|documents hub/i });
    await expect(finance.first()).toBeVisible({ timeout: 20_000 });
    await expect(projects.first()).toBeVisible({ timeout: 20_000 });
    await expect(documents.first()).toBeVisible({ timeout: 20_000 });
  });

  test("finance hub opens from quick grid", async ({ page }) => {
    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 10_000 });
  });

  test("deep link resolves dashboard alias to finance hub", async ({ page }) => {
    await dismissWorkspaceOverlays(page);
    await page.goto("/?w=dashboard", { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    await expect(page.locator("[data-widget-shell]").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("projects hub opens with tab navigation", async ({ page }) => {
    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /פרויקטים|projects hub/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 10_000 });
  });

  test("documents hub opens from quick grid", async ({ page }) => {
    await dismissWorkspaceOverlays(page);
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
  });
});
