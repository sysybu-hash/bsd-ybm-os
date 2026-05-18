/**
 * דוחף משתני דואר ל-Vercel Production.
 * ערכי ברירת מחדל קבועים + RESEND/SMTP מ-.env.local אם קיימים.
 *
 * שימוש: npm run vercel:env:push:mail
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
const envLocalPath = resolve(root, ".env.local");

const ENVIRONMENTS = ["production"];
const DELAY_MS = 650;

const MAIL_DEFAULTS = {
  /** ללא <> — נמנע מבעיות shell ב-Windows; formatMailFrom מוסיף שם תצוגה */
  MAIL_FROM: "yb@bsd-ybm.co.il",
  MAIL_REPLY_TO: "yb@bsd-ybm.co.il",
  OS_ADMIN_EMAIL: "yb@bsd-ybm.co.il",
  OS_ADMIN_EMAILS: "yb@bsd-ybm.co.il,sysybu@gmail.com",
};

const OPTIONAL_FROM_LOCAL = [
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
];

const NEVER_SENSITIVE = new Set([
  "MAIL_FROM",
  "MAIL_REPLY_TO",
  "OS_ADMIN_EMAIL",
  "OS_ADMIN_EMAILS",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_HOST",
]);

function sleepSync(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* throttle */
  }
}

function pushOne(key, val, environment) {
  const args = ["vercel", "env", "add", key, environment, "--yes", "--force"];
  const sensitive =
    !key.startsWith("NEXT_PUBLIC_") && !NEVER_SENSITIVE.has(key);
  if (sensitive) args.push("--sensitive");
  args.push("--value", val);

  const r = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: platform() === "win32",
    windowsHide: true,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const success =
    r.status === 0 ||
    /Overridden|Added Environment Variable|Environment Variables configured/i.test(
      out,
    );
  return { ok: success, msg: out.trim().slice(-500) };
}

function loadLocal() {
  if (!existsSync(envLocalPath)) return {};
  return dotenv.parse(readFileSync(envLocalPath, "utf8"));
}

function main() {
  const local = loadLocal();
  const toPush = { ...MAIL_DEFAULTS };

  for (const key of OPTIONAL_FROM_LOCAL) {
    const v = local[key]?.trim() || process.env[key]?.trim();
    if (v) toPush[key] = v;
  }

  let ok = 0;
  let fail = 0;

  console.log(`דוחף ${Object.keys(toPush).length} משתני דואר → ${ENVIRONMENTS.join(", ")}\n`);

  for (const [key, val] of Object.entries(toPush)) {
    for (const env of ENVIRONMENTS) {
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
  }

  const hasTransport = Boolean(
    toPush.RESEND_API_KEY || (toPush.SMTP_HOST && toPush.SMTP_USER && toPush.SMTP_PASS),
  );

  console.log(`\nסיום: ${ok} הצלחות, ${fail} כשלונות`);
  if (!hasTransport) {
    console.warn(
      "\n⚠ חסר RESEND_API_KEY או SMTP מלא ב-.env.local — מיילים לא יישלחו עד שיוגדר מפתח.",
    );
    console.warn(
      "  הוסיפו ל-.env.local: RESEND_API_KEY=re_... ואז הריצו שוב npm run vercel:env:push:mail",
    );
  }

  process.exit(fail > 0 ? 1 : 0);
}

main();
