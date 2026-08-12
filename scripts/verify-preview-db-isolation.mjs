/**
 * Verify Preview DB credentials are isolated from Production.
 *
 * Reads from env / .env / .env.local:
 *   DATABASE_URL, DIRECT_URL          → treated as Production
 *   PREVIEW_DATABASE_URL, PREVIEW_DIRECT_URL → Preview
 *
 * Compares hostname + database name only (never prints full URLs).
 * Exit 0 = isolated (or Preview unset with warning).
 * Exit 1 = Preview points at the same host/db as Production.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const merged = { ...process.env };
  for (const name of [".env", ".env.local"]) {
    const p = resolve(root, name);
    if (existsSync(p)) Object.assign(merged, dotenv.parse(readFileSync(p, "utf8")));
  }
  return merged;
}

function parseDbIdentity(url) {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url);
    const db = (u.pathname || "/").replace(/^\//, "").split("?")[0] || "";
    return { host: u.hostname.toLowerCase(), db: db.toLowerCase() };
  } catch {
    return null;
  }
}

function label(id) {
  if (!id) return "(unset)";
  return `${id.host}/${id.db || "(default)"}`;
}

const env = loadEnv();
const prod = parseDbIdentity(env.DATABASE_URL);
const prodDirect = parseDbIdentity(env.DIRECT_URL);
const preview = parseDbIdentity(env.PREVIEW_DATABASE_URL);
const previewDirect = parseDbIdentity(
  env.PREVIEW_DIRECT_URL || env.PREVIEW_DATABASE_URL,
);

console.log("Production DATABASE_URL →", label(prod));
console.log("Production DIRECT_URL   →", label(prodDirect));
console.log("Preview DATABASE_URL    →", label(preview));
console.log("Preview DIRECT_URL      →", label(previewDirect));

if (!preview && !previewDirect) {
  console.warn(
    "\nWARN: PREVIEW_DATABASE_URL / PREVIEW_DIRECT_URL unset. Configure an isolated Neon preview branch before pushing Preview env.",
  );
  process.exit(0);
}

let failed = false;
function assertDifferent(name, a, b) {
  if (!a || !b) return;
  if (a.host === b.host && a.db === b.db) {
    console.error(`\nFAIL: ${name} shares host/db with Production (${label(a)})`);
    failed = true;
  }
}

assertDifferent("PREVIEW_DATABASE_URL", preview, prod);
assertDifferent("PREVIEW_DATABASE_URL", preview, prodDirect);
assertDifferent("PREVIEW_DIRECT_URL", previewDirect, prod);
assertDifferent("PREVIEW_DIRECT_URL", previewDirect, prodDirect);

if (failed) {
  console.error(
    "\nPreview must use a separate Neon branch. See docs/RUNBOOK.md and docs/VERCEL-ENV-CHECKLIST.md.",
  );
  process.exit(1);
}

console.log("\nOK: Preview DB identity differs from Production.");
process.exit(0);
