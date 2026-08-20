#!/usr/bin/env node
/**
 * AST-based i18n audit — finds t()/ts() calls whose key is built from a
 * template literal or string concatenation (e.g. `t(\`prefix.${suffix}\`)`),
 * which a plain regex scan silently skips entirely.
 *
 * For calls where the dynamic part can be traced to a locally-declared array
 * of string literals (the extremely common `SOME_ARRAY.map((x) => t(\`prefix.${x}\`))`
 * or `for (const x of ARRAY)` pattern), every possible resolved key is checked
 * against the merged he/en/ru message trees. Anything that can't be resolved
 * this way is reported separately under "needs manual review" rather than
 * silently skipped — the whole point of this script over the old regex scan.
 *
 * Usage: node scripts/audit-i18n-dynamic-keys.mjs
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const SCAN_DIRS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const LOCALES = ["he", "en", "ru"];

// ---------------------------------------------------------------------------
// Merged message tree per locale (mirrors lib/i18n/load-messages.ts's getMessages()).
// ---------------------------------------------------------------------------
const MESSAGE_FILES = [
  "{locale}.json",
  "site-marketing.{locale}.json",
  "marketing-home.{locale}.json",
  "brand-brief.{locale}.json",
  "construction-trades.{locale}.json",
  "business-lines.{locale}.json",
  "workspace-shell.{locale}.json",
  "workspace-dock.{locale}.json",
  "site-chrome.{locale}.json",
  "workspace-areas.{locale}.json",
];

function deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const av = a[k];
    if (bv && typeof bv === "object" && !Array.isArray(bv) && av && typeof av === "object" && !Array.isArray(av)) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

function loadMessages(locale) {
  let merged = {};
  for (const pattern of MESSAGE_FILES) {
    const file = pattern.replace("{locale}", locale);
    const fp = path.join(root, "messages", file);
    if (fs.existsSync(fp)) {
      merged = deepMerge(merged, JSON.parse(fs.readFileSync(fp, "utf8")));
    }
  }
  return merged;
}

function getNested(obj, keyPath) {
  let cur = obj;
  for (const seg of keyPath.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

const messages = Object.fromEntries(LOCALES.map((l) => [l, loadMessages(l)]));

function keyExistsAnywhere(key) {
  return LOCALES.some((l) => getNested(messages[l], key) !== undefined);
}
function keyExistsEverywhere(key) {
  return LOCALES.every((l) => getNested(messages[l], key) !== undefined);
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fp, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(fp);
  }
}
const files = [];
for (const d of SCAN_DIRS) walk(path.join(root, d), files);

// ---------------------------------------------------------------------------
// Per-file AST analysis
// ---------------------------------------------------------------------------
/** Resolve local `const NAME = [...]` (string-literal arrays) and `const NAME = "literal"` (plain strings). */
function collectLocalStringArrays(sourceFile) {
  /** @type {Map<string, string[]>} */
  const arrays = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let init = node.initializer;
      if (ts.isAsExpression(init)) init = init.expression;
      if (ts.isArrayLiteralExpression(init) && ts.isIdentifier(node.name)) {
        const values = [];
        let allLiterals = true;
        for (const el of init.elements) {
          if (ts.isStringLiteralLike(el)) values.push(el.text);
          else {
            allLiterals = false;
            break;
          }
        }
        if (allLiterals && values.length) arrays.set(node.name.text, values);
      } else if (ts.isStringLiteralLike(init) && ts.isIdentifier(node.name)) {
        // const prefix = "workspaceWidgets.foo"; — by far the most common pattern
        // behind t(`${prefix}.suffix`) calls throughout this codebase.
        arrays.set(node.name.text, [init.text]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return arrays;
}

/** Try to resolve every value an identifier could take when it's a .map()/for-of loop variable over a known local array. */
function resolveLoopVariable(node, identifierName, localArrays) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isArrowFunction(cur) &&
      cur.parameters.length &&
      ts.isIdentifier(cur.parameters[0].name) &&
      cur.parameters[0].name.text === identifierName &&
      ts.isCallExpression(cur.parent) &&
      ts.isPropertyAccessExpression(cur.parent.expression) &&
      cur.parent.expression.name.text === "map" &&
      ts.isIdentifier(cur.parent.expression.expression)
    ) {
      const arrName = cur.parent.expression.expression.text;
      if (localArrays.has(arrName)) return localArrays.get(arrName);
    }
    if (
      ts.isForOfStatement(cur) &&
      ts.isVariableDeclarationList(cur.initializer) &&
      cur.initializer.declarations[0] &&
      ts.isIdentifier(cur.initializer.declarations[0].name) &&
      cur.initializer.declarations[0].name.text === identifierName &&
      ts.isIdentifier(cur.expression)
    ) {
      const arrName = cur.expression.text;
      if (localArrays.has(arrName)) return localArrays.get(arrName);
    }
    cur = cur.parent;
  }
  return null;
}

