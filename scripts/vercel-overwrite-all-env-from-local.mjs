/**
 * מחיקה מלאה של משתני Vercel (production, preview, development) ואז דחיפה מ־.env.local.
 *
 * GOOGLE_DOCUMENT_AI_CREDENTIALS (JSON עם private_key ו-\\n):
 * - נקראים דרך dotenv.parse (תקן dotenv) כדי לפרש מרכאות ובריחים נכון.
 * - נשלחים ל-Vercel ב־JSON של REST API (גוף HTTP) — ללא שורת פקודה וללא stdin,
 *   כך ש-Newline בתוך המחרוזת נשמרים בדיוק.
 *
 * דרישות: vercel login (או VERCEL_TOKEN), ו־.vercel/project.json (vercel link).
 *
 * שימוש:
 *   npm run vercel:env:overwrite-all
 *   npm run vercel:env:overwrite-all -- --skip-wipe
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

const SKIP_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);
const ENVIRONMENTS = ["production", "preview", "development"];
const DELAY_MS = 400;
const PRODUCTION_NEXTAUTH_URL = "https://bsd-ybm.co.il";

const JSON_CREDENTIAL_KEYS = new Set([
  "GOOGLE_DOCUMENT_AI_CREDENTIALS",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
]);

function sleepSync(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* throttle */
  }
}

function loadProjectLink() {
  const p = join(root, ".vercel", "project.json");
  if (!existsSync(p)) {
    throw new Error("חסר .vercel/project.json — הריצו vercel link מהשורש.");
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function getVercelToken() {
  const t = process.env.VERCEL_TOKEN?.trim();
  if (t) return t;
  const authPath = join(homedir(), ".vercel", "auth.json");
  if (existsSync(authPath)) {
    const j = JSON.parse(readFileSync(authPath, "utf8"));
    if (j.token?.trim()) return j.token.trim();
  }
  throw new Error("חסר VERCEL_TOKEN או קובץ התחברות (~/.vercel/auth.json). הריצו vercel login.");
}

/** מפתחות ציבוריים בלבד — plain; כל השאר encrypted ב-API */
function vercelApiValueType(key) {
  return key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted";
}

function loadEnvLocalPairs() {
  if (!existsSync(envPath)) {
    console.error("חסר קובץ .env.local");
    process.exit(1);
  }
  const raw = readFileSync(envPath);
  const parsed = dotenv.parse(raw);
  const pairs = [];
  for (const [key, val] of Object.entries(parsed)) {
    if (!key || SKIP_KEYS.has(key)) continue;
    if (val == null || String(val).length === 0) continue;
    pairs.push({ key, val: String(val) });
  }
  return pairs;
}

function validateCredentialJson(pairs) {
  for (const key of JSON_CREDENTIAL_KEYS) {
    const row = pairs.find((p) => p.key === key);
    if (!row) continue;
    try {
      JSON.parse(row.val);
    } catch (e) {
      console.error(
        `[${key}] אחרי dotenv.parse הערך אינו JSON תקף: ${e.message}\n` +
          "בדקו מרכאות ב-.env.local ושהמפתח הפרטי מקודד כ-\\n בתוך המחרוזת אם בשורה אחת.",
      );
      process.exit(1);
    }
  }
}

/**
 * Vercel REST API v10 — upsert; Preview עם gitBranch: null לכל ענפי ה-Preview.
 */
async function upsertEnvViaApi(key, val, environment) {
  const { projectId, orgId } = loadProjectLink();
  const token = getVercelToken();
  const type = vercelApiValueType(key);

  const body = {
    key,
    value: val,
    type,
    target: [environment],
  };
  if (environment === "preview") {
    body.gitBranch = null;
  }

  const qs = new URLSearchParams({
    teamId: orgId,
    upsert: "true",
  });
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?${qs}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 800);
    try {
      const j = JSON.parse(text);
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* keep text */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return text;
}

function runWipe() {
  const r = spawnSync(process.execPath, [resolve(root, "scripts", "vercel-wipe-env.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  return r.status === 0;
}

async function main() {
  const skipWipe = process.argv.includes("--skip-wipe");

  const pairs = loadEnvLocalPairs();
  validateCredentialJson(pairs);

  if (!skipWipe) {
    console.log("שלב 1/2 — מחיקת כל משתני הפרויקט ב-Vercel (למעט OIDC)…\n");
    if (!runWipe()) {
      console.error("מחיקה נכשלה.");
      process.exit(1);
    }
    console.log("\nשלב 2/2 — דחיפה מ-.env.local (REST API)…\n");
  } else {
    console.log("דחיפה בלבד (--skip-wipe), REST API…\n");
  }

  const byKey = Object.fromEntries(pairs.map((p) => [p.key, p.val]));
  const authUrl =
    byKey.AUTH_URL ||
    byKey.NEXT_PUBLIC_SITE_URL ||
    PRODUCTION_NEXTAUTH_URL;

  const filtered = pairs.filter((p) => p.key !== "NEXTAUTH_URL");

  console.log(
    `מעלה ${filtered.length} מפתחות × ${ENVIRONMENTS.length} סביבות (+ NEXTAUTH_URL).\n`,
  );

  let ok = 0;
  let fail = 0;

  async function run(key, val, env) {
    try {
      await upsertEnvViaApi(key, val, env);
      console.log(`[ok] ${key} → ${env}`);
      ok++;
    } catch (e) {
      console.error(`[שגיאה] ${key} (${env})\n${e instanceof Error ? e.message : e}`);
      fail++;
    }
    sleepSync(DELAY_MS);
  }

  for (const { key, val } of filtered) {
    for (const env of ENVIRONMENTS) {
      await run(key, val, env);
    }
  }

  for (const env of ENVIRONMENTS) {
    await run("NEXTAUTH_URL", authUrl.replace(/\/$/, ""), env);
  }

  console.log(`\nסיום: ${ok} הצלחות, ${fail} כשלונות`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
