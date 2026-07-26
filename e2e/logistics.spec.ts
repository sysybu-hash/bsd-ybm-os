import { test, expect } from "@playwright/test";
import {
  dismissWorkspaceOverlays,
  primeCookieConsent,
  tryCredentialsSignIn,
  widgetShell,
  workspaceUrl,
} from "./helpers";

test.describe("logistics hub", () => {
  // Both tests hit the dev server's cold-compile path for this widget at once
  // when run in parallel workers, which was causing consistent contention
  // timeouts — force serial execution for this file.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
    const signed = await tryCredentialsSignIn(page);
    if (!signed) test.skip(true, "E2E credentials not configured");
    // A logisticsHub window left open (minimized or otherwise) by another spec
    // sharing this seeded account can make widgetShell()'s `.last()` resolve to
    // a stale window instead of the one this test is about to open.
    await page.request.patch("/api/user/workspace-layout", { data: { widgets: [] } });
    await dismissWorkspaceOverlays(page);
  });

  test("add an inventory item and edit its quantity inline", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "logisticsHub", tab: "inventory" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "logisticsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const itemName = `E2E Inventory Item ${Date.now()}`;
    await shell.getByRole("button", { name: /הוסף פריט מלאי|add inventory item/i }).click();

    const formPanel = page.getByRole("dialog").filter({ hasText: /פריט מלאי חדש|new inventory item/i });
    await expect(formPanel).toBeVisible({ timeout: 10_000 });
    await formPanel.locator("input:not([type])").first().fill(itemName);

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/logistics/inventory") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      formPanel.getByRole("button", { name: /^שמור$|^save$/i }).click(),
    ]);

    const itemCard = shell.locator('[class*="rounded-window"]', { hasText: itemName });
    await expect(itemCard).toBeVisible({ timeout: 15_000 });

    // Quantity starts at 0 by default (schema default) — open the inline editor,
    // bump it up, and save; the displayed value should update.
    await itemCard.locator("button", { hasText: "0" }).click();
    await itemCard.getByRole("button", { name: /הוסף כמות|increase quantity/i }).click();
    await itemCard.getByRole("button", { name: /הוסף כמות|increase quantity/i }).click();
    await itemCard.getByRole("button", { name: /הוסף כמות|increase quantity/i }).click();

    await Promise.all([
      page.waitForResponse(
        (res) =>
          /\/api\/logistics\/inventory\/.+/.test(res.url()) &&
          res.request().method() === "PATCH" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      itemCard.getByRole("button", { name: /שמור כמות|save quantity/i }).click(),
    ]);

    await expect(itemCard.getByText("3", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("full asset checkout -> check-in lifecycle with history log", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "logisticsHub", tab: "assets" }), {
      waitUntil: "domcontentloaded",
    });
    const shell = widgetShell(page, "logisticsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const assetName = `E2E Asset ${Date.now()}`;
    await shell.getByRole("button", { name: /הוסף ציוד|add asset/i }).click();

    const formPanel = page.getByRole("dialog").filter({ hasText: /ציוד חדש|new asset/i });
    await expect(formPanel).toBeVisible({ timeout: 10_000 });
    await formPanel.locator("input").first().fill(assetName);

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/logistics/assets") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      formPanel.getByRole("button", { name: /^שמור$|^save$/i }).click(),
    ]);

    const assetCard = shell.locator('[class*="rounded-window"]', { hasText: assetName });
    await expect(assetCard).toBeVisible({ timeout: 15_000 });
    await expect(assetCard.getByText(/זמין במחסן|available/i)).toBeVisible();

    // ── Check out to the first available user ──────────────────────────────
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/logistics/lookups") && res.ok(),
        { timeout: 20_000 },
      ).catch(() => {}), // lookups may already be cached from a prior render
      assetCard.getByRole("button", { name: /החתם ויציאה לשטח|check out/i }).click(),
    ]);
    const checkoutPanel = page.getByRole("dialog").filter({ hasText: /החתמת ציוד|check out equipment/i });
    await expect(checkoutPanel).toBeVisible({ timeout: 10_000 });

    const userSelect = checkoutPanel.locator("select").first();
    await expect(userSelect.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await userSelect.selectOption({ index: 1 });

    await Promise.all([
      page.waitForResponse(
        (res) =>
          /\/api\/logistics\/assets\/.+\/checkout/.test(res.url()) &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 20_000 },
      ),
      checkoutPanel.getByRole("button", { name: /אשר החתמה|confirm checkout/i }).click(),
    ]);

    await expect(assetCard.getByText(/בשטח|in the field/i)).toBeVisible({ timeout: 15_000 });

    // ── View history — should show the checkout entry ───────────────────────
    await assetCard.getByRole("button", { name: /היסטוריה|history/i }).click();
    const historyPanel = page.getByRole("dialog").filter({ hasText: /היסטוריית תנועות|movement history/i });
    await expect(historyPanel).toBeVisible({ timeout: 10_000 });
    await expect(historyPanel.getByText(/יציאה לשטח|checked out/i)).toBeVisible({ timeout: 15_000 });
    // OsFloatingPanel's close button's aria-label is "סגור <title>" / "Close <title>"
    // (workspaceWidgets.chrome.closeAria), not the exact word "סגור"/"close" — match the
    // prefix. (Escape is unreliable here: OSWorkspace.tsx's own global Escape handler
    // races with the panel's and can close the whole logisticsHub widget instead.)
    await historyPanel.getByRole("button", { name: /^סגור|^close/i }).click();
    await expect(historyPanel).toBeHidden({ timeout: 10_000 });

    // ── Check back in ───────────────────────────────────────────────────────
    await assetCard.getByRole("button", { name: /החזר למחסן|check in/i }).click();
    await expect(assetCard.getByText(/זמין במחסן|available/i)).toBeVisible({ timeout: 15_000 });
  });
});
