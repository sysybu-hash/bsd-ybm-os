import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/** Navigates and retries on Firefox NS_BINDING_ABORTED / "interrupted by another navigation". */
async function safeGoto(
  page: Page,
  url: string,
  waitUntil: "load" | "domcontentloaded" | "commit" = "load",
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("NS_BINDING_ABORTED") ||
        msg.includes("interrupted by another navigation") ||
        msg.includes("frame was detached");
      if (attempt < 2 && retryable) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(400);
        continue;
      }
      throw err;
    }
  }
}

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo!2026";
export const E2E_PM_EMAIL = process.env.E2E_PM_EMAIL ?? "pm@bsd-demo.test";
export const E2E_PM_PASSWORD = process.env.E2E_PM_PASSWORD ?? E2E_PASSWORD;

export type E2eCredentials = { email: string; password: string };

function readSeedMarker(): {
  e2eProjectId?: string;
  e2eContactId?: string;
  e2eOfficeExpenseId?: string;
} {
  try {
    const p = path.resolve(process.cwd(), ".e2e-demo-seeded.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as {
      e2eProjectId?: string;
      e2eContactId?: string;
      e2eOfficeExpenseId?: string;
    };
  } catch {
    return {};
  }
}

const seedMarker = readSeedMarker();

export const E2E_PROJECT_ID = process.env.E2E_PROJECT_ID ?? seedMarker.e2eProjectId ?? "";
export const E2E_CONTACT_ID = process.env.E2E_CONTACT_ID ?? seedMarker.e2eContactId ?? "";
export const E2E_OFFICE_EXPENSE_ID =
  process.env.E2E_OFFICE_EXPENSE_ID ?? seedMarker.e2eOfficeExpenseId ?? "";

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
import { FIRST_DAY_WIZARD_STORAGE_KEY } from "@/lib/onboarding/first-day-wizard-constants";

const FIRST_DAY_WIZARD_KEY = FIRST_DAY_WIZARD_STORAGE_KEY;
const LAUNCHER_V2_BANNER_KEY = "bsd_ybm_launcher_v2_banner_seen";
const LAUNCHER_STORAGE_KEY = "bsd_ybm_launcher_v2";

