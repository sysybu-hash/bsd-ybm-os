#!/usr/bin/env node
/**
 * Aggregate Lighthouse matrix JSON into docs/PAGESPEED-MATRIX.md
 *
 * Usage:
 *   node scripts/lighthouse-report-summary.mjs
 *   node scripts/lighthouse-report-summary.mjs --input-dir=reports/pagespeed
 */

import fs from "node:fs";
import path from "node:path";

function argValue(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function scorePct(score) {
  if (score == null) return "—";
  return String(Math.round(score * 100));
}

function loadRuns(inputDir) {
  if (!fs.existsSync(inputDir)) return [];
  const summaries = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith("-summary.json"))
    .sort()
    .reverse();

  if (summaries.length > 0) {
    const seen = new Set();
    const merged = [];
    for (const file of summaries) {
      const raw = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
      const rows = Array.isArray(raw) ? raw : [raw];
      for (const row of rows) {
        const key = `${row.pathname}|${row.strategy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
      }
    }
    return merged;
  }

  return fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(".json") && !f.includes("summary"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(inputDir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildMarkdown(runs, inputDir) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    "# PageSpeed Matrix — bsd-ybm.co.il",
    "",
    `עודכן: **${now}** · מקור: \`${inputDir}\``,
    "",
    "## טבלת ציונים",
    "",
    "| נתיב | שכבה | עדיפות | אסטרטגיה | Perf | A11y | BP | SEO | LCP | TBT |",
    "|------|------|--------|----------|------|------|----|-----|-----|-----|",
  ];

  for (const r of runs) {
    if (r.error) {
      lines.push(`| ${r.pathname} | ${r.tier ?? "—"} | ${r.priority ?? "—"} | ${r.strategy} | ERROR | — | — | — | — | — |`);
      continue;
    }
    const s = r.scores ?? {};
    const m = r.metrics ?? {};
    lines.push(
      `| ${r.pathname} | ${r.tier ?? "—"} | ${r.priority ?? "—"} | ${r.strategy} | ${scorePct(s.performance)} | ${scorePct(s.accessibility)} | ${scorePct(s["best-practices"])} | ${scorePct(s.seo)} | ${m.lcpMs ?? "—"} | ${m.tbtMs ?? "—"} |`,
    );
  }

  const below100 = runs.filter((r) => {
    if (r.error || !r.scores) return false;
    return CATEGORY_KEYS.some((k) => r.scores[k] != null && r.scores[k] < 1);
  });

  lines.push("", "## מתחת ל-100", "");
  if (below100.length === 0) {
    lines.push("_כל הריצות ב-100 (או אין נתונים)._");
  } else {
    for (const r of below100) {
      const parts = CATEGORY_KEYS.map((k) => {
        const v = r.scores[k];
        return v != null && v < 1 ? `${k}:${scorePct(v)}` : null;
      }).filter(Boolean);
      lines.push(`- **${r.pathname}** (${r.strategy}): ${parts.join(", ")}`);
      for (const fa of r.failedAudits ?? []) {
        lines.push(`  - ${fa.id}: ${fa.title} (${scorePct(fa.score)})`);
      }
    }
  }

  lines.push(
    "",
    "## הרצה",
    "",
    "```bash",
    "npm run lighthouse:matrix:prod -- --tier=public --priority=P0 --strategy=both",
    "npm run lighthouse:auth-setup -- --base=http://127.0.0.1:3000",
    "npm run lighthouse:matrix -- --base=http://127.0.0.1:3000 --tier=auth --priority=P0",
    "npm run lighthouse:report",
    "```",
    "",
  );

  return lines.join("\n");
}

const CATEGORY_KEYS = ["performance", "accessibility", "best-practices", "seo"];

function main() {
  const inputDir = path.join(process.cwd(), argValue("--input-dir=") ?? "reports/pagespeed");
  const outPath = path.join(process.cwd(), "docs", "PAGESPEED-MATRIX.md");

  const runs = loadRuns(inputDir);
  if (runs.length === 0) {
    console.warn(`[lighthouse-report] no runs in ${inputDir}`);
    process.exit(0);
  }

  const md = buildMarkdown(runs, inputDir);
  fs.writeFileSync(outPath, md, "utf8");
  console.log(`[lighthouse-report] wrote ${outPath} (${runs.length} runs)`);
}

main();
