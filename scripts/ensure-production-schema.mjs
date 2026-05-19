#!/usr/bin/env node
/**
 * מריץ prisma migrate deploy כשיש DATABASE_URL אמיתי (Vercel / CI).
 * מדלג על placeholder מ-build ללא DB.
 */
import { execSync } from "node:child_process";

const db = (process.env.DATABASE_URL ?? "").trim();

function isPlaceholderUrl(url) {
  return (
    !url ||
    url.includes("placeholder:placeholder@localhost:5432/ci") ||
    url.includes("ci-placeholder")
  );
}

if (isPlaceholderUrl(db)) {
  console.log("[ensure-production-schema] skip — no real DATABASE_URL");
  process.exit(0);
}

console.log("[ensure-production-schema] running prisma migrate deploy…");
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[ensure-production-schema] migrations applied");
} catch (err) {
  console.error("[ensure-production-schema] migrate deploy failed:", err?.message ?? err);
  process.exit(1);
}