/** מונע מודל Passkey ואשף יום ראשון מלחסום קליקים ב-E2E. */
export async function primeE2eBrowserStorage(page: Page) {
  await page.addInitScript(
    ({ passkeyKey, wizardKey, launcherBannerKey, launcherStorageKey, layoutKeys, layoutPrefix }) => {
      try {
        localStorage.setItem(passkeyKey, "1");
        localStorage.setItem(wizardKey, "dismissed");
        localStorage.setItem(launcherBannerKey, "1");
        localStorage.setItem(launcherStorageKey, "{}");
        for (const k of layoutKeys) localStorage.removeItem(k);
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const key = localStorage.key(i);
          if (key?.startsWith(layoutPrefix)) localStorage.removeItem(key);
        }
      } catch {
        /* ignore */
      }
    },
    {
      passkeyKey: PASSKEY_OFFER_KEY,
      wizardKey: FIRST_DAY_WIZARD_KEY,
      launcherBannerKey: LAUNCHER_V2_BANNER_KEY,
      launcherStorageKey: LAUNCHER_STORAGE_KEY,
      layoutKeys: [
        "bsd_ybm_layout_quiet_v6",
        "bsd_ybm_layout_quiet_v5",
        "bsd_ybm_layout_quiet_v3",
        "bsd_ybm_layout_quiet_v4",
        "bsd_ybm_layout_snapshot_session",
      ],
      layoutPrefix: "bsd_ybm_layout_quiet_v7:",
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
  await expect
    .poll(
      () => {
        try {
          return !new URL(page.url()).pathname.includes("/login");
        } catch {
          return false;
        }
      },
      { timeout: 30_000, message: "Expected to leave login route" },
    )
    .toBe(true);

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

/** Scoped widget shell — topmost window for the given widget type (avoids strict-mode multi-match). */
export function widgetShell(page: Page, widgetId: string) {
  return page.locator(`[data-widget-shell][id^="${widgetId}-"]`).last();
}

/** Waits until the hub shell shows the expected tab as selected (deep links can lag). */
export async function expectHubTabSelected(shell: Locator, tabName: RegExp): Promise<void> {
  await expect
    .poll(
      async () => {
        const text = (await shell.getByRole("tab", { selected: true }).textContent()) ?? "";
        return tabName.test(text);
      },
      { timeout: 20_000, message: `Expected selected hub tab matching ${tabName}` },
    )
    .toBe(true);
}

/** Waits for executive hub shell and the office-expenses tab to be active. */
export async function waitForExecutiveHubOfficeExpenses(page: Page) {
  const shell = widgetShell(page, "executiveHub");
  await expect(shell).toBeVisible({ timeout: 30_000 });
  const tab = shell.getByRole("tab", { name: /הוצאות משרד|office expenses/i });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
}

/** סלקטור לחלון פרויקטים / מרכז שליטה (hub או standalone). */
export function projectWorkspaceShell(page: Page) {
  return page.locator("[data-widget-shell]").first();
}

/** פותח ווידג'ט פרויקט מה-URL ומחכה ל-shell + תוכן דשבורד. */
export async function gotoWorkspaceProject(page: Page, projectId: string) {
  const shellTimeout = process.env.CI ? 45_000 : 30_000;

  for (let attempt = 0; attempt < 3; attempt++) {
    await safeGoto(page, workspaceProjectUrl(projectId));
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);
    try {
      await page.waitForURL(/[?&]w=(project|projectsHub)/, { timeout: 20_000 });
    } catch {
      /* continue */
    }
    if (await projectWorkspaceShell(page).isVisible({ timeout: shellTimeout }).catch(() => false)) {
      if (await expectProjectDashboardReady(page, { soft: true })) return;
    }

    const launcherTile = page.getByTestId("launcher-tile-project");
    if (await launcherTile.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click, then wait for the click-triggered navigation to settle before navigating ourselves
      await launcherTile.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await safeGoto(page, workspaceProjectUrl(projectId));
      await dismissWorkspaceOverlays(page);
      if (await projectWorkspaceShell(page).isVisible({ timeout: shellTimeout }).catch(() => false)) {
        if (await expectProjectDashboardReady(page, { soft: true })) return;
      }
    }
  }

  await expectProjectDashboardReady(page);
}

/** מחכה שווידג'ט מרכז השליטה לפרויקט נפתח (לא דורש השלמת fetch לדשבורד). */
export async function expectProjectDashboardReady(
  page: Page,
  opts?: { soft?: boolean },
): Promise<boolean> {
  const shell = projectWorkspaceShell(page);
  const projectContent = page
    .getByRole("tab", { name: /מרכז פרויקט|Project control|control center/i })
    .or(page.locator("[data-widget-shell] h2").first());

  if (opts?.soft) {
    const ok =
      (await shell.isVisible({ timeout: 30_000 }).catch(() => false)) &&
      (await projectContent.isVisible({ timeout: 15_000 }).catch(() => false)) &&
      (await page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i }).count()) === 0;
    return ok;
  }

  await expect(shell).toBeVisible({ timeout: 30_000 });
  await expect(projectContent).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i })).toHaveCount(0);
  return true;
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

async function hasAuthenticatedSession(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return false;
    const data = (await res.json()) as { user?: { email?: string } };
    return Boolean(data.user?.email);
  });
}

async function ensureAuthenticatedWorkspace(page: Page): Promise<boolean> {
  if (!(await hasAuthenticatedSession(page))) return false;
  if (new URL(page.url()).pathname.includes("/login")) return false;
  try {
    await waitForAuthenticatedWorkspace(page);
    return true;
  } catch {
    return false;
  }
}

