#!/usr/bin/env node
/**
 * Neon DR readiness drill — verifies DB connectivity and prints restore checklist.
 * Run: node scripts/neon-dr-drill.mjs
 * Requires DATABASE_URL in environment (.env.local loaded via dotenv if present).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotenvLocal();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("❌ DATABASE_URL missing — set in .env.local or CI secret");
  process.exit(1);
}

const started = Date.now();
try {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$queryRaw`SELECT 1 AS ok`;
  const orgs = await prisma.organization.count();
  await prisma.$disconnect();
  const ms = Date.now() - started;
  console.log(`✅ Neon reachable (${ms}ms) — organizations: ${orgs}`);
  console.log("\nDR checklist (manual in Neon Console):");
  console.log("  1. Confirm PITR / backup retention matches docs/DR-PLAN.md");
  console.log("  2. Create a branch from a point-in-time snapshot (staging drill)");
  console.log("  3. Point DATABASE_URL at branch → npm run db:migrate → smoke test");
  console.log("  4. Document RTO/RPO in docs/KPI-SIGNOFF.md");
  process.exit(0);
} catch (e) {
  console.error("❌ DB drill failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
