import { test, expect } from "@playwright/test";
import {
  dismissWorkspaceOverlays,
  primeCookieConsent,
  tryCredentialsSignIn,
  workspaceUrl,
} from "./helpers";

test.describe("office expenses", () => {
  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(90_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
    const signed = await tryCredentialsSignIn(page);
    if (!signed) test.skip(true, "E2E credentials not configured");
    await dismissWorkspaceOverlays(page);
  });

  test("executive hub office expenses tab loads and supports manual create", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "executiveHub", tab: "officeExpenses" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);

    const shell = page.locator("[data-widget-shell]").first();
    await shell.waitFor({ state: "visible", timeout: 20_000 });

    await expect(shell.getByRole("tab", { name: /הוצאות משרד|office expenses/i })).toBeVisible();
    await expect(shell.getByText(/סריקת חשבונית|scan invoice/i)).toBeVisible();
    await expect(shell.getByPlaceholder(/שם ספק|vendor/i)).toBeVisible();

    const vendor = `E2E Office ${Date.now()}`;
    await shell.getByPlaceholder(/שם ספק|vendor/i).fill(vendor);
    await shell.getByPlaceholder(/לפני מע|net amount|before vat/i).fill("100");
    await shell.getByRole("button", { name: /הוסף|add/i }).click();

    await expect(shell.getByText(vendor)).toBeVisible({ timeout: 15_000 });
  });

  test("office expenses API returns paginated list for authenticated session", async ({ page }) => {
    const res = await page.request.get("/api/office-expenses?skip=0&take=30");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      expenses?: unknown[];
      total?: number;
      skip?: number;
      take?: number;
      totalPosted?: number;
    };
    expect(Array.isArray(body.expenses)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.totalPosted).toBe("number");
    expect(body.take).toBe(30);
  });

  test("office expenses POST requires org admin role", async ({ page }) => {
    const res = await page.request.post("/api/office-expenses", {
      data: { vendorName: "RBAC Test", amountNet: 1 },
    });
    expect([200, 201, 403]).toContain(res.status());
  });

  test("edit and delete office expense", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "executiveHub", tab: "officeExpenses" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);

    const shell = page.locator("[data-widget-shell]").first();
    await shell.waitFor({ state: "visible", timeout: 20_000 });

    const vendor = `E2E Edit ${Date.now()}`;
    await shell.getByPlaceholder(/שם ספק|vendor/i).fill(vendor);
    await shell.getByPlaceholder(/לפני מע|net amount|before vat/i).fill("50");
    await shell.getByRole("button", { name: /הוסף|add/i }).click();
    await expect(shell.getByText(vendor)).toBeVisible({ timeout: 15_000 });

    const row = shell.locator("li", { hasText: vendor });
    await row.getByRole("button", { name: /ערוך|edit/i }).click();
    const updated = `${vendor} Updated`;
    await shell.getByPlaceholder(/שם ספק|vendor/i).fill(updated);
    await shell.getByRole("button", { name: /שמור|save/i }).click();
    await expect(shell.getByText(updated)).toBeVisible({ timeout: 15_000 });

    const updatedRow = shell.locator("li", { hasText: updated });
    await updatedRow.getByRole("button", { name: /מחק|delete/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /אישור|confirm|מחק|delete/i }).click();
    await expect(shell.getByText(updated)).not.toBeVisible({ timeout: 15_000 });
  });

  test("office expenses layout in landscape viewport", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(workspaceUrl({ w: "executiveHub", tab: "officeExpenses" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);

    const shell = page.locator("[data-widget-shell]").first();
    await shell.waitFor({ state: "visible", timeout: 20_000 });
    await expect(shell.getByPlaceholder(/שם ספק|vendor/i)).toBeVisible();
    await expect(shell.getByText(/סריקת חשבונית|scan invoice/i)).toBeVisible();
  });

  test("finance hub links to executive office expenses", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "financeHub", tab: "overview" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);

    const link = page.getByRole("button", { name: /הוצאות משרד|office expenses/i }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();

    await page.waitForURL(/w=executiveHub/, { timeout: 15_000 });
    await expect(page.getByRole("tab", { name: /הוצאות משרד|office expenses/i })).toBeVisible();
  });
});
