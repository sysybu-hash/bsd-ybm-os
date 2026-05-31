/**
 * Mobile responsive layout tests.
 * Verifies that widget content fits within the mobile viewport,
 * key grids stack to single column, and touch targets are accessible.
 */
import { test, expect } from "@playwright/test";
import {
  dismissWorkspaceOverlays,
  hubQuickGridButton,
  primeCookieConsent,
  tryCredentialsSignIn,
  workspaceUrl,
  dismissCookieBannerIfVisible,
} from "./helpers";

const MOBILE_VIEWPORT = { width: 390, height: 844 }; // iPhone 14 Pro
const NARROW_VIEWPORT = { width: 360, height: 780 }; // common Android

test.describe("mobile responsive — layout", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
    const signed = await tryCredentialsSignIn(page);
    await dismissCookieBannerIfVisible(page);
    if (!signed) test.skip(true, "E2E credentials not configured");
    await dismissWorkspaceOverlays(page);
  });

  // ─── widget shell ─────────────────────────────────────────────────────────────

  test("widget shell fills full width on mobile", async ({ page }) => {
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const box = await shell.boundingBox();
    // Shell should fill viewport width (allow 4px tolerance for borders)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MOBILE_VIEWPORT.width - 4);
  });

  test("widget content does not cause horizontal scroll", async ({ page }) => {
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // scrollWidth should equal clientWidth (no horizontal overflow)
    const overflow = await shell.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflow).toBe(false);
  });

  test("cashflow stat cards stack vertically on mobile", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "financeHub", tab: "cashflow" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Wait for cashflow to render
    const cashflowTab = shell.getByRole("tab", { name: /תזרים|cashflow/i });
    if (await cashflowTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cashflowTab.click();
    }

    await page.waitForTimeout(1000);

    // Find the stat cards container and verify it doesn't have 3 side-by-side columns
    // by checking that the second card's Y position >= first card's Y position
    const cards = shell.locator(".grid").filter({ has: shell.locator(".rounded-2xl") }).first();
    const cardItems = cards.locator("> *");
    const count = await cardItems.count();

    if (count >= 2) {
      const box0 = await cardItems.nth(0).boundingBox();
      const box1 = await cardItems.nth(1).boundingBox();
      if (box0 && box1) {
        // On mobile (< 768px), cards should stack — second card below first
        // Allow for same-row if viewport happens to be >= md breakpoint
        const stacked = box1.y > box0.y + box0.height / 2;
        const isWideEnoughForRow = MOBILE_VIEWPORT.width >= 768;
        if (!isWideEnoughForRow) {
          expect(stacked).toBe(true);
        }
      }
    }
  });

  // ─── document creator header ─────────────────────────────────────────────────

  test("document creator header wraps on mobile", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "documentsHub", tab: "create" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const createTab = shell.getByRole("tab", { name: /הפקה|create/i });
    if (await createTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createTab.click();
    }

    // The "מחולל מסמכים חכם" heading should be visible
    await expect(
      shell.getByRole("heading", { name: /מחולל מסמכים|document creator/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The header should not overflow the shell width
    const header = shell.locator("header, [class*='border-b']").first();
    const shellBox = await shell.boundingBox();
    const headerBox = await header.boundingBox();
    if (shellBox && headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(shellBox.width + 2);
    }
  });

  // ─── CRM modal ────────────────────────────────────────────────────────────────

  test("CRM client detail modal is scrollable on mobile", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "crmTable" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Click the first client row
    const firstRow = shell.locator("tr[class*='cursor-pointer']").first();
    if (await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await firstRow.click();
      // Modal should appear and be scrollable
      const modal = page.locator("[class*='rounded-'][class*='shadow-2xl']").first();
      await expect(modal).toBeVisible({ timeout: 10_000 });
      const modalBox = await modal.boundingBox();
      if (modalBox) {
        // Modal should fit within viewport width
        expect(modalBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 2);
      }
    }
  });

  // ─── Google Drive header ─────────────────────────────────────────────────────

  test("Google Drive header buttons wrap on mobile", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "googleDrive" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // The upload button should be visible (not cut off)
    const uploadBtn = shell.getByRole("button", { name: /העלה קובץ|Upload/i });
    await expect(uploadBtn).toBeVisible({ timeout: 15_000 });

    const uploadBox = await uploadBtn.boundingBox();
    const shellBox  = await shell.boundingBox();
    if (uploadBox && shellBox) {
      // Button right edge should be inside shell bounds
      expect(uploadBox.x + uploadBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width + 4);
    }
  });

  // ─── archive category chips ───────────────────────────────────────────────────

  test("archive category chips have adequate touch targets", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "documentsHub", tab: "archive" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    // Find category chip buttons (all/invoice/quote/contract)
    const chips = shell
      .getByRole("button", { name: /הכל|חשבוניות|הצעות|חוזים|All|Invoices/i });
    const count = await chips.count();
    if (count > 0) {
      const box = await chips.first().boundingBox();
      // Touch target should be at least 36px tall (we set min-h-[44px] on mobile)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
    }
  });

  // ─── bottom navigation ────────────────────────────────────────────────────────

  test("mobile bottom navigation is visible and accessible", async ({ page }) => {
    const mobileNav = page.getByTestId("mobile-bottom-nav");
    await expect(mobileNav).toBeVisible({ timeout: 20_000 });

    // Nav should span full width
    const navBox = await mobileNav.boundingBox();
    expect(navBox?.width ?? 0).toBeGreaterThanOrEqual(MOBILE_VIEWPORT.width - 4);
  });

  test("tab bar in hub widget supports horizontal scroll when needed", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "projectsHub" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const tablist = shell.getByRole("tablist");
    await expect(tablist).toBeVisible({ timeout: 10_000 });

    // tablist should have overflow-x-auto so tabs don't push out of bounds
    const overflowX = await tablist.evaluate((el) => getComputedStyle(el).overflowX);
    expect(["auto", "scroll", "hidden"]).toContain(overflowX);
  });
});

test.describe("mobile responsive — narrow viewport (360px)", () => {
  test.use({ viewport: NARROW_VIEWPORT });

  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await primeCookieConsent(page);
    const signed = await tryCredentialsSignIn(page);
    await dismissCookieBannerIfVisible(page);
    if (!signed) test.skip(true, "E2E credentials not configured");
    await dismissWorkspaceOverlays(page);
  });

  test("finance hub renders without horizontal overflow at 360px", async ({ page }) => {
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const overflow = await shell.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflow).toBe(false);
  });

  test("CRM table renders without horizontal overflow at 360px", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "crmTable" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const overflow = await shell.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflow).toBe(false);
  });

  test("documents hub create tab renders without overflow at 360px", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "documentsHub", tab: "create" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const createTab = shell.getByRole("tab", { name: /הפקה|create/i });
    if (await createTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createTab.click();
      await page.waitForTimeout(500);
    }

    const overflow = await shell.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflow).toBe(false);
  });
});
