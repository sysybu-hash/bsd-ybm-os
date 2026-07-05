import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  dismissWorkspaceOverlays,
  signInWithRetries,
  tryProjectMgrSignIn,
  waitForAuthenticatedWorkspace,
} from "./helpers";

/**
 * פורטל רו"ח — RBAC. תפקיד ACCOUNTANT מלא דורש seed לאחר מיגרציית ה-enum,
 * לכן כאן נבדק מה שניתן ללא משתמש-רו"ח: מנהל ארגון רשאי להציץ בפורטל,
 * ומנהל-פרויקט (לא מורשה) מנותב החוצה.
 */
test.describe("accountant portal RBAC", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
  });

  test("org admin can preview the accountant portal", async ({ page }) => {
    const signed = await signInWithRetries(page);
    test.skip(!signed, "login failed");
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);

    await page.goto("/accountant", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "פורטל רואה חשבון" })).toBeVisible({
      timeout: 30_000,
    });
    // אזור ייצוא הנה"ח + כפתור ייצוא
    await expect(page.getByRole("button", { name: /ייצא/ })).toBeVisible({ timeout: 15_000 });
    // הידרציה + טעינת נתונים: מקטעי המסמכים/הוצאות מופיעים אחרי ה-fetch
    await expect(page.getByRole("heading", { name: /מסמכים שהופקו/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /הוצאות/ })).toBeVisible({ timeout: 15_000 });
  });

  test("project manager is redirected away from the accountant portal", async ({ page }) => {
    const signed = await tryProjectMgrSignIn(page);
    test.skip(!signed, "PM login failed (seed pm@bsd-demo.test)");
    await waitForAuthenticatedWorkspace(page);
    await dismissWorkspaceOverlays(page);

    await page.goto("/accountant", { waitUntil: "domcontentloaded" });
    // הגייט בשרת מנתב ל-/workspace — לא אמורים לראות את כותרת הפורטל
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
      .not.toBe("/accountant");
    await expect(page.getByRole("heading", { name: "פורטל רואה חשבון" })).toHaveCount(0);
  });
});
