#!/usr/bin/env node
/**
 * Report TS/TSX files over a line threshold under components/ and lib/.
 * Usage: node scripts/lib-line-count.mjs [--min 300]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const minLines = Number.parseInt(
  process.argv.find((a) => a.startsWith("--min="))?.split("=")[1] ??
    process.argv[process.argv.indexOf("--min") + 1] ??
    "300",
  10,
);

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
      results.push({ lines, rel: path.relative(root, full) });
    }
  }
}

for (const d of dirs) {
  const abs = path.join(root, d);
  if (fs.existsSync(abs)) walk(abs);
}

results.sort((a, b) => b.lines - a.lines);
console.log(`Files with >= ${minLines} lines: ${results.length}\n`);
for (const r of results) {
  console.log(`${String(r.lines).padStart(5)}  ${r.rel}`);
}
