import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PROJECT_ID, gotoWorkspaceProject, tryCredentialsSignIn } from "./helpers";

test.describe("project control center", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("dashboard loads for authenticated user", async ({ page }) => {
    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test for E2E_PROJECT_ID");

    await gotoWorkspaceProject(page, E2E_PROJECT_ID);
    await expect(page.getByText(/מרכז פיננסי|Financial hub/i)).toBeVisible({ timeout: 30000 });
  });
});
