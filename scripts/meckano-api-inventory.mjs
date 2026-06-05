#!/usr/bin/env node
/**
 * Probes Meckano REST paths and writes docs/meckano-api-inventory.json
 * Usage: node scripts/meckano-api-inventory.mjs
 * Requires MECKANO_API_KEY in .env.local or environment.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^MECKANO_API_KEY=(.+)$/);
      if (m) process.env.MECKANO_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no file */
  }
}

loadEnv();
const key = process.env.MECKANO_API_KEY?.trim();
if (!key) {
  console.error("MECKANO_API_KEY missing");
  process.exit(1);
}

const BASE = "https://app.meckano.co.il/rest";
const paths = [
  "users",
  "tasks",
  "punch",
  "zones",
  "locations",
  "sites",
  "departments",
  "reports",
  "attendance",
  "reports/get_attendance",
  "shifts",
];

const results = [];

for (const path of paths) {
  for (const method of ["GET", "POST"]) {
    try {
      const res = await fetch(`${BASE}/${path}`, {
        method,
        headers: { key, "Content-Type": "application/json", Accept: "application/json" },
        ...(method === "POST"
          ? { body: JSON.stringify({ from: "2025-01-01", to: "2025-12-31" }) }
          : {}),
      });
      const text = await res.text();
      let sample = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        const arr = Array.isArray(j.data) ? j.data.length : null;
        sample = JSON.stringify({ status: j.status, dataCount: arr, keys: j.data?.[0] ? Object.keys(j.data[0]) : [] });
      } catch {
        /* raw */
      }
      results.push({ path, method, httpStatus: res.status, sample });
    } catch (e) {
      results.push({ path, method, error: String(e.message ?? e) });
    }
  }
}

mkdirSync(resolve(root, "docs"), { recursive: true });
const outPath = resolve(root, "docs/meckano-api-inventory.json");
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log("Wrote", outPath);
