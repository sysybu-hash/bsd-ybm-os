#!/usr/bin/env node
/**
 * בודק שכל route ציבורי/רגיש מוגן ב-rate-limit.
 * routes עם withWorkspacesAuth מקבלים default ב-api-handler (2026-05-26).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API_ROOT = join(process.cwd(), "app", "api");

const SKIP_DIRS = new Set(["cron"]); // cron routes are guarded by withCronGuard (secret token)

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
  // Health probe — must stay unthrottled for uptime monitors / LB health checks
  "app/api/health/route.ts",
  // Marketing demo — per-visitor cookie quota via checkRateLimit (not IP applyRateLimit)
  "app/api/marketing/demo-scan/route.ts",
  "app/api/marketing/assistant/gemini-live/session/route.ts",
];

/**
 * routes רגישים המוגנים באמצעי שאינו IP rate-limit (session / HMAC / framework).
 * IP rate-limit עליהם או מיותר או מזיק (webhooks מספק עם IP מתחלף).
 */
const SENSITIVE_PROTECTED_ALLOWLIST = new Map([
  ["app/api/auth/passkey/list/route.ts", "session-protected (getServerSession)"],
  ["app/api/auth/passkey/[id]/route.ts", "session-protected (getServerSession)"],
  ["app/api/auth/google-reconnect/route.ts", "session-protected (getServerSession)"],
  ["app/api/auth/google-reconnect/callback/route.ts", "session + signed-state protected"],
  ["app/api/webhooks/payplus/route.ts", "HMAC-SHA256 timing-safe verified (signature הוא ה-auth)"],
  ["app/api/webhooks/paypal/route.ts", "PayPal signature verified"],
  [
    "app/api/webhooks/whatsapp/route.ts",
    "Meta X-Hub-Signature-256 HMAC verified (signature הוא ה-auth; IP rate-limit מזיק ל-webhook)",
  ],
  ["app/api/auth/[...nextauth]/route.ts", "NextAuth internal handler (credential brute-force מטופל בנפרד)"],
]);

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
  const hasCheck = src.includes("checkRateLimit");
  const hasWorkspace = src.includes("withWorkspacesAuth");
  const hasOsAdmin = src.includes("withOSAdmin");
  const hasExplicitRl =
    src.includes("rateLimit:") || src.includes("rateLimit :") || hasApply || hasCheck;
  const streamOptOut = src.includes("rateLimit: false");

  // routes רגישים ציבוריים — חובה IP rate-limit מפורש או protection מתועד
  if (PUBLIC_SENSITIVE.has(seg)) {
    if (!hasApply && !hasCheck && !SENSITIVE_PROTECTED_ALLOWLIST.has(rel)) {
      missing.push({
        rel,
        reason: "public-sensitive route missing rate-limit / documented protection",
      });
    }
    continue;
  }

  if (hasWorkspace || hasOsAdmin) {
    if (STREAM_ALLOWLIST.includes(rel) && !streamOptOut) {
      missing.push({ rel, reason: "SSE route needs rateLimit: false" });
    }
    continue;
  }

  if (!hasApply && !hasExplicitRl) {
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
