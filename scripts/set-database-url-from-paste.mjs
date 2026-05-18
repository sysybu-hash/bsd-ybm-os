/**
 * מעדכן DATABASE_URL ו-DIRECT_URL ב-.env.local ממחרוזת שהודבקה (Neon Console).
 * שימוש: node scripts/set-database-url-from-paste.mjs "postgresql://..."
 * או: echo postgresql://... | node scripts/set-database-url-from-paste.mjs
 * לא מדפיס סיסמאות.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, ".env.local");

function poolerToDirect(databaseUrl) {
  if (!/neon\.tech/i.test(databaseUrl) || !/-pooler/i.test(databaseUrl)) {
    return databaseUrl;
  }
  const at = databaseUrl.indexOf("@");
  if (at === -1) return databaseUrl;
  const afterAt = databaseUrl.slice(at + 1);
  const slash = afterAt.indexOf("/");
  if (slash === -1) return databaseUrl;
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
  if (!host.includes("-pooler")) return databaseUrl;
  const directHost = host.replace("-pooler", "");
  return databaseUrl.slice(0, at + 1) + directHost + port + rest;
}

function normalizeUrl(raw) {
  let url = raw.trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error("מחרוזת לא תקינה — חייבת להתחיל ב-postgresql://");
  }
  if (!/sslmode=/i.test(url)) {
    url += url.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }
  return url.replace(/[?&]channel_binding=require/gi, "");
}

function setOrReplace(content, key, value) {
  const line = `${key}=${JSON.stringify(value)}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  const sep = content.endsWith("\n") ? "" : "\n";
  return content + sep + line + "\n";
}

async function readInput() {
  const arg = process.argv[2];
  if (arg) return arg;
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function main() {
  if (!existsSync(target)) {
    console.error("חסר .env.local");
    process.exit(1);
  }

  let pooled;
  try {
    pooled = normalizeUrl(readInputSync());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const direct = poolerToDirect(pooled);
  let content = readFileSync(target, "utf8");
  content = setOrReplace(content, "DATABASE_URL", pooled);
  content = setOrReplace(content, "DIRECT_URL", direct);
  writeFileSync(target, content, "utf8");

  const host = pooled.match(/@([^/?]+)/)?.[1] ?? "?";
  console.log("עודכן .env.local — DATABASE_URL ו-DIRECT_URL");
  console.log("host:", host);
  console.log("הרץ: npm run db:test-connection");
}

function readInputSync() {
  const arg = process.argv.slice(2).join(" ").trim();
  if (arg) return arg;
  try {
    return readFileSync(0, "utf8");
  } catch {
    console.error(
      'הדבק מחרוזת: node scripts/set-database-url-from-paste.mjs "postgresql://..."',
    );
    process.exit(1);
  }
}

main();
