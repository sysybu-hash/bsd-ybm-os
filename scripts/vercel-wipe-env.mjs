/**
 * מוחק את כל משתני הסביבה בפרויקט Vercel (production, preview, development),
 * למעט VERCEL_OIDC_TOKEN (נשאר — מנוהל על ידי Vercel).
 * מחיקה לפי סביבה — נדרש כש־Vercel שומר אותו מפתח בנפרד לכל env.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SKIP_RM = new Set(["VERCEL_OIDC_TOKEN"]);
const TARGET_ENVS = ["production", "preview", "development"];

function sleepSync(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* throttle */
  }
}

function parseJsonFromStdout(stdout) {
  const s = String(stdout || "");
  const i = s.indexOf("{");
  if (i === -1) throw new Error("לא נמצא JSON בפלט Vercel");
  return JSON.parse(s.slice(i));
}

function listKeys(env) {
  const r = spawnSync(
    "npx",
    ["vercel", "env", "list", env, "--format", "json"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: platform() === "win32",
    },
  );
  if (r.status !== 0) {
    throw new Error(
      `vercel env list ${env} נכשל:\n${(r.stderr || r.stdout || "").slice(-2000)}`,
    );
  }
  const data = parseJsonFromStdout(r.stdout);
  const envs = data.envs || [];
  const keys = new Set();
  for (const e of envs) {
    if (e.key && Array.isArray(e.target) && e.target.includes(env)) {
      keys.add(e.key);
    }
  }
  return keys;
}

function removeKeyInEnv(key, env) {
  const r = spawnSync(
    "npx",
    ["vercel", "env", "remove", key, env, "--yes"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      shell: platform() === "win32",
    },
  );
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const ok =
    r.status === 0 ||
    /Removed|removed|Environment Variable.*removed/i.test(out) ||
    /not found|does not exist|No environment variables/i.test(out);
  return { ok, msg: out.trim().slice(-400) };
}

function main() {
  let totalOps = 0;
  const tasks = [];

  for (const env of TARGET_ENVS) {
    let keys;
    try {
      keys = listKeys(env);
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(1);
    }
    for (const key of keys) {
      if (SKIP_RM.has(key)) continue;
      tasks.push({ key, env });
    }
  }

  console.log(`נמצאו ${tasks.length} מחיקות (מפתח×סביבה), ללא OIDC.\n`);

  let ok = 0;
  let fail = 0;
  for (const { key, env } of tasks) {
    const { ok: success, msg } = removeKeyInEnv(key, env);
    totalOps++;
    if (success) {
      console.log(`[נמחק] ${key} (${env})`);
      ok++;
    } else {
      console.error(`[שגיאה] ${key} (${env})\n${msg}`);
      fail++;
    }
    sleepSync(350);
  }

  console.log(`\nסיום מחיקה: ${ok} הצלחות, ${fail} כשלונות (${totalOps} פעולות)`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
