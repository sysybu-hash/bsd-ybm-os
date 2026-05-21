import { test, expect } from "@playwright/test";
import { E2E_CONTACT_ID, E2E_PROJECT_ID, tryCredentialsSignIn } from "./helpers";

test.describe("CRM ↔ project bridge", () => {
  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("crm table opens project control center", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID || !E2E_CONTACT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await page.goto("/os?widget=crmTable");
    await expect(page.getByText(/ניהול לקוחות|CRM/i).first()).toBeVisible({ timeout: 15000 });

    const openHub = page.getByRole("button", { name: /פתח מרכז שליטה/i }).first();
    await expect(openHub).toBeVisible({ timeout: 15000 });
    await openHub.click();
    await expect(page.getByText(/מרכז פיננסי|Financial hub/i)).toBeVisible({ timeout: 15000 });
  });
});
