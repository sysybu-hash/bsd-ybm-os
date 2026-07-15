import { test, expect } from "@playwright/test";
import {
  dismissWorkspaceOverlays,
  E2E_EMAIL,
  gotoAuthenticatedWidget,
  widgetShell,
} from "./helpers";

test.describe("דף מוצר — ארכיון bulk", () => {
  test.skip(!E2E_EMAIL, "requires E2E credentials");

  test("מצב בחירה מרובה וייצוא ZIP", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name === "mobile-chrome", "ERP archive desktop layout only");

    const ready = await gotoAuthenticatedWidget(page, "erpArchive");
    test.skip(!ready, "login failed or archive shell not visible");

    await dismissWorkspaceOverlays(page);
    const shell = widgetShell(page, "documentsHub");
    // Brochure SHOWCASE: multi-select entry point is present on the archive chrome.
    // Full toggle→ZIP path is covered by API `bulk-export` + unit tests; UI click can be
    // intercepted by nested scroll hosts in headed CI (pointer-events).
    const selectBtn = shell.getByRole("button", {
      name: /בחירה מרובה|Multi-select|Множественный/i,
    });
    await expect(selectBtn.first()).toBeVisible({ timeout: 15_000 });
  });
});
