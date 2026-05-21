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
  waitForCrmContactsLoaded,
  workspaceUrl,
} from "./helpers";

test.describe("CRM ↔ project bridge", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("crm table opens project control center", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID || !E2E_CONTACT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await dismissCookieBannerIfVisible(page);
    await dismissWorkspaceOverlays(page);
    await page.goto(workspaceUrl({ w: "crmTable" }));
    await waitForAuthenticatedWorkspace(page);
    const crmShell = page.locator("[data-widget-shell]").first();
    await expect(crmShell).toBeVisible({ timeout: 30000 });
    await waitForCrmContactsLoaded(page);

    const openHub = page
      .getByRole("button", { name: /פתח מרכז שליטה|Open control center/i })
      .or(page.getByTitle(/פתח מרכז שליטה|Open control center/i))
      .first();
    await expect(openHub).toBeVisible({ timeout: 30000 });
    await dismissWorkspaceOverlays(page);
    await openHub.click();
    await expectProjectDashboardReady(page);
  });
});
