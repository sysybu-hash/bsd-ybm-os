/**
 * Public-pages accessibility regression guard.
 *
 * Runs @axe-core against every marketing / unauthenticated page.
 * On first local run, violations are saved as the baseline.
 * On subsequent runs (and always in CI), only NEW violations fail the test.
 *
 * Target: 0 critical/serious violations on all listed pages.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";

// ─── baseline persistence ────────────────────────────────────────────────────

const BASELINE_PATH = path.resolve(process.cwd(), "e2e", "a11y-public-baseline.json");

type PublicA11yBaseline = Record<string, { ruleId: string; impact: string; description: string }[]>;

function readBaseline(): PublicA11yBaseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as PublicA11yBaseline;
  } catch {
    return {};
  }
}

function saveBaseline(baseline: PublicA11yBaseline): void {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf8");
}

function newViolations(key: string, violations: Result[], baseline: PublicA11yBaseline): Result[] {
  const knownIds = new Set((baseline[key] ?? []).map((e) => e.ruleId));
  return violations.filter((v) => !knownIds.has(v.id));
}

// ─── axe config ──────────────────────────────────────────────────────────────

/** WCAG 2.0/2.1 A + AA — the set Lighthouse measures */
const AXE_TAGS: string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CRITICAL_IMPACTS = new Set(["critical", "serious"]);

// ─── pages under test ────────────────────────────────────────────────────────

const PUBLIC_PAGES: { key: string; path: string; label: string; waitFor?: string }[] = [
  {
    key: "home",
    path: "/",
    label: "דף הבית (marketing)",
    waitFor: ".mkt-hero-title",
  },
  {
    key: "about",
    path: "/about",
    label: "אודות",
  },
  // /pricing is not yet a standalone route (content served via marketing panel)
  // {
  //   key: "pricing",
  //   path: "/pricing",
  //   label: "תמחור",
  // },
  {
    key: "login",
    path: "/login",
    label: "כניסה",
  },
  {
    key: "contact",
    path: "/contact",
    label: "צור קשר",
  },
  {
    key: "privacy",
    path: "/privacy",
    label: "פרטיות",
  },
  {
    key: "terms",
    path: "/terms",
    label: "תנאי שימוש",
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Dismiss the cookie consent banner if it's visible — it can cover content and affect axe. */
async function dismissCookieBanner(page: import("@playwright/test").Page): Promise<void> {
  try {
    const banner = page.locator("[data-cookie-banner],[aria-label*='cookie'],[aria-label*='עוגיות']").first();
    if (await banner.isVisible({ timeout: 2_000 })) {
      const acceptBtn = banner.locator("button").first();
      await acceptBtn.click({ timeout: 2_000 }).catch(() => {});
      await banner.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    }
  } catch {
    // banner not present — continue
  }
}

// ─── test suite ──────────────────────────────────────────────────────────────

test.describe("Public pages accessibility — axe WCAG 2.x audit", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    // Ensure Hebrew locale so all translated content renders
    await context.addCookies([{ name: "bsd-locale", value: "he", url: origin }]);
  });

  for (const { key, path: pagePath, label, waitFor } of PUBLIC_PAGES) {
    test(`no new critical/serious violations — ${label} (${pagePath})`, async ({
      page,
    }, testInfo) => {
      // Desktop Chromium only — mobile is covered by Lighthouse CI
      test.skip(testInfo.project.name !== "chromium", "desktop Chromium only");

      await page.goto(pagePath, { waitUntil: "domcontentloaded" });

      // Wait for key above-fold content when specified
      if (waitFor) {
        await page.locator(waitFor).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      }

      await dismissCookieBanner(page);

      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        // Exclude third-party iframes that we can't control
        .exclude("iframe[src*='paypal'],iframe[src*='google']")
        .analyze();

      const baseline = readBaseline();

      // First local run — seed the baseline, don't fail
      if (baseline[key] === undefined && !process.env.CI) {
        baseline[key] = results.violations.map((v) => ({
          ruleId: v.id,
          impact: v.impact ?? "unknown",
          description: v.description,
        }));
        saveBaseline(baseline);
        console.log(`[a11y-public] Seeded baseline for "${label}": ${results.violations.length} violation(s)`);
        return;
      }

      const regressions = newViolations(key, results.violations, baseline).filter((v) =>
        CRITICAL_IMPACTS.has(v.impact ?? ""),
      );

      if (regressions.length > 0) {
        const details = regressions
          .map(
            (v) =>
              `  [${v.impact}] ${v.id}: ${v.description}\n` +
              v.nodes.slice(0, 3).map((n) => `    → ${n.html}`).join("\n"),
          )
          .join("\n");
        expect.soft(regressions.length, `axe regressions on ${pagePath}:\n${details}`).toBe(0);
      }

      // Hard fail if the total critical/serious count doubled vs baseline
      const baselineCount = (baseline[key] ?? []).filter((e) =>
        CRITICAL_IMPACTS.has(e.impact),
      ).length;
      const currentCount = results.violations.filter((v) => CRITICAL_IMPACTS.has(v.impact ?? ""))
        .length;

      expect(
        currentCount,
        `Total critical/serious violations on ${pagePath} (${currentCount}) must not exceed 2× baseline (${baselineCount})`,
      ).toBeLessThanOrEqual(Math.max(baselineCount * 2, baselineCount + 3));
    });
  }
});