async function credentialsSignInViaApi(page: Page, credentials: E2eCredentials): Promise<boolean> {
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
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (data?.error) return false;
      if (data?.url) {
        await fetch(data.url, { credentials: "include" });
      }
      const session = await fetch("/api/auth/session", { credentials: "include" }).then((r) => r.json());
      return Boolean((session as { user?: { email?: string } }).user?.email);
    },
    credentials,
  );
  return ok;
}

async function credentialsSignInViaUi(page: Page, credentials: E2eCredentials): Promise<boolean> {
  const emailInput = page
    .getByPlaceholder(/אימייל|email/i)
    .or(page.getByLabel(/אימייל|email/i))
    .first();
  const passwordInput = page
    .getByPlaceholder(/סיסמה|password/i)
    .or(page.getByLabel(/סיסמה|password/i))
    .first();
  const submit = page.locator('form button[type="submit"]').first();

  if (!(await emailInput.isVisible({ timeout: 12_000 }).catch(() => false))) {
    return false;
  }
  await emailInput.fill(credentials.email);
  await passwordInput.fill(credentials.password);
  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 35_000 });
  return hasAuthenticatedSession(page);
}

export async function signInWithRetries(
  page: Page,
  attempts = 4,
  credentials: E2eCredentials = { email: E2E_EMAIL, password: E2E_PASSWORD },
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const signed = await tryCredentialsSignIn(page, credentials);
    if (signed) {
      try {
        await waitForAuthenticatedApiSession(page);
        return true;
      } catch {
        /* session cookie not ready yet — retry sign-in */
      }
    }
    await page.waitForTimeout(600 + attempt * 600);
  }
  return false;
}

/** ממתין ל-session cookie לפני קריאות API ב-E2E. */
export async function waitForAuthenticatedApiSession(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/auth/session");
        if (!res.ok()) return false;
        const data = (await res.json()) as { user?: { email?: string } };
        return Boolean(data.user?.email);
      },
      { timeout: 30_000, message: "Expected authenticated API session" },
    )
    .toBe(true);
}

export async function tryCredentialsSignIn(
  page: Page,
  credentials: E2eCredentials = { email: E2E_EMAIL, password: E2E_PASSWORD },
): Promise<boolean> {
  try {
    await primeCookieConsent(page);
    await primeE2eBrowserStorage(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    if (await credentialsSignInViaApi(page, credentials)) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      if (await ensureAuthenticatedWorkspace(page)) {
        await dismissWorkspaceOverlays(page);
        return true;
      }
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    }

    if (await ensureAuthenticatedWorkspace(page)) {
      await dismissWorkspaceOverlays(page);
      return true;
    }

    if (await credentialsSignInViaUi(page, credentials)) {
      if (!(await ensureAuthenticatedWorkspace(page))) return false;
      await dismissWorkspaceOverlays(page);
      return true;
    }

    return false;
  } catch (err) {
    if (process.env.DEBUG_E2E_SIGNIN) {
      console.error("[e2e] tryCredentialsSignIn failed:", err);
    }
    return false;
  }
}

/** התחברות כמשתמש PROJECT_MGR (pm@bsd-demo.test אחרי seed). */
export async function tryProjectMgrSignIn(page: Page): Promise<boolean> {
  return tryCredentialsSignIn(page, { email: E2E_PM_EMAIL, password: E2E_PM_PASSWORD });
}

/** כפתור Hub ברשת המהירה (לא אייקון בסרגל הצד). */
export function hubQuickGridButton(page: Page, name: RegExp) {
  return page.getByRole("listitem").filter({ has: page.getByRole("button", { name }) }).getByRole("button").first();
}

/** פותח Hub מהרשת המהירה, או deep link אם האריח לא מוצג (למשל פיננסים בתעשיית בנייה). */
export async function openHubFromLauncher(
  page: Page,
  opts: { quickGridName: RegExp; widget: string; tab?: string },
): Promise<void> {
  const btn = hubQuickGridButton(page, opts.quickGridName);
  if (await btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await btn.click();
    return;
  }
  const url = opts.tab
    ? workspaceUrl({ w: opts.widget, tab: opts.tab })
    : workspaceUrl({ w: opts.widget });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await dismissWorkspaceOverlays(page);
}

