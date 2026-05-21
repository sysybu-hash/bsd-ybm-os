#!/usr/bin/env node
/**
 * scripts/prebuild.mjs
 *
 * Single entry-point for all pre-build steps.
 * Runs each step in sequence, reports timing, exits 1 on first failure.
 *
 * Steps:
 *   [1/4] ensure-production-schema  — Neon schema safety check
 *   [2/4] env:check                 — required env vars present
 *   [3/4] embed-pdf-fonts           — generate lib/pdf/font-data.generated.ts
 *   [4/4] prisma-generate           — generate Prisma client (safe mode)
 */

import { execSync } from "child_process";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const steps = [
  {
    name: "ensure-production-schema",
    cmd: "node scripts/ensure-production-schema.mjs",
    description: "Neon schema safety check",
  },
  {
    name: "env:check",
    cmd: "node scripts/check-env-essential.mjs",
    description: "Required environment variables",
  },
  {
    name: "embed-pdf-fonts",
    cmd: "node scripts/embed-pdf-fonts.mjs",
    description: "Generate PDF font data",
  },
  {
    name: "prisma-generate",
    cmd: "node scripts/prisma-generate-safe.mjs",
    description: "Generate Prisma client",
  },
];

console.log(`\n${C.bold}${C.cyan}BSD-YBM OS — Pre-build${C.reset}\n`);

const total = steps.length;
let failed = false;

for (let i = 0; i < steps.length; i++) {
  const { name, cmd, description } = steps[i];
  const prefix = `[${i + 1}/${total}]`;
  const label = `${prefix} ${name}`;
  process.stdout.write(`${C.gray}${label}${C.reset} — ${description} … `);

  const start = Date.now();
  try {
    execSync(cmd, { stdio: "pipe" });
    const ms = Date.now() - start;
    console.log(`${C.green}OK${C.reset} ${C.gray}(${ms}ms)${C.reset}`);
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`${C.red}FAILED${C.reset} ${C.gray}(${ms}ms)${C.reset}`);
    console.error(`\n${C.red}${C.bold}Step "${name}" failed:${C.reset}`);

    // Print stdout/stderr from the failed command
    const output = (err.stdout?.toString() ?? "") + (err.stderr?.toString() ?? "");
    if (output.trim()) {
      console.error(output.trim().split("\n").map((l) => `  ${l}`).join("\n"));
    }

    console.error(
      `\n${C.red}Fix the issue above, then re-run: ${C.bold}npm run build${C.reset}\n`
    );
    failed = true;
    break;
  }
}

if (!failed) {
  console.log(`\n${C.green}${C.bold}✓ Pre-build complete. Starting Next.js build…${C.reset}\n`);
  process.exit(0);
} else {
  process.exit(1);
}
