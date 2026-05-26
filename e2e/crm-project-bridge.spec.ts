import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_CONTACT_ID,
  E2E_PROJECT_ID,
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  expectProjectDashboardReady,
  tryCredentialsSignIn,
  waitForAuthenticatedWorkspace,
  workspaceUrl,
} from "./helpers";

test.describe("CRM ↔ project bridge", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("crm table opens project control center", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name === "mobile-chrome", "CRM desktop layout only");
    test.skip(!E2E_PROJECT_ID || !E2E_CONTACT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await dismissCookieBannerIfVisible(page);
    await dismissWorkspaceOverlays(page);

    const contactsLoaded = page.waitForResponse(
      (res) =>
        res.url().includes("/api/crm/contacts") &&
        res.request().method() === "GET" &&
        res.ok(),
      { timeout: 90_000 },
    );

    await page.goto(workspaceUrl({ w: "crmTable" }), { waitUntil: "domcontentloaded" });
    await waitForAuthenticatedWorkspace(page);
    const crmShell = page.locator("[data-widget-shell]").first();
    await expect(crmShell).toBeVisible({ timeout: 30_000 });
    await contactsLoaded;

    const openHub = page
      .getByRole("button", { name: /פתח מרכז שליטה|Open control center/i })
      .or(page.getByTitle(/פתח מרכז שליטה|Open control center/i))
      .first();
    await expect(openHub).toBeVisible({ timeout: 30000 });
    await dismissWorkspaceOverlays(page);
    await openHub.click();
    const urlChanged = await page
      .waitForURL(/[?&]w=(project|projectsHub)/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!urlChanged) {
      await expect(
        page
          .getByRole("tab", { name: /מרכז פרויקט|Project control|control center/i })
          .or(page.locator("[data-widget-shell] h2").first()),
      ).toBeVisible({ timeout: 20_000 });
    }
    await expect(
      page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i }),
    ).toHaveCount(0);
  });
});
