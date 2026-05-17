#!/usr/bin/env node
/**
 * סורק נתיבי app/api — מדווח על routes ללא withWorkspacesAuth/withOSAdmin
 * ועל דליפת details בשגיאות.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API_ROOT = join(process.cwd(), "app", "api");

/** תיקיות שמותר שלא יהיה wrapper (אימות חלופי או ציבורי) */
const SKIP_DIRS = new Set(["auth", "webhooks", "cron", "register", "sign", "org-invite"]);

/** routes ספציפיים ללא wrapper — חייב להיות מתועד */
const ALLOWLIST_NO_WRAPPER = [
  "app/api/locale/route.ts",
  "app/api/analyze-queue/process/route.ts",
  "app/api/integrations/google-calendar/route.ts",
];

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name === "route.ts" || e.name === "route.tsx") acc.push(p);
  }
  return acc;
}

function toRel(file) {
  return file.replace(/\\/g, "/").replace(`${process.cwd().replace(/\\/g, "/")}/`, "");
}

function isSkipped(rel) {
  return [...SKIP_DIRS].some((d) => rel.includes(`/api/${d}/`));
}

function isAllowlisted(rel) {
  return ALLOWLIST_NO_WRAPPER.includes(rel);
}

const files = await walk(API_ROOT);
const unprotected = [];
const hasDetails = [];

for (const file of files) {
  const rel = toRel(file);
  if (isSkipped(rel)) continue;

  const src = await readFile(file, "utf8");
  const hasAuthWrapper =
    src.includes("withWorkspacesAuth") ||
    src.includes("withOSAdmin") ||
    src.includes("withWorkspacesAuthDynamic");

  if (!hasAuthWrapper && !isAllowlisted(rel)) {
    unprotected.push(rel);
  }

  if (/details:\s*(err|error)\.message/.test(src)) {
    hasDetails.push(rel);
  }
}

console.log("=== API audit ===\n");
console.log(`Unprotected routes (need wrapper or allowlist): ${unprotected.length}`);
if (unprotected.length) unprotected.forEach((f) => console.log(`  - ${f}`));
console.log(`\nLeaking details in errors: ${hasDetails.length}`);
if (hasDetails.length) hasDetails.forEach((f) => console.log(`  - ${f}`));

const exitCode = unprotected.length + hasDetails.length > 0 ? 1 : 0;
if (exitCode !== 0) {
  console.error("\nAudit failed. Add withWorkspacesAuth/withOSAdmin or ALLOWLIST_NO_WRAPPER entry.");
}
process.exit(exitCode);
