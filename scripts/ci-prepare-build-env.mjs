#!/usr/bin/env node
/**
 * ב-CI: משלים משתני חובה מ-GitHub Secrets; אם חסר — placeholder לבנייה בלבד.
 * מקומי: לא נדרש (יש .env / .env.local).
 */
import fs from "node:fs";

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

if (filled.length) {
  console.log(
    `[ci-prepare-build-env] placeholders for build: ${filled.join(", ")} (add GitHub Secrets to use real values)`,
  );
} else {
  console.log("[ci-prepare-build-env] using secrets / workflow env (no placeholders needed)");
}
