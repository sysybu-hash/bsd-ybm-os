/**
 * דוחף משתנים מ־`.env` ואז מ־`.env.local` (המקומי גובר) ל־Vercel — **production** בלבד.
 * אופציה: --only=KEY1,KEY2,... (ערכים מקומיים בלבד, ללא הדפסת סודות).
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envBasePath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");

const SKIP_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);

/** טעינה מאוחדת: .env ואחריו .env.local (override). */
function loadMergedEnvPairs() {
  const merged = {};
  if (existsSync(envBasePath)) {
    Object.assign(merged, dotenv.parse(readFileSync(envBasePath, "utf8")));
  }
  if (existsSync(envLocalPath)) {
    const local = dotenv.parse(readFileSync(envLocalPath, "utf8"));
    /** מפתח Gemini: .env הוא מקור האמת לפרודקשן — לא לדרוס במפתח מקומי ישן */
    const geminiFromBase = merged.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    Object.assign(merged, local);
    if (geminiFromBase) {
      merged.GOOGLE_GENERATIVE_AI_API_KEY = geminiFromBase;
    }
  }
  const out = [];
  for (const [key, val] of Object.entries(merged)) {
    if (!key || SKIP_KEYS.has(key)) continue;
    if (val == null || String(val) === "") continue;
    out.push({ key, val: String(val) });
  }
  return out;
}

/**
 * רק Production — תואם ל־CLI של Vercel:
 * Preview דורש ציון ענף Git; Development לא מקבל משתני sensitive.
 * Preview/Dev: הגדרה ידנית בדשבורד או פריסה מקומית.
 */
const ENVIRONMENTS = ["production"];
const DELAY_MS = 650;
const NEVER_SENSITIVE = new Set([
  "NEXTAUTH_URL",
  "AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_SITE_URL",
]);
const PRODUCTION_NEXTAUTH_URL = "https://bsd-ybm.co.il";

function sleepSync(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* throttle */
  }
}

const shouldUseSensitiveFlag = (key) =>
  !key.startsWith("NEXT_PUBLIC_") && !NEVER_SENSITIVE.has(key);

function pushOne(key, val, environment) {
  const args = ["vercel", "env", "add", key, environment, "--yes", "--force"];
  if (shouldUseSensitiveFlag(key)) args.push("--sensitive");
  args.push("--value", val);

  const r = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: platform() === "win32",
  });

  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const success =
    r.status === 0 ||
    /Overridden|Added Environment Variable|Environment Variables configured/i.test(
      out,
    );
  return { ok: success, msg: out.trim().slice(-800) };
}

function parseOnlyArg() {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  return arg
    .slice("--only=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveValueForOnlyKey(key, byKey) {
  if (
    key === "GEMINI_MODEL" ||
    key === "GEMINI_NOTEBOOKLM_MODEL" ||
    key === "CRM_ANALYSIS_GEMINI_MODEL" ||
    key === "PREMIUM_GEMINI_MODEL"
  ) {
    const defaults = {
      GEMINI_MODEL: "gemini-2.5-flash",
      GEMINI_NOTEBOOKLM_MODEL: "gemini-2.5-flash",
      CRM_ANALYSIS_GEMINI_MODEL: "gemini-2.5-flash",
      PREMIUM_GEMINI_MODEL: "gemini-2.5-pro",
    };
    return defaults[key];
  }
  if (
    key === "NEXTAUTH_URL" ||
    key === "AUTH_URL" ||
    key === "NEXT_PUBLIC_SITE_URL" ||
    key === "NEXT_PUBLIC_API_URL"
  ) {
    if (key === "NEXT_PUBLIC_API_URL") {
      return `${PRODUCTION_NEXTAUTH_URL.replace(/\/$/, "")}/api`;
    }
    return PRODUCTION_NEXTAUTH_URL.replace(/\/$/, "");
  }
  if (key === "NEXTAUTH_SECRET") {
    const v = byKey.NEXTAUTH_SECRET || byKey.AUTH_SECRET;
    if (!v) {
      console.error("חסר NEXTAUTH_SECRET או AUTH_SECRET ב-.env / .env.local");
      process.exit(1);
    }
    return v;
  }
  if (key === "GOOGLE_GENERATIVE_AI_API_KEY") {
    const v =
      byKey.GOOGLE_GENERATIVE_AI_API_KEY || byKey.GEMINI_API_KEY;
    if (!v) {
      console.error(
        "חסר GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY ב-.env / .env.local",
      );
      process.exit(1);
    }
    return v;
  }
  if (key === "GEMINI_API_KEY") {
    const v = byKey.GEMINI_API_KEY || byKey.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!v) {
      console.warn(`[דילוג] ${key} — לא מוגדר מקומית`);
      return null;
    }
    return v;
  }
  const v = byKey[key];
  if (v == null || v === "") {
    console.error(`חסר ${key} ב-.env / .env.local`);
    process.exit(1);
  }
  return v;
}

function main() {
  if (!existsSync(envBasePath) && !existsSync(envLocalPath)) {
    console.error("חסרים קבצי .env ו/או .env.local");
    process.exit(1);
  }

  const pairs = loadMergedEnvPairs();
  if (pairs.length === 0) {
    console.error("לא נמצאו משתנים לא ריקים ב-.env / .env.local");
    process.exit(1);
  }
  const byKey = Object.fromEntries(pairs.map((p) => [p.key, p.val]));
  const onlyKeys = parseOnlyArg();

  let ok = 0;
  let fail = 0;

  function run(key, val, env) {
    const { ok: success, msg } = pushOne(key, val, env);
    if (!success) {
      console.error(`[שגיאה] ${key} (${env})\n${msg}`);
      fail++;
    } else {
      console.log(`[ok] ${key} → ${env}`);
      ok++;
    }
    sleepSync(DELAY_MS);
  }

  if (onlyKeys?.length) {
    console.log(
      `מצב --only: ${onlyKeys.length} משתנים → ${ENVIRONMENTS.join(", ")} (NEXTAUTH_URL לפי קובץ / ברירת מחדל).\n`,
    );
    for (const key of onlyKeys) {
      const val = resolveValueForOnlyKey(key, byKey);
      if (val == null) continue;
      for (const env of ENVIRONMENTS) {
        run(key, val, env);
      }
    }
  } else {
    const authUrl =
      byKey.AUTH_URL ||
      byKey.NEXT_PUBLIC_SITE_URL ||
      PRODUCTION_NEXTAUTH_URL;
    const filtered = pairs.filter((p) => p.key !== "NEXTAUTH_URL");

    console.log(
      `מעלה ${filtered.length} משתנים ל־${ENVIRONMENTS.join(", ")} (+ NEXTAUTH_URL).\n`,
    );

    for (const { key, val } of filtered) {
      for (const env of ENVIRONMENTS) {
        run(key, val, env);
      }
    }

    for (const env of ENVIRONMENTS) {
      run("NEXTAUTH_URL", authUrl.replace(/\/$/, ""), env);
    }
  }

  console.log(`\nסיום: ${ok} הצלחות, ${fail} כשלונות`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
