#!/usr/bin/env node
/**
 * Checks the essential local build/deploy environment.
 *
 * Next.js loads .env files automatically during `next build`, but this script
 * runs before Next starts. Keep the same practical behavior here so local
 * builds do not fail just because the shell process did not preload .env.
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

for (const file of [".env", ".env.local", ".env.vercel.pull"]) {
  const envPath = path.join(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

const { env } = process;
const issues = [];
const warns = [];

function has(k) {
  const v = env[k];
  return typeof v === "string" && v.trim().length > 0;
}

if (!has("DATABASE_URL")) {
  issues.push("Missing DATABASE_URL - Neon/Postgres connection will not work.");
} else if (!env.DATABASE_URL.includes("postgres")) {
  warns.push("DATABASE_URL does not look like Postgres - verify the connection string.");
}

if (!has("DIRECT_URL") && has("DATABASE_URL")) {
  warns.push("Missing DIRECT_URL - prisma migrate/db push may fail when DATABASE_URL uses a pooler.");
}

if (!has("GOOGLE_GENERATIVE_AI_API_KEY") && !has("GEMINI_API_KEY")) {
  issues.push("Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY - Gemini will not work.");
} else {
  const key =
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim() || "";
  if (key.length < 20) {
    warns.push("Gemini key is unusually short - verify that the full key was pasted.");
  }
}

const geminiModelEnv =
  env.GEMINI_MODEL?.trim() || env.GOOGLE_GENERATIVE_AI_MODEL?.trim() || "";
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
