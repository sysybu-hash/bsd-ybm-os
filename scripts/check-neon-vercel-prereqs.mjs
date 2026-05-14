/**
 * בדיקה מהירה לפני פריסה: DATABASE_URL נראה כמו Neon (לא localhost),
 * וקיום מפתחות קריטיים ב-.env.local (ללא הדפסת ערכים).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

function parseKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    keys.add(t.slice(0, eq).trim());
  }
  return keys;
}

function main() {
  if (!existsSync(envPath)) {
    console.error("חסר .env.local");
    process.exit(1);
  }
  const raw = readFileSync(envPath, "utf8");
  const keys = parseKeys(raw);
  const getVal = (name) => {
    const m = raw.match(
      new RegExp(`^${name}=(.+)$`, "m"),
    );
    if (!m) return "";
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  };

  const db = getVal("DATABASE_URL");
  const direct = getVal("DIRECT_URL");
  const issues = [];

  if (!db) issues.push("DATABASE_URL ריק");
  if (!direct) {
    issues.push(
      "חסר DIRECT_URL — ב-Neon: העתק חיבור Direct (ללא pooler); בפיתוח מקומי: שכפל את DATABASE_URL",
    );
  }
  else if (/localhost|127\.0\.0\.1/i.test(db)) {
    issues.push(
      "DATABASE_URL מצביע על localhost — בפרודקשן ב־Vercel צריך מחרוזת Neon (לרוב host עם ep-…-pooler…)",
    );
  } else if (!/neon\.tech|neon\.(tech|serverless)/i.test(db)) {
    console.warn(
      "[אזהרה] DATABASE_URL לא נראה כמו Neon — אם זה מכוון, התעלם.",
    );
  }

  const need = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];
  for (const k of need) {
    if (k === "NEXTAUTH_SECRET") {
      if (!keys.has("NEXTAUTH_SECRET") && !keys.has("AUTH_SECRET")) {
        issues.push("חסר NEXTAUTH_SECRET או AUTH_SECRET");
      }
      continue;
    }
    if (!keys.has(k)) issues.push(`חסר ${k}`);
  }

  if (issues.length) {
    console.error("בעיות:\n- " + issues.join("\n- "));
    process.exit(1);
  }

  console.log(
    "בדיקה בסיסית עברה: .env.local מכיל מפתחות קריטיים ו־DATABASE_URL לא localhost.",
  );
  process.exit(0);
}

main();
