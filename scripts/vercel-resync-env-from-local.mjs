/**
 * 1) מנרמל .env.local (כפילויות)
 * 2) מוחק את כל משתני Vercel (פרויקט)
 * 3) דוחף מחדש מהקובץ המקומי ל-production (כמו vercel:env:push)
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    shell: platform() === "win32",
  });
  return r.status === 0;
}

function main() {
  console.log("שלב 1/3 — נירמול .env.local\n");
  if (!run("node", [resolve(root, "scripts", "normalize-env-local.mjs")])) {
    process.exit(1);
  }

  console.log("\nשלב 2/3 — מחיקת משתנים ב-Vercel\n");
  if (!run("node", [resolve(root, "scripts", "vercel-wipe-env.mjs")])) {
    process.exit(1);
  }

  console.log("\nשלב 3/3 — דחיפה מחדש ל-production\n");
  if (!run("node", [resolve(root, "scripts", "vercel-push-env-from-local.mjs")])) {
    process.exit(1);
  }

  console.log("\nסיום resync מלא.");
}

main();
