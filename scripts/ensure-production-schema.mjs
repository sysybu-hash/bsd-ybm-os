#!/usr/bin/env node
/**
 * מריץ סכמת DB לפני build:
 * - CI / DB ריק (bsd_ybm_ci): prisma db push — baseline ריק לא יוצר טבלאות
 * - פרודקשן (Neon וכו'): prisma migrate deploy
 */
import { execSync } from "node:child_process";
import { applyProjectEnvFiles, getProjectEnv } from "./load-project-env.mjs";

applyProjectEnvFiles();

const db = (
  getProjectEnv("DATABASE_URL") ||
  getProjectEnv("POSTGRES_URL") ||
  getProjectEnv("POSTGRES_PRISMA_URL") ||
  ""
).trim();

function isPlaceholderUrl(url) {
  return (
    !url ||
    url.includes("placeholder:placeholder@localhost:5432/ci") ||
    url.includes("ci-placeholder")
  );
}

/** DB ריק ב-GitHub Actions או מקומי לבדיקות CI */
function shouldUseDbPush(url) {
  if (process.env.PRISMA_DB_PUSH === "1") return true;
  if (process.env.GITHUB_ACTIONS === "true") return true;
  return /\/bsd_ybm_ci(\?|$)/i.test(url);
}

if (isPlaceholderUrl(db)) {
  console.log("[ensure-production-schema] skip — no real DATABASE_URL");
  process.exit(0);
}

// The schema's datasource declares `directUrl = env("DIRECT_URL")`, so every
// Prisma schema command (db push / migrate deploy) needs DIRECT_URL. Preview
// deployments (e.g. Vercel) often only carry the pooled DATABASE_URL and must
// NOT run schema ops against the production DB anyway — so skip gracefully
// instead of hard-failing the build. Production and CI both set DIRECT_URL.
const directUrl = (getProjectEnv("DIRECT_URL") || "").trim();
if (!directUrl) {
  console.log(
    "[ensure-production-schema] skip — DIRECT_URL not set (e.g. preview deploy); schema ops require it",
  );
  process.exit(0);
}

const useDbPush = shouldUseDbPush(db);

console.log(
  `[ensure-production-schema] ${useDbPush ? "db push (CI/fresh)" : "migrate deploy"}…`,
);
try {
  if (!useDbPush) {
    execSync("node scripts/repair-failed-prisma-migrations.mjs", {
      stdio: "inherit",
      env: process.env,
    });
  }
  const cmd = useDbPush
    ? "npx prisma db push --skip-generate"
    : "npx prisma migrate deploy";
  execSync(cmd, {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[ensure-production-schema] schema ready");
} catch (err) {
  console.error(
    "[ensure-production-schema] failed:",
    err?.message ?? err,
  );
  process.exit(1);
}
