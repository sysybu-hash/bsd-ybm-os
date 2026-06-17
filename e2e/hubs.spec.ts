import { test, expect } from "@playwright/test";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  openHubFromLauncher,
  openFinanceHub,
  openAnyHubFromQuickGrid,
  primeCookieConsent,
  tryCredentialsSignIn,
  widgetShell,
  workspaceUrl,
  expectHubTabSelected,
  ensureHubTabFromDeepLink,
} from "./helpers";

async function gotoWorkspace(page: Parameters<typeof tryCredentialsSignIn>[0], url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = message.includes("ERR_ABORTED") || message.includes("frame was detached");
      if (!retryable || attempt === 2) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

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
    const executive = page.getByRole("button", { name: /מרכז מנהל|executive/i });
    const projects  = page.getByRole("button", { name: /פרויקטים|projects hub/i });
    const documents = page.getByRole("button", { name: /מסמכים|documents hub/i });
    await expect(executive.first()).toBeVisible({ timeout: 20_000 });
    await expect(projects.first()).toBeVisible({ timeout: 20_000 });
    await expect(documents.first()).toBeVisible({ timeout: 20_000 });
  });

  // ─── finance hub ─────────────────────────────────────────────────────────────

  test("finance hub opens from quick grid", async ({ page }) => {
    await openFinanceHub(page);
    await expect(widgetShell(page, "financeHub")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 10_000 });
  });

  test("finance hub tab switch: overview → cashflow", async ({ page }) => {
    await openFinanceHub(page);
    const shell = widgetShell(page, "financeHub");
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const cashflowTab = shell.getByRole("tab", { name: /תזרים|cashflow/i });
    await expect(cashflowTab).toBeVisible({ timeout: 10_000 });
    await cashflowTab.click();
    await expect(shell.getByRole("tab", { selected: true })).toContainText(/תזרים|cashflow/i, {
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("finance hub tab switch: cashflow → overview", async ({ page }) => {
    await openFinanceHub(page);
    const shell = widgetShell(page, "financeHub");
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const cashflowTab = shell.getByRole("tab", { name: /תזרים|cashflow/i });
    await cashflowTab.click();

    const overviewTab = shell.getByRole("tab", { name: /סקירה|overview/i });
    await expect(overviewTab).toBeVisible({ timeout: 10_000 });
    await overviewTab.click();

    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("deep link resolves dashboard alias to finance hub", async ({ page }) => {
    await gotoWorkspace(page, workspaceUrl({ w: "dashboard" }));
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "financeHub");
    await expect(shell).toBeVisible({ timeout: 30_000 });

    const urlMatches = /w=(dashboard|financeHub|finance)/.test(page.url());
    const financeTab = shell.getByRole("tab", { name: /סקירה|overview|תזרים|cashflow/i }).first();
    const hasFinanceUi = await financeTab.isVisible({ timeout: 10_000 }).catch(() => false);
    expect(urlMatches || hasFinanceUi).toBe(true);
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("finance hub deep link opens cashflow tab directly", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "financeHub", tab: "cashflow" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "financeHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await ensureHubTabFromDeepLink(shell, /תזרים|cashflow/i);
  });

  // ─── projects hub ─────────────────────────────────────────────────────────────

  test("projects hub opens with tab navigation", async ({ page }) => {
    await openHubFromLauncher(page, {
      quickGridName: /פרויקטים|projects hub/i,
      widget: "projectsHub",
    });
    await expect(widgetShell(page, "projectsHub")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 10_000 });
  });

  test("projects hub has board and project tabs", async ({ page }) => {
    await openHubFromLauncher(page, {
      quickGridName: /פרויקטים|projects hub/i,
      widget: "projectsHub",
    });
    const shell = widgetShell(page, "projectsHub");
    await expect(shell).toBeVisible({ timeout: 15_000 });

    const boardTab   = shell.getByRole("tab", { name: /לוח פרויקטים|board/i });
    const projectTab = shell.getByRole("tab", { name: /מרכז פרויקט|project/i });
    await expect(boardTab).toBeVisible({ timeout: 10_000 });
    await expect(projectTab).toBeVisible({ timeout: 10_000 });
  });

  test("projects hub: switch to board tab renders task columns", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Mobile board layout differs from desktop column assertions");
    await openHubFromLauncher(page, {
        quickGridName: /פרויקטים|projects hub/i,
        widget: "projectsHub",
    });
    const shell = widgetShell(page, "projectsHub");
    await expect(shell).toBeVisible({ timeout: 15_000 });

    await ensureHubTabFromDeepLink(shell, /לוח פרויקטים|board/i);
    await page
      .waitForResponse(
        (res) => res.url().includes("/api/projects") && res.request().method() === "GET" && res.ok(),
        { timeout: 30_000 },
      )
      .catch(() => {});

    const projectPicker = shell.getByText(/בחרו פרויקט|Choose a project/i).first();
    const boardColumn = shell.getByText(/לביצוע|To Do|In Progress|בתהליך|בביקורת|Done|הושלם/i).first();
    const boardHeader = shell.getByRole("heading", { name: /לוח ניהול|project board/i }).first();
    const searchField = shell.getByPlaceholder(/חיפוש משימה|search/i).first();
    await expect(projectPicker.or(boardColumn).or(boardHeader).or(searchField)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("projects hub deep link opens board tab", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "projectsHub", tab: "board" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "projectsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await ensureHubTabFromDeepLink(shell, /לוח פרויקטים|board/i);
  });

  // ─── documents hub ────────────────────────────────────────────────────────────

  test("documents hub opens from quick grid", async ({ page }) => {
    await openHubFromLauncher(page, {
      quickGridName: /מסמכים|documents hub/i,
      widget: "documentsHub",
    });
    await expect(widgetShell(page, "documentsHub")).toBeVisible({ timeout: 15_000 });
  });

  test("documents hub has archive, create and scan tabs", async ({ page }) => {
    await openHubFromLauncher(page, {
      quickGridName: /מסמכים|documents hub/i,
      widget: "documentsHub",
    });
    const shell = widgetShell(page, "documentsHub");
    await expect(shell).toBeVisible({ timeout: 15_000 });

    await expect(shell.getByRole("tab", { name: /ארכיון|archive/i })).toBeVisible({ timeout: 10_000 });
    await expect(shell.getByRole("tab", { name: /הפקה|create/i })).toBeVisible({ timeout: 10_000 });
    await expect(shell.getByRole("tab", { name: /סריקה|scan/i })).toBeVisible({ timeout: 10_000 });
  });

  test("documents hub: create tab loads document creator", async ({ page }) => {
    await page.goto(workspaceUrl({ w: "documentsHub", tab: "create" }), {
      waitUntil: "domcontentloaded",
    });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "documentsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const createTab = shell.getByRole("tab", { name: /הפקה|create/i });
    if (await createTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createTab.click();
    }

    await expect(
      shell.getByRole("heading", { name: /מחולל מסמכים חכם|מחולל מסמכים|document creator/i }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("documents hub: scan tab loads scanner", async ({ page }) => {
    await openHubFromLauncher(page, {
      quickGridName: /מסמכים|documents hub/i,
      widget: "documentsHub",
    });
    const shell = widgetShell(page, "documentsHub");
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
    const shell = widgetShell(page, "documentsHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await ensureHubTabFromDeepLink(shell, /סריקה|scan/i);
  });

  // ─── AI hub ───────────────────────────────────────────────────────────────────

  test("AI hub opens and shows chat and notebook tabs", async ({ page }) => {
    // Open AI hub via deep link (may not be in quick grid by default)
    await page.goto(workspaceUrl({ w: "aiHub" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "aiHub");
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
    const shell = widgetShell(page, "aiHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const notebookTab = shell.getByRole("tab", { name: /מחברת|notebook/i });
    await notebookTab.click();

    // Sources sidebar has a "מקורות|Sources" heading
    await expect(
      shell.getByRole("heading", { name: /מקורות|sources/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("AI hub: chat tab shows input", async ({ page }, testInfo) => {
    await page.goto(workspaceUrl({ w: "aiHub" }), { waitUntil: "domcontentloaded" });
    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "aiHub");
    await expect(shell).toBeVisible({ timeout: 20_000 });

    const chatTab = shell.getByRole("tab", { name: /צ.?אט|chat/i });
    await chatTab.click();
    await expect(chatTab).toHaveAttribute("aria-selected", "true");

    const chatInput = shell.getByPlaceholder(/שאל/i).first();
    await expect(chatInput).toBeAttached({ timeout: 15_000 });
    if (testInfo.project.name !== "mobile-chrome") {
      await expect(chatInput).toBeVisible({ timeout: 15_000 });
    }
  });

  // ─── error resilience ─────────────────────────────────────────────────────────

  test("no error boundary triggers when cycling all hub tabs", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Mobile hub tabs blocked by fullscreen shell overlays");
    test.setTimeout(120_000);
    const hubs = [
      { widget: "financeHub",   tabs: [/תזרים|cashflow/i, /סקירה|overview/i] },
      { widget: "projectsHub",  tabs: [/לוח פרויקטים|board/i, /מרכז פרויקט|project/i] },
      { widget: "executiveHub", tabs: [/סקירה|overview/i, /חשבונות קבלנים|subcontractor/i, /הוצאות משרד|office expenses/i] },
      { widget: "documentsHub", tabs: [/ארכיון|archive/i, /הפקה|create/i, /סריקה|scan/i] },
      { widget: "aiHub",        tabs: [/צ.?אט|chat/i, /מחברת|notebook/i] },
    ] as const;

    const errorHeading = page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i });

    for (const { widget, tabs } of hubs) {
      await page.goto(workspaceUrl({ w: widget }), { waitUntil: "domcontentloaded" });
      await dismissWorkspaceOverlays(page);
      const shell = widgetShell(page, widget);
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
