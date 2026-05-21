import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo!2026";

function readSeedMarker(): { e2eProjectId?: string; e2eContactId?: string } {
  try {
    const p = path.resolve(process.cwd(), ".e2e-demo-seeded.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as { e2eProjectId?: string; e2eContactId?: string };
  } catch {
    return {};
  }
}

const seedMarker = readSeedMarker();

export const E2E_PROJECT_ID = process.env.E2E_PROJECT_ID ?? seedMarker.e2eProjectId ?? "";
export const E2E_CONTACT_ID = process.env.E2E_CONTACT_ID ?? seedMarker.e2eContactId ?? "";

/** Canonical workspace URL at `/` with query params (use `w` for widget type). */
export function workspaceUrl(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return q ? `/?${q}` : "/";
}

export function workspaceProjectUrl(projectId: string): string {
  return workspaceUrl({ w: "project", projectId });
}

const COOKIE_CONSENT_KEY = "bsd-ybm-cookie-consent-v1";

const PASSKEY_OFFER_KEY = "bsd-passkey-offer-dismissed";
const FIRST_DAY_WIZARD_KEY = "bsd_ybm_first_day_wizard_v1";

/** מונע מודל Passkey ואשף יום ראשון מלחסום קליקים ב-E2E. */
export async function primeE2eBrowserStorage(page: Page) {
  await page.addInitScript(
    ({ passkeyKey, wizardKey, layoutKeys }) => {
      try {
        localStorage.setItem(passkeyKey, "1");
        localStorage.setItem(wizardKey, "dismissed");
        for (const k of layoutKeys) localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
    {
      passkeyKey: PASSKEY_OFFER_KEY,
      wizardKey: FIRST_DAY_WIZARD_KEY,
      layoutKeys: [
        "bsd_ybm_layout_quiet_v6",
        "bsd_ybm_layout_quiet_v5",
        "bsd_ybm_layout_quiet_v3",
        "bsd_ybm_layout_quiet_v4",
        "bsd_ybm_layout_snapshot_session",
      ],
    },
  );
}

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

/** מחכה שה-workspace נטען אחרי התחברות (לא דף נחיתה / login). */
export async function waitForAuthenticatedWorkspace(page: Page) {
  const sidebar = page.getByRole("navigation", { name: /יישומים|Apps/i });
  const mobileNav = page.getByTestId("mobile-bottom-nav");
  const workspaceNav = page.getByRole("complementary", { name: /Workspace navigation|ניווט/i });
  const hubGreeting = page.getByRole("heading", {
    name: /Good (morning|afternoon|evening)|בוקר טוב|צהריים טובים|ערב טוב/i,
  });
  await expect(sidebar.or(mobileNav).or(workspaceNav).or(hubGreeting).first()).toBeVisible({
    timeout: 30000,
  });
}

/** פותח ווידג'ט פרויקט מה-URL ומחכה ל-shell. */
export async function gotoWorkspaceProject(page: Page, projectId: string) {
  const shellTimeout = process.env.CI ? 90_000 : 60_000;
  const projectShell = page.locator("[data-widget-shell]").first();
  const projectHub = page.getByText(/מרכז פיננסי|Financial hub/i).first();
  const target = projectShell.or(projectHub);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(workspaceProjectUrl(projectId));
    await page.waitForLoadState("domcontentloaded");
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);
    try {
      await page.waitForURL(/[?&]w=project/, { timeout: 20_000 });
    } catch {
      /* continue */
    }
    if (await target.isVisible({ timeout: shellTimeout }).catch(() => false)) {
      return;
    }

    const launcherTile = page.getByTestId("launcher-tile-project");
    if (await launcherTile.isVisible({ timeout: 5000 }).catch(() => false)) {
      await launcherTile.click();
      await page.goto(workspaceProjectUrl(projectId));
      await page.waitForLoadState("domcontentloaded");
      await dismissWorkspaceOverlays(page);
      if (await target.isVisible({ timeout: shellTimeout }).catch(() => false)) {
        return;
      }
    }
  }

  await expect(target).toBeVisible({ timeout: 15_000 });
}

/** מחכה שווידג'ט מרכז הבקרה לפרויקט נפתח (לא דורש השלמת fetch לדשבורד). */
export async function expectProjectDashboardReady(page: Page) {
  await expect(
    page.getByRole("region", { name: /Project control center|מרכז בקרה/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
}

/** מחכה שטעינת `/api/crm/contacts` הצליחה (לא מסך «נדרשת התחברות»). */
export async function waitForCrmContactsLoaded(page: Page) {
  const authError = page.getByRole("alert").filter({ hasText: /נדרשת התחברות|login required/i });
  const retry = page.getByRole("button", { name: /נסה שוב|Retry/i });

  for (let attempt = 0; attempt < 4; attempt++) {
    const waitLoaded = page.waitForResponse(
      (res) => res.url().includes("/api/crm/contacts") && res.request().method() === "GET" && res.ok(),
      { timeout: 45_000 },
    );
    if (await authError.isVisible().catch(() => false)) {
      if (await retry.isVisible().catch(() => false)) {
        await Promise.all([waitLoaded, retry.click()]);
      } else {
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitLoaded;
      }
    } else {
      await waitLoaded;
    }
    if (!(await authError.isVisible().catch(() => false))) return;
  }

  await expect(authError).toHaveCount(0, { timeout: 5000 });
}

export async function tryCredentialsSignIn(page: Page): Promise<boolean> {
  try {
    await primeCookieConsent(page);
    await primeE2eBrowserStorage(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const emailInput = page.getByPlaceholder(/אימייל|email/i).first();
    const passwordInput = page.getByPlaceholder(/סיסמה|password/i).first();
    const submit = page.locator('form button[type="submit"]').first();

    if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
      await emailInput.fill(E2E_EMAIL);
      await passwordInput.fill(E2E_PASSWORD);
      await submit.click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
      await waitForAuthenticatedWorkspace(page);
      await dismissWorkspaceOverlays(page);
      return true;
    }

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
          credentials: "include",
          body,
        });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as { url?: string } | null;
        if (data?.url) {
          await fetch(data.url, { credentials: "include" });
        }
        return true;
      },
      { email: E2E_EMAIL, password: E2E_PASSWORD },
    );
    if (!ok) return false;
    await page.goto("/");
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);
    return true;
  } catch (err) {
    if (process.env.DEBUG_E2E_SIGNIN) {
      console.error("[e2e] tryCredentialsSignIn failed:", err);
    }
    return false;
  }
}

export async function dismissCookieBannerIfVisible(page: Page) {
  const accept = page.getByRole("button", { name: /קבל את כל העוגיות|Accept all cookies/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

/** סוגר מודלים שחוסמים את ה-workspace אחרי כניסה ראשונה (Passkey, אשף onboarding). */
export async function dismissWorkspaceOverlays(page: Page) {
  const passkeyDialog = page.locator('[aria-labelledby="passkey-offer-title"]');
  try {
    await passkeyDialog.waitFor({ state: "visible", timeout: 4000 });
    const later = passkeyDialog.getByRole("button", { name: /אולי אחר כך|Maybe later/i });
    const close = passkeyDialog.getByRole("button", { name: /סגירה|Close/i });
    if (await later.isVisible().catch(() => false)) {
      await later.click();
    } else if (await close.isVisible().catch(() => false)) {
      await close.click();
    }
    await passkeyDialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  } catch {
    /* passkey offer not shown */
  }

  const wizard = page.getByTestId("first-day-wizard");
  if (await wizard.isVisible({ timeout: 2000 }).catch(() => false)) {
    const skip = wizard.getByRole("button", { name: /דלג|Skip/i });
    const dismiss = wizard.getByRole("button", { name: /סגור|Close/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click();
    }
  }
}
