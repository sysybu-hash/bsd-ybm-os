import { test } from "@playwright/test";
import { gotoAuthenticatedWidget } from "./helpers";

/**
 * Dev-only mobile screenshot harness (not part of any gate).
 * Opens a widget at a real 390×844 mobile viewport and saves a PNG so layout
 * can be eyeballed without a physical device.
 *   SHOT_WIDGET=googleCalendar npx playwright test e2e/_mobile-shot.spec.ts --project=chromium
 */
const WIDGET = process.env.SHOT_WIDGET ?? "googleCalendar";

test.use({ viewport: { width: 390, height: 844 } });

test(`mobile shot — ${WIDGET}`, async ({ page }) => {
  const ok = await gotoAuthenticatedWidget(page, WIDGET);
  test.skip(!ok, "login/widget failed (needs E2E creds + seed)");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `mobile-shot-${WIDGET}.png` });
});
