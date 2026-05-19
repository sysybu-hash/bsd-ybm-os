#!/usr/bin/env node
/**
 * ב-CI / Vercel: משלים משתני חובה חסרים ב-placeholder לבנייה בלבד.
 * מקומי עם .env.local: בדרך כלל לא ממלא כלום.
 */
import fs from "node:fs";

const isRemoteBuild =
  process.env.GITHUB_ACTIONS === "true" || process.env.VERCEL === "1";
if (!isRemoteBuild) {
  process.exit(0);
}

const PLACEHOLDERS = {
  GOOGLE_GENERATIVE_AI_API_KEY: "ci-placeholder-gemini-key-0000000000",
  GEMINI_API_KEY: "ci-placeholder-gemini-key-0000000000",
  DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/ci",
  DIRECT_URL: "postgresql://placeholder:placeholder@localhost:5432/ci",
  NEXTAUTH_SECRET: "ci-nextauth-secret-for-build-only",
  NEXTAUTH_URL: "http://127.0.0.1:3330",
  AUTH_URL: "http://127.0.0.1:3330",
};

function has(key) {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

const filled = [];
for (const [key, fallback] of Object.entries(PLACEHOLDERS)) {
  if (has(key)) continue;
  process.env[key] = fallback;
  filled.push(key);
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${fallback}\n`);
  }
}

const target = process.env.VERCEL === "1" ? "Vercel Environment Variables" : "GitHub Secrets";
if (filled.length) {
  console.log(
    `[prepare-build-env] placeholders for build: ${filled.join(", ")} (configure ${target} for real values)`,
  );
} else {
  console.log("[prepare-build-env] using configured env (no placeholders needed)");
}
