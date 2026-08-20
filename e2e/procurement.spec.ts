import { test, expect } from "@playwright/test";
import {
  dismissWorkspaceOverlays,
  primeCookieConsent,
  tryCredentialsSignIn,
  widgetShell,
  workspaceUrl,
} from "./helpers";

test.describe("procurement hub", () => {
  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
    const signed = await tryCredentialsSignIn(page);
    if (!signed) test.skip(true, "E2E credentials not configured");
    await dismissWorkspaceOverlays(page);
  });

  test("full request -> PO -> partial receive -> full receive lifecycle", async ({ page }) => {
    const requestTitle = `E2E Procurement Item ${Date.now()}`;

    // ── 1. Create a manual purchase request ─────────────────────────────────
    await page.goto(workspaceUrl({ w: "procurementHub", tab: "requests" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "procurementHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    await shell.getByRole("button", { name: /דרישה חדשה|new request/i }).click();
    const requestPanel = page.getByRole("dialog").filter({ hasText: /דרישת רכש חדשה|new purchase request/i });
    await expect(requestPanel).toBeVisible({ timeout: 10_000 });

    await requestPanel.locator('input[type="text"]').first().fill(requestTitle);
    await requestPanel.locator('input[type="number"]').first().fill("10");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/procurement/requests") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      requestPanel.getByRole("button", { name: /שמור דרישה|save request/i }).click(),
    ]);

    await expect(shell.getByText(requestTitle)).toBeVisible({ timeout: 15_000 });

    // ── 2. Convert the request into a purchase order (draft, no auto-send) ──
    const requestCard = shell.locator('[class*="rounded-window"]', { hasText: requestTitle });
    await requestCard.getByRole("button", { name: /הפק הזמנה \(PO\)|create po/i }).click();

    const poPanel = page.getByRole("dialog").filter({ hasText: /הפקת הזמנת רכש|purchase order/i });
    await expect(poPanel).toBeVisible({ timeout: 10_000 });

    const supplierName = `E2E Supplier ${Date.now()}`;
    await poPanel.getByRole("button", { name: /הוספת ספק חדש|add supplier/i }).click();
    await poPanel.getByPlaceholder(/שם הספק|supplier name/i).fill(supplierName);
    await poPanel.locator('input[type="number"]').first().fill("25");
    // Uncheck "issue PDF + send to supplier" — keep the PO as DRAFT for this test.
    await poPanel.locator('input[type="checkbox"]').uncheck();

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/procurement/orders") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      poPanel.getByRole("button", { name: /הפק הזמנה|create order/i }).click(),
    ]);

    // ── 3. Verify the PO landed in the Orders tab as DRAFT ──────────────────
    await shell.getByRole("tab", { name: /הזמנות|orders/i }).click();
    const orderCard = shell.locator('[class*="rounded-window"]', { hasText: supplierName });
    await expect(orderCard).toBeVisible({ timeout: 15_000 });
    await expect(orderCard.getByText(/טיוטה|draft/i)).toBeVisible();

    // ── 4. Partial receive ───────────────────────────────────────────────────
    await orderCard.getByRole("button", { name: /קליטת סחורה|receive/i }).click();
    const receivePanel = page.getByRole("dialog").filter({ hasText: /קליטת סחורה|receiving/i });
    await expect(receivePanel).toBeVisible({ timeout: 10_000 });

    const qtyInput = receivePanel.locator('input[type="number"]').first();
    await qtyInput.fill("4"); // partial: 4 of 10

    await Promise.all([
      page.waitForResponse(
        (res) =>
          /\/api\/procurement\/orders\/.+/.test(res.url()) &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      receivePanel.getByRole("button", { name: /אשר קליטה|confirm receive/i }).click(),
    ]);

    await expect(orderCard.getByText(/נקלט חלקית|partial/i)).toBeVisible({ timeout: 15_000 });

    // ── 5. Receive the remainder — should transition to RECEIVED ───────────
    await orderCard.getByRole("button", { name: /קליטת סחורה|receive/i }).click();
    const receivePanel2 = page.getByRole("dialog").filter({ hasText: /קליטת סחורה|receiving/i });
    await expect(receivePanel2).toBeVisible({ timeout: 10_000 });
    // Input is pre-filled with the full remaining quantity (6) by default.
    await Promise.all([
      page.waitForResponse(
        (res) =>
          /\/api\/procurement\/orders\/.+/.test(res.url()) &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      receivePanel2.getByRole("button", { name: /אשר קליטה|confirm receive/i }).click(),
    ]);

    await expect(orderCard.getByText(/הושלם|received/i)).toBeVisible({ timeout: 15_000 });
    // A fully-received order can no longer be received or cancelled.
    await expect(orderCard.getByRole("button", { name: /קליטת סחורה|receive/i })).toHaveCount(0);
    await expect(orderCard.getByRole("button", { name: /ביטול הזמנה|cancel/i })).toHaveCount(0);
  });

  test("cancelling a draft PO blocks further receive", async ({ page }) => {
    const requestTitle = `E2E Cancel Item ${Date.now()}`;

    await page.goto(workspaceUrl({ w: "procurementHub", tab: "requests" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "procurementHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    await shell.getByRole("button", { name: /דרישה חדשה|new request/i }).click();
    const requestPanel = page.getByRole("dialog").filter({ hasText: /דרישת רכש חדשה|new purchase request/i });
    await requestPanel.locator('input[type="text"]').first().fill(requestTitle);
    await requestPanel.locator('input[type="number"]').first().fill("3");
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/procurement/requests") && res.request().method() === "POST" && res.ok(),
        { timeout: 20_000 },
      ),
      requestPanel.getByRole("button", { name: /שמור דרישה|save request/i }).click(),
    ]);
    await expect(shell.getByText(requestTitle)).toBeVisible({ timeout: 15_000 });

    const requestCard = shell.locator('[class*="rounded-window"]', { hasText: requestTitle });
    await requestCard.getByRole("button", { name: /הפק הזמנה \(PO\)|create po/i }).click();
    const poPanel = page.getByRole("dialog").filter({ hasText: /הפקת הזמנת רכש|purchase order/i });

    const supplierName = `E2E Cancel Supplier ${Date.now()}`;
    await poPanel.getByRole("button", { name: /הוספת ספק חדש|add supplier/i }).click();
    await poPanel.getByPlaceholder(/שם הספק|supplier name/i).fill(supplierName);
    await poPanel.locator('input[type="number"]').first().fill("10");
    await poPanel.locator('input[type="checkbox"]').uncheck();
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/procurement/orders") && res.request().method() === "POST" && res.ok(),
        { timeout: 20_000 },
      ),
      poPanel.getByRole("button", { name: /הפק הזמנה|create order/i }).click(),
    ]);

    await shell.getByRole("tab", { name: /הזמנות|orders/i }).click();
    const orderCard = shell.locator('[class*="rounded-window"]', { hasText: supplierName });
    await expect(orderCard).toBeVisible({ timeout: 15_000 });

    await orderCard.getByRole("button", { name: /ביטול הזמנה|cancel/i }).click();
    await expect(orderCard.getByText(/בוטל|cancelled/i)).toBeVisible({ timeout: 15_000 });
    await expect(orderCard.getByRole("button", { name: /קליטת סחורה|receive/i })).toHaveCount(0);
  });

  test("suppliers tab lists a newly-added supplier", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "procurementHub", tab: "suppliers" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "procurementHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const supplierName = `E2E Directory Supplier ${Date.now()}`;
    await shell.getByPlaceholder(/שם הספק|supplier name/i).fill(supplierName);
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/procurement/suppliers") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      shell.getByRole("button", { name: /הוסף ספק|add supplier/i }).click(),
    ]);

    await expect(shell.getByText(supplierName)).toBeVisible({ timeout: 15_000 });
  });

  test("requests tab renders without error regardless of low-stock/BOQ/manual mix", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "procurementHub", tab: "requests" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "procurementHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    // The hint line is always rendered regardless of whether the list has any
    // requests (manual, low-stock-triggered, or BOQ-sourced) or is empty.
    await expect(
      shell.getByText(/דרישות ממלאי חסר ומכתבי כמויות יופיעו כאן אוטומטית/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