export async function openFinanceHub(page: Page): Promise<void> {
  await openHubFromLauncher(page, {
    quickGridName: /פיננסים|finance/i,
    widget: "financeHub",
  });
}

/** פותח Hub כלשהו לבדיקות shell — מעדיף אריח זמין ברשת המהירה. */
export async function openAnyHubFromQuickGrid(page: Page): Promise<void> {
  const candidates = [
    /מרכז מנהל|executive/i,
    /פיננסים|finance/i,
    /פרויקטים|projects hub/i,
    /מסמכים|documents hub/i,
  ];
  for (const name of candidates) {
    const btn = hubQuickGridButton(page, name);
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await btn.click();
      return;
    }
  }
  await openFinanceHub(page);
}

/** מחכה שהווידג'ט סיים טעינה ומציג UI אינטראקטיבי (לא רק shell ריק). */
export async function waitForBrochureWidgetReady(page: Page, widgetId: string): Promise<void> {
  const loading = page.locator("[data-widget-shell]").getByText(/טוען|Loading|Загрузка/i);
  await loading.first().waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});

  const errorHeading = page.getByRole("heading", { name: /אירעה תקלה|Something went wrong/i });
  await expect(errorHeading).toHaveCount(0, { timeout: 5_000 });

  switch (widgetId) {
    case "dashboard":
    case "financeHub":
      await expect(
        page.getByRole("button", { name: /ייצוא CSV|Export CSV/i }).first(),
      ).toBeVisible({ timeout: 45_000 });
      break;
    case "crmTable":
      await waitForCrmContactsLoaded(page);
      await expect(
        page.getByRole("button", { name: /ייצוא CSV|Export CSV/i }).first(),
      ).toBeVisible({ timeout: 45_000 });
      break;
    case "erpArchive":
      await expect(
        page.getByRole("button", {
          name: /בחירה מרובה|Multi-select|Множественный/i,
        }).first(),
      ).toBeVisible({ timeout: 45_000 });
      break;
    default:
      await page.locator("[data-widget-shell]").first().waitFor({ state: "visible", timeout: 30_000 });
  }
}

/** ניווט לווידג'ט workspace אחרי התחברות (בדיקות product-brochure וכו'). */
export async function gotoAuthenticatedWidget(
  page: Page,
  widgetId: string,
): Promise<boolean> {
  const signed = await tryCredentialsSignIn(page);
  if (!signed) return false;

  await dismissCookieBannerIfVisible(page);
  await dismissWorkspaceOverlays(page);
  await safeGoto(page, workspaceUrl({ w: widgetId }));
  await waitForAuthenticatedWorkspace(page);
  await dismissWorkspaceOverlays(page);

  const shell = page.locator("[data-widget-shell]").first();
  const shellVisible = await shell.waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
  if (!shellVisible) return false;

  try {
    await waitForBrochureWidgetReady(page, widgetId);
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

/** סוגר מודלים שחוסמים את ה-workspace אחרי כניסה ראשונה (Passkey, אשף onboarding). */
export async function dismissWorkspaceOverlays(page: Page) {
  const migrationBanner = page.getByTestId("launcher-v2-migration-banner");
  if (await migrationBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
    const dismissBtn = migrationBanner.getByRole("button", { name: /הבנתי|Got it|Close|סגירה/i });
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click();
    } else {
      await migrationBanner.locator("button").first().click();
    }
    await migrationBanner.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }

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
  if (await wizard.isVisible({ timeout: 5000 }).catch(() => false)) {
    const skip = wizard.getByRole("button", { name: /דלג|Skip/i });
    const dismiss = wizard.getByRole("button", { name: /סגור|Close/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    } else if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click();
    }
    await wizard.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }
}
