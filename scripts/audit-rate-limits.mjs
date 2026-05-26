#!/usr/bin/env node
/**
 * בודק שכל route ציבורי/רגיש מוגן ב-rate-limit.
 * routes עם withWorkspacesAuth מקבלים default ב-api-handler (2026-05-26).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API_ROOT = join(process.cwd(), "app", "api");

const SKIP_DIRS = new Set(["cron"]);

/** routes שחייבים applyRateLimit מפורש (IP) או rateLimit ב-wrapper */
const PUBLIC_SENSITIVE = new Set([
  "auth",
  "register",
  "sign",
  "webhooks",
  "org-invite",
]);

const STREAM_ALLOWLIST = [
  "app/api/notifications/feed/stream/route.ts",
  "app/api/scan/tri-engine/stream/route.ts",
  "app/api/erp/project-notebook/chat-stream/route.ts",
];

/** routes ציבוריים מתועדים ב-audit-api-routes ALLOWLIST */
const PUBLIC_ALLOWLIST = [
  "app/api/analyze-queue/process/route.ts",
  "app/api/scan/share/route.ts",
  "app/api/og/route.tsx",
  "app/api/locale/route.ts",
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

function segmentAfterApi(rel) {
  const m = rel.match(/app\/api\/([^/]+)/);
  return m?.[1] ?? "";
}

const files = await walk(API_ROOT);
const missing = [];

for (const file of files) {
  const rel = toRel(file);
  const seg = segmentAfterApi(rel);
  if (SKIP_DIRS.has(seg)) continue;

  const src = await readFile(file, "utf8");
  const hasApply = src.includes("applyRateLimit");
  const hasWorkspace = src.includes("withWorkspacesAuth");
  const hasOsAdmin = src.includes("withOSAdmin");
  const hasExplicitRl =
    src.includes("rateLimit:") || src.includes("rateLimit :") || hasApply;
  const streamOptOut = src.includes("rateLimit: false");

  if (hasWorkspace || hasOsAdmin) {
    if (STREAM_ALLOWLIST.includes(rel) && !streamOptOut) {
      missing.push({ rel, reason: "SSE route needs rateLimit: false" });
    }
    continue;
  }

  if (!PUBLIC_SENSITIVE.has(seg) && !hasApply && !hasExplicitRl) {
    if (!PUBLIC_ALLOWLIST.includes(rel)) {
      missing.push({ rel, reason: "public route without applyRateLimit" });
    }
  }
}

console.log("=== Rate limit audit ===\n");
console.log(`Routes checked: ${files.length}`);
console.log(`Issues: ${missing.length}`);
for (const { rel, reason } of missing) {
  console.log(`  - ${rel}: ${reason}`);
}

process.exit(missing.length > 0 ? 1 : 0);
