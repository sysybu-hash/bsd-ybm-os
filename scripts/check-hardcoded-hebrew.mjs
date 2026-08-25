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
const ROOTS = ["components", "app", "hooks"];
/**
 * A line ending in `// i18n-exempt: <reason>` is skipped. Preferred over adding
 * paths below, because the justification then sits next to the string instead of
 * in a list nobody reads.
 */
const INLINE_EXEMPT = /\/\/\s*i18n-exempt:/;

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
  /**
   * Whether we are inside a comment that opened on an earlier line. The check is
   * line-by-line, so without this a wrapped `{/* ... *\/}` block reports every
   * line after the first — the opening line is skipped and the prose below it is
   * not.
   */
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    const wasInBlockComment = inBlockComment;
    if (inBlockComment) {
      if (/\*\/|\*\/\}/.test(line)) inBlockComment = false;
    } else if (/(^|[^:])\/\*|\{\/\*/.test(line) && !/\*\/|\*\/\}/.test(line)) {
      inBlockComment = true;
    }
    if (wasInBlockComment) continue;

    if (!HEBREW.test(line)) continue;
    if (INLINE_EXEMPT.test(line)) continue;
    // A translated string: t("key"), t(`${P}.key`), tr("key", "fallback"), ...
    // The backtick form is the common one in this repo (widgets build keys from
    // a PREFIX constant), and matching only quotes reported ~800 false hits and
    // made the audit useless as a gate.
    if (/\bt(?:r)?\s*\(\s*[`"']/.test(line)) continue;
    /**
     * The same call wrapped over several lines, where the fallback sits alone on
     * its own line and carries no `tr(` for the test above to find:
     *
     *   const message = tr(
     *     "workspaceWidgets.documentScan.blueprintForkMessage",
     *     "…Hebrew fallback…",
     *   );
     *
     * That is the sanctioned pattern, not a violation, so look back a few lines
     * for a translate call whose parentheses are still open.
     */
    if (isInsideOpenTranslateCall(lines, i)) continue;
    // A per-locale entry in a { he, en, ru } record — that IS the translation.
    if (/^\s*(?:he|en|ru|ar)\s*:\s*[`"']/.test(trimmed)) continue;
    // A locale record written on one line: { he: "...", en: "...", ru: "..." }
    if (/\bhe\s*:\s*[`"']/.test(line) && /\ben\s*:\s*[`"']/.test(line)) continue;
    // הערות: `//`, גוף בלוק (`*`), ובלוק שנפתח באותה שורה (JSDoc חד-שורתי)
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("{/*")
    ) {
      continue;
    }
    hits.push({ rel, line: i + 1, snippet: trimmed.slice(0, 80) });
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

/**
 * True when `index` falls inside the argument list of a `t(` / `tr(` call that
 * opened on an earlier line. Counts brackets backwards over a short window —
 * these calls are never long, and scanning the whole file would be both slow and
 * prone to matching an unrelated call much further up.
 */
function isInsideOpenTranslateCall(lines, index) {
  const LOOKBACK = 4;
  for (let start = index - 1; start >= 0 && start >= index - LOOKBACK; start--) {
    const candidate = lines[start] ?? "";
    if (!/\bt(?:r)?\s*\($/.test(candidate.trimEnd())) continue;
    let depth = 0;
    for (let j = start; j < index; j++) {
      for (const ch of lines[j] ?? "") {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
    }
    if (depth > 0) return true;
  }
  return false;
}

/**
 * The UI layer is a blocking gate; the server layer is not, yet.
 *
 * `components/**` and `hooks/**` are at zero real violations, so a new hard-coded
 * Hebrew string there is a regression and fails the run. Everything else — the
 * ~930 error messages in `app/api/**` and `app/actions/**` — is reported and
 * tolerated: those are migrating gradually behind the `code`-based translation
 * in lib/client/parse-json-response.ts, and blocking on them would fail every PR
 * over pre-existing debt.
 *
 * See docs/I18N-HARDCODED-BACKLOG.md.
 */
const UI_SCOPE = /^(components|hooks)\//;
const uiHits = hits.filter((h) => UI_SCOPE.test(h.rel));
if (uiHits.length > 0) {
  console.error(
    `\nFAIL: ${uiHits.length} hard-coded Hebrew line(s) in components/ or hooks/.\n` +
      "  Use t(\"key\") from useI18n, or tr(key, fallback) where no context is available.\n" +
      "  A string that is matched against rather than displayed belongs in a named,\n" +
      "  commented constant — see VENDOR_UNKNOWN in components/os/widgets/ai-scanner/constants.ts.",
  );
  for (const h of uiHits) console.error(`  ${h.rel}:${h.line}  ${h.snippet}`);
  process.exit(1);
}
process.exit(0);
