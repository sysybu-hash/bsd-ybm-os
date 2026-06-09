import { test } from "@playwright/test";
import {
  tryCredentialsSignIn,
  workspaceUrl,
  waitForAuthenticatedWorkspace,
  dismissWorkspaceOverlays,
} from "./helpers";

/**
 * Dev-only mobile screenshot harness (not part of any gate).
 * Logs in ONCE, then opens each widget at a real 390x844 mobile viewport and
 * saves a PNG so layout can be eyeballed without a device.
 *   SHOT_WIDGETS=googleCalendar,documentsHub,aiHub npx playwright test e2e/_mobile-shot.spec.ts --project=chromium
 */
const WIDGETS = (process.env.SHOT_WIDGETS ?? "googleCalendar")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

test.use({ viewport: { width: 390, height: 844 } });

test("mobile shots", async ({ page }) => {
  test.setTimeout(60_000 + WIDGETS.length * 25_000);
  const signed = await tryCredentialsSignIn(page);
  test.skip(!signed, "needs E2E creds");

  for (const w of WIDGETS) {
    await page.goto(workspaceUrl({ w }), { waitUntil: "domcontentloaded" });
    await waitForAuthenticatedWorkspace(page).catch(() => {});
    await dismissWorkspaceOverlays(page).catch(() => {});
    await page
      .locator("[data-widget-shell]")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {});
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `mobile-shot-${w}.png` });
  }
});
