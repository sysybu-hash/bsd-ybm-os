#!/usr/bin/env node
/**
 * scripts/check-env-essential.mjs
 *
 * Pre-build environment validation.
 * Prints a colored table of REQUIRED / OPTIONAL / MISSING vars.
 * Exits 1 on any REQUIRED missing; exits 0 on warnings only.
 */

import { prepareBuildEnv } from "./ci-prepare-build-env.mjs";
import {
  applyProjectEnvFiles,
  getProjectEnv,
  getProjectGeminiApiKey,
} from "./load-project-env.mjs";

applyProjectEnvFiles();
prepareBuildEnv();

// ─── ANSI colors ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const ok = `${C.green}✓ OK${C.reset}`;
const warn = `${C.yellow}⚠ WARN${C.reset}`;
const fail = `${C.red}✗ MISSING${C.reset}`;
const info = `${C.gray}– optional${C.reset}`;

function has(k) { return (getProjectEnv(k) ?? "").length > 0; }
function mask(k) {
  const v = getProjectEnv(k) ?? "";
  if (!v) return C.gray + "(empty)" + C.reset;
  return C.gray + v.slice(0, 6) + "..." + C.reset;
}

// ─── define checks ───────────────────────────────────────────────────────────
const checks = [];
const issues = [];
const warnings = [];

function required(key, note = "") {
  const present = has(key);
  checks.push({ key, status: present ? ok : fail, note, masked: mask(key) });
  if (!present) issues.push(`${key}${note ? " — " + note : ""}`);
}
function optional(key, note = "") {
  const present = has(key);
  checks.push({ key, status: present ? ok : info, note, masked: mask(key) });
}
function warnIf(key, condition, message) {
  if (condition) {
    checks.push({ key, status: warn, note: message, masked: mask(key) });
    warnings.push(message);
  }
}

// ─── DATABASE ────────────────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.cyan}BSD-YBM OS — Environment Check${C.reset}\n`);

required("DATABASE_URL", "Postgres / Neon connection string");
warnIf("DATABASE_URL",
  has("DATABASE_URL") && !getProjectEnv("DATABASE_URL").includes("postgres"),
  "DATABASE_URL does not look like a Postgres URL");
optional("DIRECT_URL", "Required for prisma migrate (non-pooled)");

// ─── AUTH ────────────────────────────────────────────────────────────────────
const hasAuthSecret = has("NEXTAUTH_SECRET") || has("AUTH_SECRET");
checks.push({
  key: "NEXTAUTH_SECRET / AUTH_SECRET",
  status: hasAuthSecret ? ok : fail,
  note: "Required for session signing",
  masked: mask("NEXTAUTH_SECRET") !== C.gray + "(empty)" + C.reset ? mask("NEXTAUTH_SECRET") : mask("AUTH_SECRET"),
});
if (!hasAuthSecret) issues.push("NEXTAUTH_SECRET or AUTH_SECRET — required for authentication");

optional("NEXTAUTH_URL", "Base URL for auth callbacks");
optional("AUTH_URL", "Alias for NEXTAUTH_URL");

// ─── GEMINI ──────────────────────────────────────────────────────────────────
const geminiKey = getProjectGeminiApiKey();
checks.push({
  key: "GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY",
  status: geminiKey ? ok : warn,
  note: geminiKey ? "Gemini available" : "AI features will be unavailable",
  masked: geminiKey ? C.gray + geminiKey.slice(0, 6) + "..." + C.reset : C.gray + "(empty)" + C.reset,
});
if (!geminiKey) warnings.push("No Gemini API key — AI features disabled");

warnIf("GEMINI_MODEL",
  has("GEMINI_MODEL") && /gemini-1\.5/i.test(getProjectEnv("GEMINI_MODEL")),
  "GEMINI_MODEL points to deprecated Gemini 1.5 — update to gemini-2.5-flash");

