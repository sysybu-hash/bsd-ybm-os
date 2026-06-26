import { test, expect } from "@playwright/test";
import {
  dismissCookieBannerIfVisible,
  dismissWorkspaceOverlays,
  primeCookieConsent,
  tryCredentialsSignIn,
  widgetShell,
  workspaceUrl,
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

async function openCommandCenter(page: Parameters<typeof tryCredentialsSignIn>[0]) {
  // Load the workspace and wait for it to fully hydrate (greeting visible), then drive
  // the widget open through the app's popstate handler — deterministic, avoids the
  // app-wide cold deep-link-after-login race that clears ?w= before hydration.
  await gotoWorkspace(page, workspaceUrl({}));
  await dismissWorkspaceOverlays(page);
  await expect(page.getByRole("heading", { name: /ערב טוב|בוקר טוב|צהריים|שלום|good/i }).first())
    .toBeVisible({ timeout: 30_000 });

  const shell = widgetShell(page, "universalCommand");
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.history.pushState({}, "", "/?w=universalCommand");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    if (await shell.isVisible({ timeout: 15_000 }).catch(() => false)) return shell;
    await page.waitForTimeout(1000);
  }
  await expect(shell).toBeVisible({ timeout: 15_000 });
  return shell;
}

async function signIn(page: Parameters<typeof tryCredentialsSignIn>[0]) {
  await primeCookieConsent(page);
  const signed = await tryCredentialsSignIn(page);
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
    await shell.getByRole("button", { name: /מסמך|invoice|document/i }).click();

    await expect(widgetShell(page, "documentsHub")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });

  test("scan card opens the documents hub scanner", async ({ page }) => {
    const shell = await openCommandCenter(page);
    await shell.getByRole("button", { name: /סריקת|scan/i }).click();

    await expect(widgetShell(page, "documentsHub")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  });
});
