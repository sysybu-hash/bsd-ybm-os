import { test, expect } from "@playwright/test";

test.describe("project control center", () => {
  test.skip(!process.env.E2E_EMAIL, "requires E2E credentials");

  test("dashboard loads for authenticated user", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(os|dashboard)/);

    const projectId = process.env.E2E_PROJECT_ID;
    test.skip(!projectId, "set E2E_PROJECT_ID for project widget test");

    await page.goto(`/os?widget=project&projectId=${encodeURIComponent(projectId!)}`);
    await expect(page.getByText(/מרכז פיננסי|Financial hub/i)).toBeVisible({ timeout: 15000 });
  });
});
