#!/usr/bin/env node
/**
 * דוגמת Lighthouse על נתיבים ציבוריים (דורש dev server ברקע).
 * ברירת מחדל: http://127.0.0.1:3000 — נתיבים: /, /login, /product
 *
 * משתנה סביבה: LIGHTHOUSE_BASE_URL (דורס ברירת מחדל)
 * ארגומנטים: --base=<url> | --fail-on-budget (יציאה 1 אם ציון קטגוריה מתחת לסף)
 */

import lighthouse from "lighthouse";
import chromeLauncher from "chrome-launcher";

const DEFAULT_BASE = "http://127.0.0.1:3000";
const PATHS = ["/", "/login", "/product"];

/** סף מינימלי לכל קטגוריה כש־--fail-on-budget (0–1) */
const BUDGET = {
  performance: 0.75,
  accessibility: 0.85,
  "best-practices": 0.85,
  seo: 0.85,
};

function parseBase() {
  const fromEnv = process.env.LIGHTHOUSE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const arg = process.argv.find((a) => a.startsWith("--base="));
  if (arg) return arg.slice("--base=".length).replace(/\/$/, "");
  return DEFAULT_BASE;
}

function categoryScores(lhr) {
  const cats = lhr?.categories ?? {};
  const out = {};
  for (const key of Object.keys(BUDGET)) {
    const c = cats[key];
    out[key] = typeof c?.score === "number" ? c.score : null;
  }
  return out;
}

async function main() {
  const base = parseBase();
  const failOnBudget = process.argv.includes("--fail-on-budget");

  console.log(`[lighthouse-sample] base=${base} paths=${PATHS.join(", ")}`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });

  let exitCode = 0;

  try {
    for (const path of PATHS) {
      const url = new URL(path, base.endsWith("/") ? base : `${base}/`).href;
      process.stdout.write(`  → ${url} ... `);

      const runnerResult = await lighthouse(url, {
        logLevel: "error",
        output: "json",
        port: chrome.port,
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      });

      const lhr = runnerResult?.lhr;
      const scores = categoryScores(lhr);

      const parts = Object.entries(scores)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}:${Math.round(v * 100)}`);

      console.log(parts.join(" "));

      if (failOnBudget) {
        for (const [key, min] of Object.entries(BUDGET)) {
          const s = scores[key];
          if (s != null && s < min) {
            console.error(`    ✗ ${key} ${Math.round(s * 100)} < ${Math.round(min * 100)} (budget)`);
            exitCode = 1;
          }
        }
      }
    }
  } catch (e) {
    console.error("[lighthouse-sample] failed:", e?.message ?? e);
    exitCode = failOnBudget ? 1 : 0;
  } finally {
    await chrome.kill();
  }

  if (!failOnBudget && exitCode === 0) {
    console.log("[lighthouse-sample] done (exit 0; use --fail-on-budget to enforce thresholds)");
  }

  process.exit(exitCode);
}

main();
