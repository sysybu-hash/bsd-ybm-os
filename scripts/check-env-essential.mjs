#!/usr/bin/env node
/**
 * Checks the essential local build/deploy environment.
 *
 * קורא מקבצי .env (מיזוג כמו Next.js) וגם מ-process.env (CI / GitHub Secrets).
 */

import {
  applyProjectEnvFiles,
  getProjectEnv,
  getProjectGeminiApiKey,
} from "./load-project-env.mjs";

applyProjectEnvFiles();

const issues = [];
const warns = [];

function has(k) {
  return getProjectEnv(k).length > 0;
}

if (!has("DATABASE_URL")) {
  issues.push("Missing DATABASE_URL - Neon/Postgres connection will not work.");
} else if (!getProjectEnv("DATABASE_URL").includes("postgres")) {
  warns.push("DATABASE_URL does not look like Postgres - verify the connection string.");
}

if (!has("DIRECT_URL") && has("DATABASE_URL")) {
  warns.push("Missing DIRECT_URL - prisma migrate/db push may fail when DATABASE_URL uses a pooler.");
}

const geminiKey = getProjectGeminiApiKey();
if (!geminiKey) {
  issues.push(
    "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY (checked .env, .env.local, and process env) - Gemini will not work.",
  );
} else if (geminiKey.length < 20) {
  warns.push("Gemini key is unusually short - verify that the full key was pasted.");
} else if (geminiKey.startsWith("ci-placeholder-")) {
  warns.push("Using CI placeholder Gemini key — set a real key in .env.local or GitHub Secrets for live API calls.");
}

const geminiModelEnv =
  getProjectEnv("GEMINI_MODEL") || getProjectEnv("GOOGLE_GENERATIVE_AI_MODEL");
if (geminiModelEnv && /gemini-1\.5-flash-002|gemini-1\.5-flash-latest/i.test(geminiModelEnv)) {
  warns.push(
    "GEMINI_MODEL / GOOGLE_GENERATIVE_AI_MODEL points to an old Gemini 1.5 Flash model that may return 404; update to a supported model such as gemini-2.5-flash.",
  );
}

if (!has("NEXTAUTH_SECRET")) {
  warns.push("Missing NEXTAUTH_SECRET - required for production auth.");
}

if (!has("NEXTAUTH_URL") && !has("AUTH_URL")) {
  warns.push("Missing NEXTAUTH_URL / AUTH_URL - production sign-in may fail.");
}

if (!has("CRON_SECRET")) {
  warns.push("Missing CRON_SECRET - /api/cron/* routes will reject in production.");
}
if (!has("ANALYZE_QUEUE_SECRET")) {
  warns.push("Missing ANALYZE_QUEUE_SECRET - analyze-queue worker cannot authenticate.");
}
if (!has("ITA_PRODUCTION_KEY")) {
  warns.push("Missing ITA_PRODUCTION_KEY - tax allocation uses mock mode only.");
}

const mailOk =
  has("RESEND_API_KEY") ||
  (has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASS"));
if (!mailOk) {
  warns.push(
    "Missing RESEND_API_KEY or SMTP (HOST+USER+PASS) - transactional email will not send.",
  );
}

console.log("[check-env-essential] BSD-YBM");
if (issues.length) {
  console.error("\nCritical missing variables:");
  issues.forEach((m) => console.error("  -", m));
}
if (warns.length) {
  console.warn("\nWarnings:");
  warns.forEach((m) => console.warn("  -", m));
}
if (!issues.length && !warns.length) {
  console.log("Essential variables look configured.\n");
  process.exit(0);
}
if (issues.length) {
  console.error("\nExiting with code 1 because critical variables are missing.\n");
  process.exit(1);
}
console.log("\nExiting with code 0; warnings only.\n");
process.exit(0);
