/**
 * מעתיק DATABASE_URL ו-DIRECT_URL מ-.env.vercel.pull ל-.env.local (אם קיימים).
 * לא מדפיס ערכים.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceArg = process.argv[2];
const prodPath = resolve(root, ".env.vercel.prod");
const pullPath = resolve(root, ".env.vercel.pull");
const source = resolve(
  root,
  sourceArg && existsSync(resolve(root, sourceArg))
    ? sourceArg
    : existsSync(prodPath)
      ? ".env.vercel.prod"
      : ".env.vercel.pull",
);
const target = resolve(root, ".env.local");

function getKey(content, key) {
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return null;
  return m[0];
}

function setOrReplace(content, line) {
  const key = line.slice(0, line.indexOf("="));
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  const sep = content.endsWith("\n") ? "" : "\n";
  return content + sep + line + "\n";
}

function main() {
  if (!existsSync(source)) {
    console.error(
      "חסר קובץ מקור — הרץ: npm run vercel:env:pull:prod או npm run vercel:env:pull",
    );
    process.exit(1);
  }
  if (!existsSync(target)) {
    console.error("חסר .env.local");
    process.exit(1);
  }

  const src = readFileSync(source, "utf8");
  let dst = readFileSync(target, "utf8");
  let changed = 0;

  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = getKey(src, key);
    if (!line) continue;
    const before = dst;
    dst = setOrReplace(dst, line);
    if (dst !== before) changed++;
  }

  if (!changed) {
    console.log("אין שינוי — המפתחות כבר תואמים או חסרים ב-pull.");
    process.exit(0);
  }

  writeFileSync(target, dst, "utf8");
  console.log(`עודכן .env.local — ${changed} מפתח/ות מ-.env.vercel.pull`);
}

main();
