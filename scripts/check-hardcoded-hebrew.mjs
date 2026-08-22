#!/usr/bin/env node
/**
 * מזהה מחרוזות עברית קשיחות ב-UI (מחוץ ל-i18n / help-center / tests).
 * יעד 10/10: 0 הפרות ב-components/app (מלבד allowlist).
 *
 * שימוש:
 *   node scripts/check-hardcoded-hebrew.mjs
 *   node scripts/check-hardcoded-hebrew.mjs components/os/DashboardWidget.tsx
 *   node scripts/check-hardcoded-hebrew.mjs components/os/widgets/crm-table
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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

async function collectFiles(pathArgs) {
  if (pathArgs.length === 0) {
    const acc = [];
    for (const root of ROOTS) {
      await walk(join(process.cwd(), root), acc);
    }
    return acc;
  }

  const acc = [];
  for (const raw of pathArgs) {
    const abs = resolve(process.cwd(), raw);
    try {
      const st = await stat(abs);
      if (st.isDirectory()) {
        await walk(abs, acc);
      } else if (/\.(tsx|ts|jsx|js)$/.test(abs)) {
        acc.push(abs);
      }
    } catch {
      console.warn(`Skipping missing path: ${raw}`);
    }
  }
  return acc;
}

const pathArgs = process.argv.slice(2);
const files = await collectFiles(pathArgs);

const hits = [];
for (const file of files) {
  const rel = file.replace(/\\/g, "/").replace(/.*BSD-YBM-OS\//i, "");
  if (ALLOWLIST.some((re) => re.test(rel))) continue;
  const src = await readFile(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!HEBREW.test(line)) continue;
    // A translated string: t("key"), t(`${P}.key`), tr("key", "fallback"), ...
    // The backtick form is the common one in this repo (widgets build keys from
    // a PREFIX constant), and matching only quotes reported ~800 false hits and
    // made the audit useless as a gate.
    if (/\bt(?:r)?\s*\(\s*[`"']/.test(line)) continue;
    // A per-locale entry in a { he, en, ru } record — that IS the translation.
    if (/^\s*(?:he|en|ru|ar)\s*:\s*[`"']/.test(line.trim())) continue;
    // A locale record written on one line: { he: "...", en: "...", ru: "..." }
    if (/\bhe\s*:\s*[`"']/.test(line) && /\ben\s*:\s*[`"']/.test(line)) continue;
    const trimmed = line.trim();
    // הערות: `//`, גוף בלוק (`*`), ובלוק שנפתח באותה שורה (JSDoc חד-שורתי)
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("{/*")
    ) {
      continue;
    }
    hits.push({ rel, line: i + 1, snippet: line.trim().slice(0, 80) });
  }
}

const MAX_REPORT = Number(process.env.HEB_MAX_REPORT ?? 40);
console.log(`Hardcoded Hebrew scan: ${hits.length} line(s)`);
if (pathArgs.length > 0) {
  console.log(`  scope: ${pathArgs.join(", ")}`);
}
for (const h of hits.slice(0, MAX_REPORT)) {
  console.log(`  ${h.rel}:${h.line}  ${h.snippet}`);
}
if (hits.length > MAX_REPORT) {
  console.log(`  ... and ${hits.length - MAX_REPORT} more`);
}

/** informational — exit 0 until backlog cleared */
process.exit(0);
