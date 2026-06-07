import { test, expect } from "@playwright/test";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  hubQuickGridButton,
  primeCookieConsent,
  tryCredentialsSignIn,
  workspaceUrl,
} from "./helpers";

async function signIn(page: Parameters<typeof tryCredentialsSignIn>[0]) {
  await primeCookieConsent(page);
  const signed = await tryCredentialsSignIn(page);
  await dismissCookieBannerIfVisible(page);
  if (!signed) test.skip(true, "E2E credentials not configured");
  await dismissWorkspaceOverlays(page);
  return signed;
}

test.describe("dashboard hubs", () => {
  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await signIn(page);
  });

  // ─── quick-grid ──────────────────────────────────────────────────────────────

  test("quick grid shows consolidated hub tiles", async ({ page }) => {
    await page.waitForLoadState("domcontentloaded");
    const finance   = page.getByRole("button", { name: /פיננסים|finance/i });
    const projects  = page.getByRole("button", { name: /פרויקטים|projects hub/i });
    const documents = page.getByRole("button", { name: /מסמכים|documents hub/i });
    await expect(finance.first()).toBeVisible({ timeout: 20_000 });
    await expect(projects.first()).toBeVisible({ timeout: 20_000 });
    await expect(documents.first()).toBeVisible({ timeout: 20_000 });
  });

  // ─── finance hub ─────────────────────────────────────────────────────────────

  test("finance hub opens from quick grid", async ({ page }) => {
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 10_000 });
  });

  test("finance hub tab switch: overview → cashflow", async ({ page }) => {
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const cashflowTab = shell.getByRole("tab", { name: /תזרים|cashflow/i });
    await expect(cashflowTab).toBeVisible({ timeout: 10_000 });
    await cashflowTab.click();

    await expect(
      shell.getByRole("heading", { name: /תזרים מזומנים|cashflow/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("finance hub tab switch: cashflow → overview", async ({ page }) => {
    await hubQuickGridButton(page, /פיננסים|finance/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const cashflowTab = shell.getByRole("tab", { name: /תזרים|cashflow/i });
    await cashflowTab.click();

    const overviewTab = shell.getByRole("tab", { name: /סקירה|overview/i });
    await expect(overviewTab).toBeVisible({ timeout: 10_000 });
    await overviewTab.click();

    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("deep link resolves dashboard alias to finance hub", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/?w=dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissWorkspaceOverlays(page);
    await expect(page).toHaveURL(/w=(dashboard|financeHub|finance)/);
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("finance hub deep link opens cashflow tab directly", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "financeHub", tab: "cashflow" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.getByRole("tab", { selected: true })).toContainText(/תזרים|cashflow/i, {
      timeout: 10_000,
    });
  });

  // ─── projects hub ─────────────────────────────────────────────────────────────

  test("projects hub opens with tab navigation", async ({ page }) => {
    await hubQuickGridButton(page, /פרויקטים|projects hub/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 10_000 });
  });

  test("projects hub has board and project tabs", async ({ page }) => {
    await hubQuickGridButton(page, /פרויקטים|projects hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const boardTab   = shell.getByRole("tab", { name: /לוח פרויקטים|board/i });
    const projectTab = shell.getByRole("tab", { name: /מרכז פרויקט|project/i });
    await expect(boardTab).toBeVisible({ timeout: 10_000 });
    await expect(projectTab).toBeVisible({ timeout: 10_000 });
  });

  test("projects hub: switch to board tab renders task columns", async ({ page }) => {
    await hubQuickGridButton(page, /פרויקטים|projects hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const boardTab = shell.getByRole("tab", { name: /לוח פרויקטים|board/i });
    await boardTab.click();

    // Without a scoped project, board tab shows the project picker
    await expect(
      shell.getByText(/בחרו פרויקט|Choose a project/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("projects hub deep link opens board tab", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "projectsHub", tab: "board" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.getByRole("tab", { selected: true })).toContainText(/לוח פרויקטים|board/i, {
      timeout: 10_000,
    });
  });

  // ─── documents hub ────────────────────────────────────────────────────────────

  test("documents hub opens from quick grid", async ({ page }) => {
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    await expect(page.locator("[data-widget-shell]")).toBeVisible({ timeout: 15_000 });
  });

  test("documents hub has archive, create and scan tabs", async ({ page }) => {
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    await expect(shell.getByRole("tab", { name: /ארכיון|archive/i })).toBeVisible({ timeout: 10_000 });
    await expect(shell.getByRole("tab", { name: /הפקה|create/i })).toBeVisible({ timeout: 10_000 });
    await expect(shell.getByRole("tab", { name: /סריקה|scan/i })).toBeVisible({ timeout: 10_000 });
  });

  test("documents hub: create tab loads document creator", async ({ page }) => {
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    await shell.getByRole("tab", { name: /הפקה|create/i }).click();

    await expect(
      shell.getByRole("heading", { name: /מחולל מסמכים|document creator|financial engine/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("documents hub: scan tab loads scanner", async ({ page }) => {
    await hubQuickGridButton(page, /מסמכים|documents hub/i).click();
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });

    await shell.getByRole("tab", { name: /סריקה|scan/i }).click();

    // Scanner shows its header toolbar
    await expect(
      shell.getByRole("heading", { level: 2 }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("documents hub deep link to scan tab", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "documentsHub", tab: "scan" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.getByRole("tab", { selected: true })).toContainText(/סריקה|scan/i, {
      timeout: 10_000,
    });
  });

  // ─── AI hub ───────────────────────────────────────────────────────────────────

  test("AI hub opens and shows chat and notebook tabs", async ({ page }) => {
    // Open AI hub via deep link (may not be in quick grid by default)
    await page.goto(workspaceUrl({ w: "aiHub" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const chatTab     = shell.getByRole("tab", { name: /צ.?אט|chat/i });
    const notebookTab = shell.getByRole("tab", { name: /מחברת|notebook/i });
    await expect(chatTab).toBeVisible({ timeout: 10_000 });
    await expect(notebookTab).toBeVisible({ timeout: 10_000 });
  });

  test("AI hub: notebook tab loads sources sidebar", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "aiHub", tab: "notebook" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const notebookTab = shell.getByRole("tab", { name: /מחברת|notebook/i });
    await notebookTab.click();

    // Sources sidebar has a "מקורות|Sources" heading
    await expect(
      shell.getByRole("heading", { name: /מקורות|sources/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("AI hub: chat tab shows input", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "aiHub" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = page.locator("[data-widget-shell]").first();
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const chatTab = shell.getByRole("tab", { name: /צ.?אט|chat/i });
    await chatTab.click();
    await expect(chatTab).toHaveAttribute("aria-selected", "true");

    const chatInput = shell.getByPlaceholder(/שאל/i).first();
    const scrollPane = shell.locator("[data-widget-scroll-pane]");
    if (await scrollPane.count()) {
      await scrollPane.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    }
    await chatInput.scrollIntoViewIfNeeded();
    await expect(chatInput).toBeVisible({ timeout: 15_000 });
  });

  // ─── error resilience ─────────────────────────────────────────────────────────

  test("no error boundary triggers when cycling all hub tabs", async ({ page }) => {
    test.setTimeout(120_000);
    const hubs = [
      { widget: "financeHub",   tabs: [/תזרים|cashflow/i, /סקירה|overview/i] },
      { widget: "projectsHub",  tabs: [/לוח פרויקטים|board/i, /מרכז פרויקט|project/i] },
      { widget: "documentsHub", tabs: [/ארכיון|archive/i, /הפקה|create/i, /סריקה|scan/i] },
      { widget: "aiHub",        tabs: [/צ.?אט|chat/i, /מחברת|notebook/i] },
    ] as const;

    const errorHeading = page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i });

    for (const { widget, tabs } of hubs) {
      await page.goto(workspaceUrl({ w: widget }), { waitUntil: "domcontentloaded" });
      await dismissWorkspaceOverlays(page);
      const shell = page.locator("[data-widget-shell]").first();
      await shell.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

      for (const tabName of tabs) {
        const tab = shell.getByRole("tab", { name: tabName });
        if (await tab.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await tab.click();
          await page.waitForTimeout(500);
        }
      }

      await expect(errorHeading).toHaveCount(0, { timeout: 5_000 });
    }
  });
});
