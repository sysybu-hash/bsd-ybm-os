import { test, expect } from "@playwright/test";

/**
 * Regression cover for the production outage where the cookie consent banner —
 * a full-width `fixed inset-x-0 bottom-0 z-[99990]` wrapper — swallowed clicks
 * on the register wizard's "next" button. On mobile the banner card sat over
 * the button with no scroll left, so a new visitor could never get past step 1
 * and never reached the email field on step 3.
 *
 * These run with the consent banner deliberately left OPEN, since that is the
 * state every first-time visitor is in.
 */

// The UI language is negotiated from Accept-Language (lib/i18n/negotiate.ts).
// Pin it so these assertions don't depend on the runner's default locale.
test.use({ locale: "he-IL" });

const NEXT = "המשך";

type Page = import("@playwright/test").Page;

/**
 * Fresh visitor: no stored consent, so the banner renders.
 *
 * The wizard is loaded via next/dynamic, so the markup can be present and
 * clickable before React has attached its handlers. The consent banner only
 * appears from a client effect that reads localStorage, which makes it a
 * reliable "client is live" signal to wait on before driving the wizard.
 */
async function gotoRegister(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.goto("/login?mode=register");
  await expect(consentBanner(page)).toBeVisible();
  await expect(page.getByText("שלב 1 מתוך 6")).toBeVisible();
}

function consentBanner(page: Page) {
  return page.locator('[role="dialog"][aria-labelledby="cookie-banner-title"]');
}

/**
 * Click "next" and require the wizard to land on `expectedStep`. A click that
 * arrives in the gap before hydration is silently dropped, so retry rather than
 * fail on a lost first click.
 */
async function advanceTo(page: Page, expectedStep: number) {
  const marker = page.getByText(`שלב ${expectedStep} מתוך 6`);
  await expect(async () => {
    await page.getByRole("button", { name: NEXT }).click();
    await expect(marker).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Click "next" and require the wizard to stay put (validation rejected it). */
async function expectBlockedAt(page: Page, step: number) {
  await page.getByRole("button", { name: NEXT }).click();
  await expect(page.getByText(`שלב ${step} מתוך 6`)).toBeVisible();
}

test("the consent banner does not cover the register wizard's next button", async ({ page }) => {
  await gotoRegister(page);

  const next = page.getByRole("button", { name: NEXT });
  await expect(next).toBeVisible();
  await next.scrollIntoViewIfNeeded();

  // The button must be the element that actually receives a click at its centre.
  const box = await next.boundingBox();
  expect(box).not.toBeNull();
  const hitsTheButton = await page.evaluate(
    ({ x, y, width, height }) => {
      const el = document.elementFromPoint(x + width / 2, y + height / 2);
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "המשך",
      );
      return !!el && !!btn && (btn === el || btn.contains(el));
    },
    box!,
  );
  expect(hitsTheButton, "consent banner is intercepting clicks on the next button").toBe(true);
});

test("a first-time visitor can reach the email field with the banner open", async ({ page }) => {
  await gotoRegister(page);

  // Step 1 -> 2 -> 3, banner still up the whole way.
  await advanceTo(page, 2);
  await advanceTo(page, 3);
  await expect(consentBanner(page)).toBeVisible();

  const email = page.locator('input[type="email"]');
  await expect(email).toBeVisible();
  await expect(email).toBeEditable();
  await expect(email).toHaveAttribute("placeholder", /@/);

  await email.fill("new.user@example.com");
  await expect(email).toHaveValue("new.user@example.com");
});

test("an invalid email is rejected on its own step, not at the summary", async ({ page }) => {
  await gotoRegister(page);
  await advanceTo(page, 2);
  await advanceTo(page, 3);

  // Empty email must not advance.
  await expectBlockedAt(page, 3);

  // Nor an address the server's regex would reject.
  await page.locator('input[type="email"]').fill("no-domain@example");
  await expectBlockedAt(page, 3);

  // A valid one advances.
  await page.locator('input[type="email"]').fill("new.user@example.com");
  await advanceTo(page, 4);
});
