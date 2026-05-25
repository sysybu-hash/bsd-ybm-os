#!/usr/bin/env node
/**
 * Compare workspace-shell locale JSON key parity (he as source).
 * Usage: node scripts/i18n-key-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const locales = ["he", "en", "ru"];
const base = "messages/workspace-shell";

function flatten(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const sub of flatten(v, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

const files = Object.fromEntries(
  locales.map((loc) => {
    const p = path.join(root, `${base}.${loc}.json`);
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return [loc, flatten(data)];
  }),
);

const source = files.he;
let exitCode = 0;

for (const loc of ["en", "ru"]) {
  const target = files[loc];
  const missing = [...source].filter((k) => !target.has(k));
  const extra = [...target].filter((k) => !source.has(k));
  const parity =
    missing.length === 0 && extra.length === 0
      ? 100
      : Math.round(
          ((source.size - missing.length) / source.size) * 100,
        );
  console.log(`\n${loc.toUpperCase()} parity vs he: ${parity}% (${source.size} keys)`);
  if (missing.length) {
    console.log(`  Missing (${missing.length}):`);
    missing.slice(0, 20).forEach((k) => console.log(`    - ${k}`));
    if (missing.length > 20) console.log(`    ... +${missing.length - 20} more`);
    exitCode = 1;
  }
  if (extra.length) {
    console.log(`  Extra (${extra.length}):`);
    extra.slice(0, 10).forEach((k) => console.log(`    + ${k}`));
  }
}

process.exit(exitCode);
