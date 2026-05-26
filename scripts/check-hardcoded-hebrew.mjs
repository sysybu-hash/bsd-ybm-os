#!/usr/bin/env node
/**
 * מזהה מחרוזות עברית קשיחות ב-UI (מחוץ ל-i18n / help-center / tests).
 * יעד 10/10: 0 הפרות ב-components/app (מלבד allowlist).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const HEBREW = /[\u0590-\u05FF]/;
const ROOTS = ["components", "app"];
const ALLOWLIST = [
  /lib\/i18n\//,
  /lib\/help-center\//,
  /e2e\//,
  /\.test\./,
  /error\.tsx$/,
  /loading\.tsx$/,
  /opengraph/,
  /manifest/,
];

async function walk(dir, acc = []) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        await walk(p, acc);
      } else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) acc.push(p);
    }
  } catch {
    /* skip */
  }
  return acc;
}

const hits = [];
for (const root of ROOTS) {
  const files = await walk(join(process.cwd(), root));
  for (const file of files) {
    const rel = file.replace(/\\/g, "/").replace(/.*BSD-YBM-OS\//i, "");
    if (ALLOWLIST.some((re) => re.test(rel))) continue;
    const src = await readFile(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!HEBREW.test(line)) continue;
      if (line.includes('t("') || line.includes("t('")) continue;
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      hits.push({ rel, line: i + 1, snippet: line.trim().slice(0, 80) });
    }
  }
}

const MAX_REPORT = 40;
console.log(`Hardcoded Hebrew scan: ${hits.length} line(s)`);
for (const h of hits.slice(0, MAX_REPORT)) {
  console.log(`  ${h.rel}:${h.line}  ${h.snippet}`);
}
if (hits.length > MAX_REPORT) {
  console.log(`  ... and ${hits.length - MAX_REPORT} more`);
}

/** informational — exit 0 until backlog cleared */
process.exit(0);
