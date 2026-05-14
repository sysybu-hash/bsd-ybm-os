/**
 * מבטיח DIRECT_URL אם חסר:
 * 1) Neon עם pooler — ממיר host לחיבור ישיר.
 * 2) אחרת — משכפל את DATABASE_URL (פיתוח מקומי / ללא pooler).
 * קורא מ־.env ומ־.env.local (מיזוג: .env ואז .env.local דורס).
 * כותב את המשתנה החדש לקובץ שבו מופיע DATABASE_URL (עדיפות: .env.local לפני .env).
 * לא מדפיס סודות — רק הודעות סטטוס.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseDotenvKeys(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

/** קובץ env שבו מוגדר המפתח (לשכפול ערך / הוספת שורה) */
function fileDefiningKey(paths, key) {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    if (
      raw.split(/\r?\n/).some((line) => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return false;
        const eq = t.indexOf("=");
        if (eq === -1) return false;
        return t.slice(0, eq).trim() === key;
      })
    ) {
      return p;
    }
  }
  return null;
}

function poolerToDirectNeon(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== "string") return null;
  if (!/neon\.tech/i.test(databaseUrl)) return null;
  if (!/-pooler/i.test(databaseUrl)) return null;

  const at = databaseUrl.indexOf("@");
  if (at === -1) return null;
  const afterAt = databaseUrl.slice(at + 1);
  const slash = afterAt.indexOf("/");
  if (slash === -1) return null;

  let hostPort = afterAt.slice(0, slash);
  const rest = afterAt.slice(slash);

  let host;
  let port = "";
  const lastColon = hostPort.lastIndexOf(":");
  if (lastColon > 0 && /^\d+$/.test(hostPort.slice(lastColon + 1))) {
    host = hostPort.slice(0, lastColon);
    port = hostPort.slice(lastColon);
  } else {
    host = hostPort;
    port = ":5432";
  }

  if (!host.includes("-pooler")) return null;
  const directHost = host.replace("-pooler", "");
  const newAfterAt = `${directHost}${port}${rest}`;
  return databaseUrl.slice(0, at + 1) + newAfterAt;
}

function main() {
  const envLocal = resolve(root, ".env.local");
  const envDefault = resolve(root, ".env");
  const paths = [envLocal, envDefault].filter((p) => existsSync(p));

  if (paths.length === 0) {
    console.error("חסרים .env ו-.env.local");
    process.exit(1);
  }

  const merged = new Map();
  for (const p of [envDefault, envLocal]) {
    if (!existsSync(p)) continue;
    const m = parseDotenvKeys(readFileSync(p, "utf8"));
    for (const [k, v] of m) merged.set(k, v);
  }

  const existingDirect = merged.get("DIRECT_URL");
  if (existingDirect && String(existingDirect).trim().length > 0) {
    console.log("DIRECT_URL כבר מוגדר — אין צורך בשינוי.");
    process.exit(0);
  }

  const db = merged.get("DATABASE_URL");
  if (!db) {
    console.error("חסר DATABASE_URL ב-.env או ב-.env.local");
    process.exit(1);
  }

  const derived = poolerToDirectNeon(db) ?? db;
  const target =
    fileDefiningKey([envLocal, envDefault], "DATABASE_URL") ??
    fileDefiningKey([envDefault, envLocal], "DATABASE_URL");

  if (!target) {
    console.error("לא נמצא קובץ env עם DATABASE_URL");
    process.exit(1);
  }

  const raw = readFileSync(target, "utf8");
  const sep = raw.endsWith("\n") ? "" : "\n";
  const line = `${sep}DIRECT_URL=${JSON.stringify(derived)}\n`;
  writeFileSync(target, raw + line, "utf8");

  const note =
    derived === db
      ? `נוסף DIRECT_URL (העתקת DATABASE_URL) ל-${target.endsWith(".local") ? ".env.local" : ".env"}.`
      : "נוסף DIRECT_URL (חיבור ישיר ל-Neon) — ללא הצגת הערך.";
  console.log(note);
  process.exit(0);
}

main();
