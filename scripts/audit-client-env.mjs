#!/usr/bin/env node
/**
 * Forbids the server-only `env` proxy in client components.
 *
 * lib/env.ts exports two things. `clientEnv` reads each NEXT_PUBLIC_* var
 * through a literal `process.env.NEXT_PUBLIC_X`, which Next inlines into the
 * client bundle at build time. `env` is a Proxy that falls back to a dynamic
 * `process.env[key]` in the browser — dynamic lookups are never inlined, so
 * every read through it is undefined on the client.
 *
 * That failure is silent: no error, no warning, just an empty string. It took
 * down paid signup in production once, where PayPalRegisterButtons read the
 * client id through `env` and rendered "payment unavailable" for every visitor.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOTS = ["app", "components", "hooks", "lib"];
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build"]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) yield full;
  }
}

const offenders = [];

for (const root of ROOTS) {
  for await (const file of walk(join(process.cwd(), root))) {
    const src = await readFile(file, "utf8");
    if (!/^\s*["']use client["']/m.test(src)) continue;

    // Only flag the server proxy, not clientEnv / edgeEnv.
    const importMatch = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/env["']/);
    if (!importMatch) continue;
    const named = importMatch[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    if (!named.includes("env")) continue;

    offenders.push(relative(process.cwd(), file));
  }
}

console.log("=== Client env audit ===");
if (offenders.length === 0) {
  console.log("No client component imports the server-only `env` proxy.");
  process.exit(0);
}

console.error(`\n${offenders.length} client component(s) import the server-only \`env\` proxy:\n`);
for (const f of offenders) console.error(`  ${f}`);
console.error("\nNEXT_PUBLIC_* reads through `env` are undefined in the browser.");
console.error("Import { clientEnv } from '@/lib/env' instead.\n");
process.exit(1);
