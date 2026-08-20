#!/usr/bin/env node
/**
 * Soft guard against new hardcoded Tailwind palette classes in components/os/widgets/**.
 * Widgets should use the design tokens (--surface-*, --border-*, --foreground-*,
 * --accent / --win-accent, --state-*) so dark mode and the classic theme stay
 * consistent. Semantic status colors (success/warning/danger dots, chart legends)
 * are fine — this is a warning, not a hard build failure.
 *
 * Usage: node scripts/audit-hardcoded-palette.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "components", "os", "widgets");
const PATTERN = /\b(?:bg|text|border|ring|shadow|from|via|to)-(red|green|blue|indigo|purple|amber|emerald|rose|slate|violet|teal|orange|sky|pink|cyan|yellow|lime|fuchsia)-\d{2,3}\b/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
let totalHits = 0;
const perFile = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const matches = src.match(PATTERN);
  if (matches?.length) {
    perFile.push([relative(process.cwd(), file), matches.length]);
    totalHits += matches.length;
  }
}

perFile.sort((a, b) => b[1] - a[1]);

console.log(`Hardcoded palette audit — components/os/widgets/**`);
console.log(`Files scanned: ${files.length}`);
console.log(`Files with hits: ${perFile.length}`);
console.log(`Total occurrences: ${totalHits}\n`);

for (const [file, count] of perFile.slice(0, 30)) {
  console.log(`  ${String(count).padStart(4)}  ${file}`);
}
if (perFile.length > 30) {
  console.log(`  ... and ${perFile.length - 30} more files`);
}

console.log(
  "\nThis is a soft guard (exit 0) — treat rising totals as a signal to convert the\n" +
    "touched file to design tokens (see app/globals.css accent-rule comment) rather\n" +
    "than a blocker. Run before/after a PR to see if your change added new debt.",
);
