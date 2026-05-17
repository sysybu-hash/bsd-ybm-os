#!/usr/bin/env node
/**
 * סורק נתיבי app/api — מדווח על getServerSession ללא withWorkspacesAuth ועל details בשגיאות.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API_ROOT = join(process.cwd(), "app", "api");
const SKIP_DIRS = new Set(["auth", "webhooks", "cron", "register", "sign", "org-invite"]);

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name === "route.ts" || e.name === "route.tsx") acc.push(p);
  }
  return acc;
}

function isSkipped(file) {
  const rel = file.replace(/\\/g, "/");
  return [...SKIP_DIRS].some((d) => rel.includes(`/api/${d}/`));
}

const files = await walk(API_ROOT);
const noWrapper = [];
const hasDetails = [];
const usesSession = [];

for (const file of files) {
  if (isSkipped(file)) continue;
  const src = await readFile(file, "utf8");
  const rel = file.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "");

  if (src.includes("getServerSession")) usesSession.push(rel);
  const hasAuthWrapper =
    src.includes("withWorkspacesAuth") || src.includes("withOSAdmin");
  if (!hasAuthWrapper && src.includes("getServerSession")) {
    noWrapper.push(rel);
  }
  if (/details:\s*(err|error)\.message/.test(src)) {
    hasDetails.push(rel);
  }
}

console.log("=== API audit ===\n");
console.log(`Routes with getServerSession (excl. skipped): ${usesSession.length}`);
console.log(`Missing withWorkspacesAuth: ${noWrapper.length}`);
if (noWrapper.length) noWrapper.forEach((f) => console.log(`  - ${f}`));
console.log(`\nLeaking details in errors: ${hasDetails.length}`);
if (hasDetails.length) hasDetails.forEach((f) => console.log(`  - ${f}`));
process.exit(noWrapper.length + hasDetails.length > 0 ? 1 : 0);
