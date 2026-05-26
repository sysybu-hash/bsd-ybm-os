#!/usr/bin/env node
/**
 * סופר שימושים ב-process.env מחוץ ל-shim מותרים (מידע ל-mסלול 10/10).
 * יציאה 0 תמיד — לא חוסם CI; השתמשו ב-verify לשערים קשיחים.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["lib", "app", "components", "hooks"];
const ALLOW_FILES = new Set([
  "lib/env.ts",
  "lib/core/site-url.ts",
  "lib/normalize-nextauth-url-env.ts",
  "lib/prisma.ts",
]);

const RE = /process\.env\.[A-Z0-9_]+/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (name === "node_modules" || name.startsWith(".")) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}

const counts = new Map();
let total = 0;

for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    if (ALLOW_FILES.has(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const matches = text.match(RE);
    if (!matches) continue;
    counts.set(file, (counts.get(file) ?? 0) + matches.length);
    total += matches.length;
  }
}

const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log("=== process.env audit (informational) ===\n");
console.log(`Total references (excl. allowlist): ${total}`);
console.log(`Files with references: ${counts.size}\n`);
for (const [file, n] of top) {
  console.log(`  ${String(n).padStart(3)}  ${file}`);
}
console.log("\nיעד מסלול 10/10: מיגרציה הדרגתית ל-import { env } from '@/lib/env'");
