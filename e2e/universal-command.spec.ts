import { test, expect } from "@playwright/test";
import {
  E2E_COMMAND_EMAIL,
  dismissCookieBannerIfVisible,
  clickReportingOverlap,
  dismissWorkspaceOverlays,
  primeCookieConsent,
  signInAsSpecUser,
  tryCredentialsSignIn,
  widgetShell,
  workspaceUrl,
} from "./helpers";

/**
 * These tests share one seeded account and each begins by resetting that
 * account's server-side workspace layout. With fullyParallel they run
 * concurrently in separate workers, so one test wipes the layout while another
 * is opening a window — the click then lands on a shell that is being torn
 * down and Playwright reports "subtree intercepts pointer events".
 *
 * `default` runs them sequentially within this file without the cascade-skip
 * that `serial` adds, so a single failure still reports the rest.
 */
test.describe.configure({ mode: "default" });

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

async function openCommandCenter(page: Parameters<typeof tryCredentialsSignIn>[0]) {
  // The greeting heading only renders when no windows are open — reset the
  // persisted layout first (other specs sharing this seeded account leave
  // windows open server-side).
  await page.request.patch("/api/user/workspace-layout", { data: { widgets: [] } });

  // Load the workspace and wait for it to fully hydrate (greeting visible), then drive
  // the widget open through the app's popstate handler — deterministic, avoids the
  // app-wide cold deep-link-after-login race that clears ?w= before hydration.
  await gotoWorkspace(page, workspaceUrl({}));
  await dismissWorkspaceOverlays(page);
  await expect(page.getByRole("heading", { name: /ערב טוב|בוקר טוב|צהריים|לילה טוב|שלום|good/i }).first())
    .toBeVisible({ timeout: 30_000 });

  const shell = widgetShell(page, "universalCommand");
  const allShells = page.locator('[data-widget-shell][id^="universalCommand-"]');

  /**
   * The retry used to dispatch popstate unconditionally. `openWidget` appends a
   * new window every time, so when the first open took longer than the 15s
   * probe — which it does on a loaded machine — the retry opened a *second*
   * command centre. Two shells then overlap, `widgetShell` resolves `.last()`,
   * and the click lands on the other window's card:
   *
   *   [e2e] click on "command centre scan card" was blocked.
   *     on top: <h3 class="text-base font-semibold ...">; widget shells mounted: 2
   *
   * Playwright reported the button as visible, enabled and stable throughout,
   * because it was — just not on top. Re-dispatching only when nothing is open
   * makes the retry idempotent.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await allShells.count()) === 0) {
      await page.evaluate(() => {
        window.history.pushState({}, "", "/?w=universalCommand");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    }
    if (await shell.isVisible({ timeout: 15_000 }).catch(() => false)) break;
    await page.waitForTimeout(1000);
  }

  // `.last()` is only meaningful while there is exactly one, so assert it
  // rather than letting a duplicate turn into an unexplained click timeout.
  await expect(allShells).toHaveCount(1);
  await expect(shell).toBeVisible({ timeout: 15_000 });
  return shell;
}

async function signIn(page: Parameters<typeof tryCredentialsSignIn>[0]) {
  await primeCookieConsent(page);
  const signed = await signInAsSpecUser(page, E2E_COMMAND_EMAIL);
  await dismissCookieBannerIfVisible(page);
  if (!signed) test.skip(true, "E2E credentials not configured");
  await dismissWorkspaceOverlays(page);
  return signed;
}

test.describe("universal command center", () => {
  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    testInfo.setTimeout(120_000);
    const origin = baseURL ?? "http://localhost:3001";
    await page.context().addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
    await signIn(page);
  });

  test("opens from deep link and shows all four action cards", async ({ page }, testInfo) => {
    const shell = await openCommandCenter(page);

    await expect(shell.getByRole("heading", { name: /מרכז בקרה|command center/i })).toBeVisible({
      timeout: 10_000,
    });

    // 4 action cards, each an accessible button
    await expect(shell.getByRole("button", { name: /פרויקט חדש|new project/i })).toBeVisible();
    await expect(shell.getByRole("button", { name: /מסמך|invoice|document/i })).toBeVisible();
    await expect(shell.getByRole("button", { name: /סריקת|scan/i })).toBeVisible();
    await expect(shell.getByRole("button", { name: /מחולל|builder/i })).toBeVisible();

    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);

    // Visual artifact for manual review
    await testInfo.attach("command-center", {
      body: await shell.screenshot(),
      contentType: "image/png",
    });
  });

  test("document card opens the documents hub", async ({ page }) => {
    const shell = await openCommandCenter(page);
    await clickReportingOverlap(
      shell.getByRole("button", { name: /מסמך|invoice|document/i }),
      "command centre document card",
    );

    await expect(widgetShell(page, "documentsHub")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("scan card opens the documents hub scanner", async ({ page }) => {
    const shell = await openCommandCenter(page);
    await clickReportingOverlap(
      shell.getByRole("button", { name: /סריקת|scan/i }),
      "command centre scan card",
    );

    await expect(widgetShell(page, "documentsHub")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });
});
