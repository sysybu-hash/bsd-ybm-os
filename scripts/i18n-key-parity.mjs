#!/usr/bin/env node
/**
 * Compare locale JSON key parity (he as source) across all message packs.
 * Also fails on extra keys and placeholder token mismatches ({var}).
 *
 * Usage: node scripts/i18n-key-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const locales = ["he", "en", "ru"];
const messagesDir = path.join(root, "messages");

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [sub, val] of flatten(v, key)) out.set(sub, val);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

function placeholders(value) {
  if (typeof value !== "string") return [];
  const found = value.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g);
  return found ? [...new Set(found)].sort() : [];
}

/** Discover packs that have he/en/ru trio: foo.he.json or he.json */
function discoverPacks() {
  const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
  const packs = new Set();

  for (const f of files) {
    if (/^(he|en|ru)\.json$/.test(f)) {
      packs.add(""); // root messages/{he,en,ru}.json
      continue;
    }
    const m = f.match(/^(.+)\.(he|en|ru)\.json$/);
    if (m) packs.add(m[1]);
  }

  return [...packs].sort();
}

function packPaths(pack) {
  if (pack === "") {
    return Object.fromEntries(
      locales.map((loc) => [loc, path.join(messagesDir, `${loc}.json`)]),
    );
  }
  return Object.fromEntries(
    locales.map((loc) => [loc, path.join(messagesDir, `${pack}.${loc}.json`)]),
  );
}

let exitCode = 0;
const packs = discoverPacks();

for (const pack of packs) {
  const paths = packPaths(pack);
  const label = pack || "(root)";
  const missingFiles = locales.filter((loc) => !fs.existsSync(paths[loc]));
  if (missingFiles.length) {
    console.log(`\n[${label}] skip — missing locales: ${missingFiles.join(", ")}`);
    continue;
  }

  const maps = Object.fromEntries(
    locales.map((loc) => {
      const data = JSON.parse(fs.readFileSync(paths[loc], "utf8"));
      return [loc, flatten(data)];
    }),
  );

  const source = maps.he;
  console.log(`\n=== Pack: ${label} (${source.size} keys in he) ===`);

  for (const loc of ["en", "ru"]) {
    const target = maps[loc];
    const missing = [...source.keys()].filter((k) => !target.has(k));
    const extra = [...target.keys()].filter((k) => !source.has(k));
    const placeholderMismatches = [];

    for (const key of source.keys()) {
      if (!target.has(key)) continue;
      const a = placeholders(source.get(key)).join(",");
      const b = placeholders(target.get(key)).join(",");
      if (a !== b) {
        placeholderMismatches.push(`${key}: he[${a}] vs ${loc}[${b}]`);
      }
    }

    const parity =
      missing.length === 0 && extra.length === 0
        ? 100
        : Math.round(((source.size - missing.length) / source.size) * 100);

    console.log(`  ${loc.toUpperCase()} parity vs he: ${parity}%`);

    if (missing.length) {
      console.log(`    Missing (${missing.length}):`);
      missing.slice(0, 20).forEach((k) => console.log(`      - ${k}`));
      if (missing.length > 20) console.log(`      ... +${missing.length - 20} more`);
      exitCode = 1;
    }
    if (extra.length) {
      console.log(`    Extra (${extra.length}):`);
      extra.slice(0, 20).forEach((k) => console.log(`      + ${k}`));
      if (extra.length > 20) console.log(`      ... +${extra.length - 20} more`);
      exitCode = 1;
    }
    if (placeholderMismatches.length) {
      console.log(`    Placeholder mismatches (${placeholderMismatches.length}):`);
      placeholderMismatches.slice(0, 15).forEach((k) => console.log(`      ~ ${k}`));
      if (placeholderMismatches.length > 15) {
        console.log(`      ... +${placeholderMismatches.length - 15} more`);
      }
      exitCode = 1;
    }
  }
}

if (exitCode !== 0) {
  console.error("\ni18n key parity failed.");
} else {
  console.log("\ni18n key parity OK for all packs.");
}

process.exit(exitCode);
