#!/usr/bin/env node
/**
 * Prints lib files ≥300 lines and reminds open 10/10 gates.
 * Run: node scripts/refresh-10-10-status.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const r = spawnSync("node", ["scripts/lib-line-count.mjs", "--min", "300"], {
  cwd: root,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

console.log("\n10/10 gates (see docs/PROGRESS-10-10.md):");
console.log("  • KPI signed 2026-07-15 — see docs/KPI-SIGNOFF.md");
console.log("  • lib logic ≥300 target <25 (bulk OK excluded)");
console.log("  • CSP_STRICT=true Preview→Prod via Vercel Dashboard when ready");
console.log("  • npm run lighthouse:matrix:prod (desktop landing ≥90)");
console.log("  • node scripts/neon-dr-drill.mjs + quarterly Neon PITR console");

process.exit(r.status ?? 0);
