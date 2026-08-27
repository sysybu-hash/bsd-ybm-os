#!/usr/bin/env node
/**
 * Report TS/TSX files over a line threshold under components/ and lib/.
 * Usage:
 *   node scripts/lib-line-count.mjs [--min 300]
 *   node scripts/lib-line-count.mjs [--min 300] [--allowlist path/to/allowlist.txt]
 *   node scripts/lib-line-count.mjs [--top 10]
 *
 * The headline figure is `top-N mass`: the total number of lines in the N
 * largest logic files.
 *
 * It replaced a plain count of files >= 300 lines, which was a bad target. Three
 * rounds of splitting took the biggest files from 456/400/385 down to 414/301/323
 * and added 18 tests where there had been none — and the count sat at 27-28
 * throughout, because a file that lands on 301 or 323 is just as "over 300" as
 * one at 456. The count only moves when a file crosses the threshold, which
 * rewards shaving a line off a 301-line file and ignores a genuine 456 -> 414.
 *
 * Mass moves whenever the code actually gets smaller, so partial progress shows
 * up. The count is still printed, because "how many files are over the line" is
 * worth seeing — it just is not the thing to steer by.
 *
 * See docs/LIB-SPLIT-BACKLOG.md.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const argv = process.argv.slice(2);

function readArg(flag) {
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split("=")[1];
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

const minLines = Number.parseInt(readArg("--min") ?? "300", 10);
const allowlistPath = readArg("--allowlist");
const topN = Number.parseInt(readArg("--top") ?? "10", 10);

/** Intentionally large locale/CSS/data dumps — excluded from logic count. */
const DEFAULT_BULK_OK = [
  /^lib\/help-center\/content\.[a-z]{2}\.ts$/,
  /^lib\/i18n\/keys\.ts$/,
  /^lib\/construction-trades-patches\.ts$/,
  /^lib\/pdf\/product-brochure-v2-styles\.ts$/,
  /^lib\/pdf\/brochure-styles\//,
  /^lib\/pdf\/product-brochure-html\.ts$/,
  /^lib\/pdf\/product-brochure-html-styles\.ts$/,
  /^lib\/pdf\/marketing-onepager-html\.ts$/,
  /^lib\/pdf\/system-specification-html\.ts$/,
  /^lib\/pdf\/invoice-print-html\.ts$/,
  /**
   * The pdfmake sibling of product-brochure-html.ts above — the same document,
   * expressed as pdfmake content definitions instead of HTML. It was an
   * oversight that one form of it counted and the other did not.
   */
  /^lib\/pdf\/product-brochure-pdfmake\.ts$/,
  /**
   * The environment schema: 142 Zod declarations against 21 lines of logic.
   * CLAUDE.md §4 requires every new variable to be declared here, so this file
   * exists precisely to be the one place they all live. Splitting it to satisfy
   * a line count would scatter the source of truth the rule depends on.
   */
  /^lib\/env\.ts$/,
];

function loadAllowlistPatterns() {
  const patterns = [...DEFAULT_BULK_OK];
  if (!allowlistPath) return patterns;
  const abs = path.isAbsolute(allowlistPath) ? allowlistPath : path.join(root, allowlistPath);
  if (!fs.existsSync(abs)) {
    console.error(`Allowlist not found: ${abs}`);
    process.exit(1);
  }
  const extra = fs
    .readFileSync(abs, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const entry of extra) {
    patterns.push(new RegExp(entry.replace(/\\/g, "/")));
  }
  return patterns;
}

const bulkOkPatterns = loadAllowlistPatterns();

function isBulkOk(relPosix) {
  return bulkOkPatterns.some((re) => re.test(relPosix));
}

const dirs = ["components", "lib"];
const results = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(full);
      continue;
    }
    if (!/\.(tsx?)$/.test(name)) continue;
    const text = fs.readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/).length;
    if (lines >= minLines) {
      const rel = path.relative(root, full).replace(/\\/g, "/");
      results.push({ lines, rel, bulkOk: isBulkOk(rel) });
    }
  }
}

for (const d of dirs) {
  const abs = path.join(root, d);
  if (fs.existsSync(abs)) walk(abs);
}

results.sort((a, b) => b.lines - a.lines);

const logicResults = results.filter((r) => !r.bulkOk);

const top = logicResults.slice(0, topN);
const mass = top.reduce((sum, r) => sum + r.lines, 0);

console.log(`Files with >= ${minLines} lines`);
console.log(`  raw count:   ${results.length}`);
console.log(`  logic count: ${logicResults.length} (excluding bulk OK)`);
console.log(
  `  top-${top.length} mass: ${mass} lines  <- the number to steer by; ` +
    `it drops whenever a large file shrinks, not only when one crosses ${minLines}\n`,
);

for (const r of results) {
  const tag = r.bulkOk ? " [bulk OK]" : "";
  console.log(`${String(r.lines).padStart(5)}  ${r.rel}${tag}`);
}
