import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PROJECT_ID, gotoWorkspaceProject, tryCredentialsSignIn } from "./helpers";

test.describe("mobile workspace windows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("project widget uses full width on mobile", async ({ page }) => {
    test.skip(!E2E_PROJECT_ID, "run npm run seed:test first");

    const signed = await tryCredentialsSignIn(page);
    test.skip(!signed, "login failed");

    await gotoWorkspaceProject(page, E2E_PROJECT_ID);
    const shell = page.getByRole("region", { name: /Project control center|מרכז בקרה/i }).first();
    const box = await shell.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });
});
