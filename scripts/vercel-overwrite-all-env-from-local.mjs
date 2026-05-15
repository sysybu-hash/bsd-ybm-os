/**
 * מחיקה מלאה של משתני Vercel (production, preview, development) ואז דחיפה מ־.env + .env.local + עקיפות פרודקשן.
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
import { platform } from "node:os";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envBasePath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");

const SKIP_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);
/** לא נדחף ל-Vercel — legacy / לא בשימוש / מפתח לא תקף */
const EXCLUDE_KEYS = new Set([
  "NEXT_PUBLIC_GEMINI_API_KEY",
  "TENANT_OS_HOSTS",
  "TENANT_FALLBACK_REDIRECT",
  "NEXT_PUBLIC_USE_API_AUTH",
  "NEXT_PUBLIC_ADMIN_EMAILS",
  "GROQ_API_KEY",
]);
const NEVER_SENSITIVE = new Set([
  "NEXTAUTH_URL",
  "AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_SITE_URL",
]);
const ENVIRONMENTS = ["production", "preview", "development"];
const DELAY_MS = 550;
const PRODUCTION_SITE_URL = "https://bsd-ybm.co.il";

/** ערכים לפרודקשן / Preview / Development ב-Vercel (לא localhost). */
const PRODUCTION_OVERRIDES = {
  NEXT_PUBLIC_SITE_URL: PRODUCTION_SITE_URL,
  NEXT_PUBLIC_API_URL: `${PRODUCTION_SITE_URL}/api`,
  NEXTAUTH_URL: PRODUCTION_SITE_URL,
  AUTH_URL: PRODUCTION_SITE_URL,
  PAYPAL_ENV: "live",
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_NOTEBOOKLM_MODEL: "gemini-2.5-flash",
  CRM_ANALYSIS_GEMINI_MODEL: "gemini-2.5-flash",
  PREMIUM_GEMINI_MODEL: "gemini-2.5-pro",
};

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

function loadMergedEnvPairs() {
  if (!existsSync(envBasePath) && !existsSync(envLocalPath)) {
    console.error("חסרים קבצי .env ו/או .env.local");
    process.exit(1);
  }
  const merged = {};
  if (existsSync(envBasePath)) {
    Object.assign(merged, dotenv.parse(readFileSync(envBasePath, "utf8")));
  }
  if (existsSync(envLocalPath)) {
    const local = dotenv.parse(readFileSync(envLocalPath, "utf8"));
    const geminiFromBase = merged.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    Object.assign(merged, local);
    if (geminiFromBase) {
      merged.GOOGLE_GENERATIVE_AI_API_KEY = geminiFromBase;
    }
  }
  for (const [key, val] of Object.entries(PRODUCTION_OVERRIDES)) {
    merged[key] = val;
  }
  const pairs = [];
  for (const [key, val] of Object.entries(merged)) {
    if (!key || SKIP_KEYS.has(key) || EXCLUDE_KEYS.has(key)) continue;
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

function isSensitiveKey(key) {
  return !key.startsWith("NEXT_PUBLIC_") && !NEVER_SENSITIVE.has(key);
}

/** דחיפה דרך Vercel CLI (עובד עם vercel login ב-Windows). */
function pushOneCli(key, val, environment, gitBranch) {
  const args = ["vercel", "env", "add", key, environment];
  if (gitBranch) args.push(gitBranch);
  args.push("--yes", "--force", "--non-interactive");
  if (environment === "development" && isSensitiveKey(key)) {
    return { ok: true, msg: "דילוג — sensitive לא נתמך ב-development" };
  }
  if (isSensitiveKey(key)) args.push("--sensitive");
  args.push("--value", val);

  const r = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: platform() === "win32",
  });

  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (/git_branch_required/.test(out) && environment === "preview" && !gitBranch) {
    return pushOneCli(key, val, environment, "*");
  }
  const ok =
    r.status === 0 ||
    /Overridden|Added Environment Variable|Environment Variables configured/i.test(
      out,
    );
  return { ok, msg: out.trim().slice(-800) };
}

function runWipe() {
  const r = spawnSync(process.execPath, [resolve(root, "scripts", "vercel-wipe-env.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  return r.status === 0;
}

function main() {
  const skipWipe = process.argv.includes("--skip-wipe");

  const pairs = loadMergedEnvPairs();
  validateCredentialJson(pairs);

  console.log(
    `מקור: ${existsSync(envBasePath) ? ".env" : ""}${existsSync(envBasePath) && existsSync(envLocalPath) ? " + " : ""}${existsSync(envLocalPath) ? ".env.local" : ""} + עקיפות פרודקשן (SITE_URL, PAYPAL live).\n`,
  );

  if (!skipWipe) {
    console.log("שלב 1/2 — מחיקת כל משתני הפרויקט ב-Vercel (למעט OIDC)…\n");
    if (!runWipe()) {
      console.error("מחיקה נכשלה.");
      process.exit(1);
    }
    console.log("\nשלב 2/2 — דחיפה ל-Vercel (CLI)…\n");
  } else {
    console.log("דחיפה בלבד (--skip-wipe), Vercel CLI…\n");
  }

  const byKey = Object.fromEntries(pairs.map((p) => [p.key, p.val]));
  const authUrl = PRODUCTION_SITE_URL;

  const filtered = pairs.filter((p) => p.key !== "NEXTAUTH_URL");

  console.log(
    `מעלה ${filtered.length} מפתחות × ${ENVIRONMENTS.length} סביבות (+ NEXTAUTH_URL).\n`,
  );

  let ok = 0;
  let fail = 0;

  function run(key, val, env) {
    const { ok: success, msg } = pushOneCli(key, val, env, undefined);
    if (!success) {
      console.error(`[שגיאה] ${key} (${env})\n${msg}`);
      fail++;
    } else {
      console.log(`[ok] ${key} → ${env}`);
      ok++;
    }
    sleepSync(DELAY_MS);
  }

  for (const { key, val } of filtered) {
    for (const env of ENVIRONMENTS) {
      run(key, val, env);
    }
  }

  for (const env of ENVIRONMENTS) {
    run("NEXTAUTH_URL", authUrl.replace(/\/$/, ""), env);
  }

  console.log(`\nסיום: ${ok} הצלחות, ${fail} כשלונות`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
