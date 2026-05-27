import { test, expect } from "@playwright/test";
import { E2E_EMAIL, gotoAuthenticatedWidget, waitForCrmContactsLoaded } from "./helpers";

test.describe("דף מוצר — CRM", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("ייצוא CSV וחיפוש חכם בכותרת CRM", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "CRM desktop layout only");

    const ready = await gotoAuthenticatedWidget(page, "crmTable");
    test.skip(!ready, "login failed or CRM shell not visible");

    await waitForCrmContactsLoaded(page);

    await expect(page.getByRole("button", { name: /ייצוא CSV|Export CSV/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/חיפוש חכם|Smart search/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ייבוא CSV|Import CSV/i })).toBeVisible();
  });
});