// ─── OPTIONAL AI ─────────────────────────────────────────────────────────────
optional("ANTHROPIC_API_KEY", "Claude AI features");
optional("OPENAI_API_KEY", "OpenAI features");
optional("GROQ_API_KEY", "Groq fast inference");

// ─── GOOGLE OAUTH ────────────────────────────────────────────────────────────
optional("GOOGLE_CLIENT_ID", "Google Sign-In");
optional("GOOGLE_CLIENT_SECRET", "Google Sign-In");

// ─── EMAIL ───────────────────────────────────────────────────────────────────
const mailOk = has("RESEND_API_KEY") || (has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASS"));
checks.push({
  key: "RESEND_API_KEY / SMTP_HOST+USER+PASS",
  status: mailOk ? ok : warn,
  note: mailOk ? "Email configured" : "Transactional email disabled",
  masked: has("RESEND_API_KEY") ? mask("RESEND_API_KEY") : mask("SMTP_HOST"),
});
if (!mailOk) warnings.push("No email provider configured — password reset, invites won't work");

// ─── PAYMENTS ────────────────────────────────────────────────────────────────
optional("PAYPAL_CLIENT_ID", "PayPal payments");
optional("PAYPAL_CLIENT_SECRET", "PayPal payments");
optional("PAYPLUS_API_KEY", "PayPlus payments (IL)");

// ─── CRON / SECURITY ─────────────────────────────────────────────────────────
optional("CRON_SECRET", "Cron route auth — required in prod");
optional("ANALYZE_QUEUE_SECRET", "Queue worker auth — required in prod");
warnIf("CRON_SECRET",
  !has("CRON_SECRET") && (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"),
  "CRON_SECRET missing in production — /api/cron/* will reject all requests");

// ─── VAPID / PUSH ────────────────────────────────────────────────────────────
optional("VAPID_PUBLIC_KEY", "Web push notifications");
optional("VAPID_PRIVATE_KEY", "Web push notifications");
optional("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "Web push (client-side)");

// ─── REDIS ───────────────────────────────────────────────────────────────────
optional("UPSTASH_REDIS_REST_URL", "Rate limiting + caching");

// ─── PRINT TABLE ─────────────────────────────────────────────────────────────
const keyWidth = Math.max(...checks.map((c) => c.key.length), 40) + 2;
const lineWidth = keyWidth + 16 + 30;

console.log("─".repeat(lineWidth));
console.log(
  `  ${C.bold}Variable${C.reset}`.padEnd(keyWidth + 9) +
  `${C.bold}Status${C.reset}`.padEnd(20) +
  `${C.bold}Note${C.reset}`
);
console.log("─".repeat(lineWidth));

for (const { key, status, note } of checks) {
  const keyPad = key.padEnd(keyWidth);
  const statusPad = status.padEnd(20 + (status.length - status.replace(/\x1b\[[0-9;]*m/g, "").length));
  console.log(`  ${keyPad}${statusPad}${C.gray}${note}${C.reset}`);
}

console.log("─".repeat(lineWidth));

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
if (issues.length === 0 && warnings.length === 0) {
  console.log(`\n${C.green}${C.bold}✓ All required variables present. Build can proceed.${C.reset}\n`);
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`\n${C.yellow}Warnings (${warnings.length}):${C.reset}`);
  warnings.forEach((m) => console.log(`  ${C.yellow}⚠${C.reset} ${m}`));
}

if (issues.length > 0) {
  console.log(`\n${C.red}${C.bold}CRITICAL — Missing required variables (${issues.length}):${C.reset}`);
  issues.forEach((m) => console.log(`  ${C.red}✗${C.reset} ${m}`));
  console.log(`\n${C.red}Exiting with code 1. Fix the above before building.${C.reset}\n`);
  process.exit(1);
}

console.log(`\n${C.yellow}Warnings only — build will continue.${C.reset}\n`);
process.exit(0);
