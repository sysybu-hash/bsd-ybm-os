#!/usr/bin/env node
/**
 * Lighthouse על נתיבים ציבוריים.
 *
 * משתנים: LIGHTHOUSE_BASE_URL
 * ארגומנטים:
 *   --base=<url>
 *   --strategy=mobile|desktop  (ברירת מחדל: mobile)
 *   --paths=/,/login  (פסיק; ברירת מחדל: /, /login, /about, /help)
 *   --output=reports/lighthouse.json  (קובץ יחיד לכל הנתיבים — מערך)
 *   --fail-on-budget
 */

import fs from "node:fs";
import path from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const DEFAULT_BASE = "http://127.0.0.1:3000";
const DEFAULT_PATHS = ["/", "/login", "/about", "/help"];

const BUDGET = {
  performance: 1,
  accessibility: 1,
  "best-practices": 1,
  seo: 1,
};

const CATEGORY_KEYS = Object.keys(BUDGET);

function argValue(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function parseBase() {
  const fromEnv = process.env.LIGHTHOUSE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromArg = argValue("--base=");
  if (fromArg) return fromArg.replace(/\/$/, "");
  return DEFAULT_BASE;
}

function parseStrategy() {
  const s = argValue("--strategy=")?.toLowerCase();
  if (s === "desktop" || s === "mobile") return s;
  return "mobile";
}

function parsePaths() {
  const raw = argValue("--paths=");
  if (!raw) return DEFAULT_PATHS;
  return raw.split(",").map((p) => (p.startsWith("/") ? p : `/${p}`));
}

function parseOutput() {
  return argValue("--output=")?.trim() || null;
}

function categoryScores(lhr) {
  const cats = lhr?.categories ?? {};
  const out = {};
  for (const key of CATEGORY_KEYS) {
    const c = cats[key];
    out[key] = typeof c?.score === "number" ? c.score : null;
  }
  return out;
}

function auditMetrics(lhr) {
  const a = lhr?.audits ?? {};
  const lcp = a["largest-contentful-paint"]?.numericValue;
  const cls = a["cumulative-layout-shift"]?.numericValue;
  const tbt = a["total-blocking-time"]?.numericValue;
  return {
    lcpMs: typeof lcp === "number" ? Math.round(lcp) : null,
    cls: typeof cls === "number" ? cls : null,
    tbtMs: typeof tbt === "number" ? Math.round(tbt) : null,
  };
}

async function main() {
  const base = parseBase();
  const strategy = parseStrategy();
  const paths = parsePaths();
  const outputPath = parseOutput();
  const failOnBudget = process.argv.includes("--fail-on-budget");

  console.log(
    `[lighthouse-sample] base=${base} strategy=${strategy} paths=${paths.join(", ")}`,
  );

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });

  let exitCode = 0;
  const reportBundle = [];

  try {
    for (const pathname of paths) {
      const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`).href;
      process.stdout.write(`  → ${url} (${strategy}) ... `);

      const runnerResult = await lighthouse(url, {
        logLevel: "error",
        output: "json",
        port: chrome.port,
        onlyCategories: CATEGORY_KEYS,
        formFactor: strategy,
        screenEmulation:
          strategy === "mobile"
            ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
            : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
      });

      const lhr = runnerResult?.lhr;
      const scores = categoryScores(lhr);
      const metrics = auditMetrics(lhr);

      const parts = Object.entries(scores)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}:${Math.round(v * 100)}`);
      const metricPart = [
        metrics.lcpMs != null ? `LCP=${metrics.lcpMs}ms` : null,
        metrics.cls != null ? `CLS=${metrics.cls.toFixed(3)}` : null,
        metrics.tbtMs != null ? `TBT=${metrics.tbtMs}ms` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`${parts.join(" ")} ${metricPart}`.trim());

      reportBundle.push({
        url,
        pathname,
        strategy,
        fetchedAt: new Date().toISOString(),
        scores,
        metrics,
        categories: lhr?.categories,
      });

      if (failOnBudget) {
        for (const [key, min] of Object.entries(BUDGET)) {
          const s = scores[key];
          if (s != null && s < min) {
            console.error(
              `    ✗ ${key} ${Math.round(s * 100)} < ${Math.round(min * 100)} (budget)`,
            );
            exitCode = 1;
          }
        }
      }
    }
  } catch (e) {
    console.error("[lighthouse-sample] failed:", e?.message ?? e);
    exitCode = failOnBudget ? 1 : 0;
  }

  if (outputPath && reportBundle.length > 0) {
    const abs = path.isAbsolute(outputPath)
      ? outputPath
      : path.join(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(reportBundle, null, 2), "utf8");
    console.log(`[lighthouse-sample] wrote ${abs}`);
  }

  try {
    await chrome.kill();
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (e?.code === "EPERM" && process.platform === "win32") {
      console.warn(
        "[lighthouse-sample] chrome temp cleanup skipped (Windows EPERM) — results above are still valid",
      );
    } else {
      console.warn(`[lighthouse-sample] chrome cleanup: ${msg}`);
    }
  }

  if (!failOnBudget && exitCode === 0) {
    console.log(
      "[lighthouse-sample] done (exit 0; use --fail-on-budget to enforce min score 100)",
    );
  }

  process.exit(exitCode);
}

main();
