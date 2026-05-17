import type { Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo!2026";

const COOKIE_CONSENT_KEY = "bsd-ybm-cookie-consent-v1";

/** מונע חסימת קליקים מבאנר העוגיות בבדיקות E2E */
export async function primeCookieConsent(page: Page) {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        necessary: true,
        analytics: true,
        marketing: true,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, COOKIE_CONSENT_KEY);
}

export async function tryCredentialsSignIn(page: Page): Promise<boolean> {
  try {
    await primeCookieConsent(page);
    await page.goto("/login");
    const ok = await page.evaluate(
      async ({ email, password }) => {
        const csrf = (await fetch(`${window.location.origin}/api/auth/csrf`).then((r) => r.json())) as {
          csrfToken: string;
        };
        const body = new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email,
          password,
          callbackUrl: `${window.location.origin}/`,
          json: "true",
        });
        const res = await fetch(`${window.location.origin}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        return res.ok;
      },
      { email: E2E_EMAIL, password: E2E_PASSWORD },
    );
    if (!ok) return false;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    return true;
  } catch {
    return false;
  }
}

export async function dismissCookieBannerIfVisible(page: Page) {
  const accept = page.getByRole("button", { name: /קבל את כל העוגיות|Accept all cookies/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}