/** Resolve a template literal's possible concrete string values. Returns null if unresolvable. */
function resolveTemplateLiteral(node, localArrays) {
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteralLike(node)) {
    return [node.text];
  }
  if (!ts.isTemplateExpression(node)) return null;

  let results = [node.head.text];
  for (const span of node.templateSpans) {
    const expr = span.expression;
    let values = null;
    if (ts.isIdentifier(expr)) {
      values = resolveLoopVariable(span, expr.text, localArrays) ?? localArrays.get(expr.text) ?? null;
    }
    if (!values) return null; // unresolvable expression segment
    const literal = span.literal.text;
    const next = [];
    for (const prefix of results) {
      for (const v of values) next.push(prefix + v + literal);
    }
    results = next;
  }
  return results;
}

const missing = new Map(); // key -> Set(file:line)
const needsManualReview = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const localArrays = collectLocalStringArrays(sourceFile);
  const rel = path.relative(root, file).replace(/\\/g, "/");

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "t" || node.expression.text === "ts") &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      if (ts.isStringLiteralLike(arg)) {
        // Plain literal — already covered by the regex scan, but re-verify for completeness.
        if (arg.text.includes(".") && !keyExistsEverywhere(arg.text)) {
          const loc = `${rel}:${line + 1}`;
          if (!missing.has(arg.text)) missing.set(arg.text, new Set());
          missing.get(arg.text).add(loc);
        }
      } else if (ts.isTemplateExpression(arg)) {
        const resolved = resolveTemplateLiteral(arg, localArrays);
        if (resolved) {
          for (const key of resolved) {
            if (!key.includes(".")) continue;
            if (!keyExistsEverywhere(key)) {
              const loc = `${rel}:${line + 1}`;
              if (!missing.has(key)) missing.set(key, new Set());
              missing.get(key).add(loc);
            }
          }
        } else {
          needsManualReview.push({ file: rel, line: line + 1, snippet: node.getText().slice(0, 100) });
        }
      } else if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        needsManualReview.push({ file: rel, line: line + 1, snippet: node.getText().slice(0, 100) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log("=== i18n dynamic-key audit ===\n");

if (missing.size === 0) {
  console.log("Resolved dynamic keys: 0 missing.\n");
} else {
  console.log(`Resolved dynamic keys — MISSING in at least one locale (${missing.size}):`);
  for (const [key, locs] of missing) {
    const notIn = LOCALES.filter((l) => getNested(messages[l], key) === undefined);
    console.log(`  - ${key}  [missing in: ${notIn.join(", ")}]`);
    for (const loc of locs) console.log(`      ${loc}`);
  }
  console.log("");
}

console.log(`Unresolvable dynamic key expressions — needs manual review (${needsManualReview.length}):`);
for (const item of needsManualReview.slice(0, 60)) {
  console.log(`  ${item.file}:${item.line}  ${item.snippet}`);
}
if (needsManualReview.length > 60) {
  console.log(`  ... +${needsManualReview.length - 60} more`);
}

process.exit(missing.size > 0 ? 1 : 0);
