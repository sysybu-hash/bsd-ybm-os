import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AxeResults, Result } from "axe-core";
import { dismissCookieBannerIfVisible, dismissWorkspaceOverlays, ensureHubTabFromDeepLink, tryCredentialsSignIn, widgetShell, workspaceUrl } from "./helpers";

const BASELINE_PATH = path.resolve(process.cwd(), "e2e", "a11y-baseline.json");

type A11yBaseline = Record<
  string,
  { ruleId: string; impact: string; description: string }[]
>;

function readBaseline(): A11yBaseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as A11yBaseline;
  } catch {
    return {};
  }
}

function saveBaseline(baseline: A11yBaseline) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf8");
}

function toCatalogEntries(violations: Result[]) {
  return violations.map((v) => ({
    ruleId: v.id,
    impact: v.impact ?? "unknown",
    description: v.description,
  }));
}

/** Returns violations that are NOT already in the baseline for this key. */
function newViolations(
  key: string,
  violations: Result[],
  baseline: A11yBaseline,
): Result[] {
  const baselineIds = new Set(
    (baseline[key] ?? []).map((e) => e.ruleId),
  );
  return violations.filter((v) => !baselineIds.has(v.id));
}

// ─── shared axe config ───────────────────────────────────────────────────────
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CRITICAL_IMPACTS = new Set(["critical", "serious"]);

// ─── widget smoke URLs ───────────────────────────────────────────────────────
const WIDGET_ROUTES: { key: string; url: string; label: string }[] = [
  { key: "workspace-chrome",  url: "/",                        label: "עצם סביבת עבודה" },
  { key: "dashboard",         url: workspaceUrl({ w: "dashboard" }), label: "דאשבורד" },
  { key: "crm",               url: workspaceUrl({ w: "crmTable" }), label: "CRM לקוחות" },
  { key: "ai-chat",           url: workspaceUrl({ w: "aiChatFull" }), label: "צ'אט AI" },
  { key: "project-board",     url: workspaceUrl({ w: "projectsHub", tab: "project" }), label: "מרכז פרויקט" },
  { key: "scanner",           url: workspaceUrl({ w: "aiScanner" }), label: "סורק AI" },
  { key: "drive",             url: workspaceUrl({ w: "googleDrive" }), label: "Google Drive" },
];

const WIDGET_SHELL_IDS: Record<string, string> = {
  dashboard: "financeHub",
  crm: "crmTable",
  "ai-chat": "aiHub",
  "project-board": "projectsHub",
  scanner: "documentsHub",
  drive: "googleDrive",
};

const WIDGET_ENSURE_TABS: Partial<Record<string, RegExp>> = {
  dashboard: /סקירה|overview/i,
  "ai-chat": /צ.?אט|chat/i,
  scanner: /סריקה|scan/i,
};

async function signInWithRetries(page: Parameters<typeof tryCredentialsSignIn>[0]): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const signed = await tryCredentialsSignIn(page);
    if (signed) return true;
    await page.waitForTimeout(500 + attempt * 500);
  }
  return false;
}

// ─── test suite ──────────────────────────────────────────────────────────────
test.describe("Workspace accessibility — axe audit per widget", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    await context.addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
  });

  for (const { key, url, label } of WIDGET_ROUTES) {
    test(`no new critical/serious axe violations — ${label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "דסקטופ בלבד");

      const signed = await signInWithRetries(page);
      expect(signed, "משתמש E2E חייב להיות זמין בבדיקות 10/10").toBeTruthy();

      await page.setViewportSize({ width: 1280, height: 900 });
      await dismissCookieBannerIfVisible(page);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await dismissWorkspaceOverlays(page);
      if (key !== "workspace-chrome") {
        const widgetId = WIDGET_SHELL_IDS[key];
        const ensureTab = WIDGET_ENSURE_TABS[key];
        if (widgetId) {
          const shell = widgetShell(page, widgetId);
          await shell.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
          if (ensureTab) {
            await ensureHubTabFromDeepLink(shell, ensureTab);
          }
        }
      }

      const axeBuilder = new AxeBuilder({ page }).withTags(AXE_TAGS);
      let results: AxeResults;
      if (key === "workspace-chrome") {
        results = await axeBuilder
          .exclude(".os-utility-rail-host")
          .exclude("[data-widget-shell]")
          .exclude("[data-testid='mobile-bottom-nav']")
          .analyze();
      } else {
        const widgetId = WIDGET_SHELL_IDS[key];
        const shell = widgetId ? widgetShell(page, widgetId) : page.locator("[data-widget-shell]").last();
        await shell.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        const shellId = await shell.getAttribute("id");
        const includeSelector = shellId
          ? `[id="${shellId}"]`
          : `[data-widget-shell][id^="${widgetId}-"]`;
        results = await axeBuilder.include(includeSelector).analyze();
      }

      const baseline = readBaseline();

      // Persist violations to baseline on first run (local only — not in CI)
      if (!baseline[key] && !process.env.CI) {
        baseline[key] = toCatalogEntries(results.violations);
        saveBaseline(baseline);
      }

      const blocking = results.violations.filter((v) =>
        CRITICAL_IMPACTS.has(v.impact ?? ""),
      );

      if (blocking.length > 0) {
        const summary = blocking
          .map((v) => `  [${v.impact}] ${v.id}: ${v.description}`)
          .join("\n");
        expect(
          blocking,
          `Critical/Serious ב-${label} (יעד 10/10: 0):\n${summary}`,
        ).toHaveLength(0);
      }

      // רגרסיה: אין הופעה חדשה שלא ב-baseline (Moderate+)
      const newCritical = newViolations(key, results.violations, baseline).filter(
        (v) => CRITICAL_IMPACTS.has(v.impact ?? ""),
      );
      expect(newCritical, `דפקטים Critical/Serious חדשים ב-${label}`).toHaveLength(0);

      // Attach full report as artifact
      await testInfo.attach(`axe-${key}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
    });
  }

  // ─── consolidated baseline-update helper ───────────────────────────────────
  test("baseline: dump all widget violations (run once to update baseline)", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.UPDATE_A11Y_BASELINE,
      "רק כשמריצים עם UPDATE_A11Y_BASELINE=1",
    );
    test.skip(testInfo.project.name !== "chromium", "דסקטופ בלבד");

    const signed = await signInWithRetries(page);
    expect(signed, "משתמש E2E חייב להיות זמין לבניית baseline").toBeTruthy();
    await dismissCookieBannerIfVisible(page);

    const newBaseline: A11yBaseline = {};

    for (const { key, url } of WIDGET_ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await dismissWorkspaceOverlays(page);
      await page.waitForTimeout(1500);
      const results: AxeResults = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .analyze();
      newBaseline[key] = toCatalogEntries(results.violations);
    }

    saveBaseline(newBaseline);
    console.log(`✅ Baseline saved to ${BASELINE_PATH}`);
    expect(Object.keys(newBaseline).length).toBeGreaterThan(0);
  });
});
