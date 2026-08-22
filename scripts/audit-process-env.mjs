#!/usr/bin/env node
/**
 * שער: כל קריאה ישירה ל-process.env מחוץ ל-shim המותרים היא הפרה של כלל 4
 * ב-CLAUDE.md — קוראים דרך `import { env } from "@/lib/env"`.
 *
 * NODE_ENV מוחרג במכוון. הוא אינו קונפיגורציה אלא דגל build-time שהבאנדלר
 * מטביע, והוא הערך היחיד שגם קוד לקוח קורא: `lib/logger.ts` מיובא
 * מקומפוננטות לקוח, ושם אסור לגעת ב-env השרתי (ראו audit:client-env).
 * מעבר ל-env.NODE_ENV בקבצים האלה היה שובר את באנדל הלקוח.
 *
 * יציאה 1 כשיש הפרות — נקרא מ-`npm run verify`.
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
/** דגל build-time, לא קונפיגורציה — ראו ההסבר בראש הקובץ. */
const ALLOW_VARS = new Set(["NODE_ENV"]);

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
    const matches = (text.match(RE) ?? []).filter(
      (m) => !ALLOW_VARS.has(m.slice("process.env.".length)),
    );
    if (matches.length === 0) continue;
    counts.set(file, (counts.get(file) ?? 0) + matches.length);
    total += matches.length;
  }
}

const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log("=== process.env audit ===\n");
console.log(`Total references (excl. allowlist): ${total}`);
console.log(`Files with references: ${counts.size}\n`);
for (const [file, n] of top) {
  console.log(`  ${String(n).padStart(3)}  ${file}`);
}
if (total > 0) {
  console.log("\nכלל 4 ב-CLAUDE.md: קראו דרך import { env } from '@/lib/env'.");
  console.log("אם הקובץ נטען גם בלקוח — אל תוסיפו env; הוסיפו נימוק ל-ALLOW_FILES.");
  process.exit(1);
}
console.log("No direct process.env reads outside the allowed shims.");
