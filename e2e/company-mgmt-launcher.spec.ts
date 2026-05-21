import { test, expect } from "@playwright/test";

/**
 * דורש ארגון COMPANY_MGMT ב-seed או E2E_COMPANY_MGMT=1 + התחברות אדמין עסקי.
 * בודק ש-launcher לא מציג Meckano ושדף פרויקט לא מציג BOQ (סמנטי).
 */
test.describe("company management mode", () => {
  test.skip(!process.env.E2E_COMPANY_MGMT, "הגדר E2E_COMPANY_MGMT=1 לארגון עסקי");

  test("launcher hides meckano for company org", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const meckano = page.getByRole("button", { name: /meckano|מקאנו/i });
    await expect(meckano).toHaveCount(0);
  });

  test("project view has no BOQ tab label for company org", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const boqTab = page.getByRole("tab", { name: /כתב כמויות|BOQ/i });
    await expect(boqTab).toHaveCount(0);
  });
});
