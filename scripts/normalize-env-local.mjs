/**
 * מנקה .env.local: מסיר כפילויות של מפתחות (השורה האחרונה נשארת),
 * חותך רווחים מיותרים בשורות, מסיר BOM, מבטיח שורה אחרונה.
 * לא מדפיס ערכים.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function isAssignmentLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return false;
  const eq = t.indexOf("=");
  if (eq <= 0) return false;
  const key = t.slice(0, eq).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function getKeyFromLine(line) {
  const t = line.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) return null;
  return t.slice(0, eq).trim();
}

function main() {
  if (!existsSync(envPath)) {
    console.error("חסר .env.local");
    process.exit(1);
  }

  let raw = readFileSync(envPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const lines = raw.split(/\r?\n/);
  const winningIndex = new Map();

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isAssignmentLine(lines[i])) continue;
    const key = getKeyFromLine(lines[i]);
    if (!key || winningIndex.has(key)) continue;
    winningIndex.set(key, i);
  }

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAssignmentLine(line)) {
      const key = getKeyFromLine(line);
      if (key && winningIndex.get(key) !== i) continue;
    }
    out.push(line.replace(/\s+$/, ""));
  }

  let text = out.join("\n");
  if (!text.endsWith("\n")) text += "\n";
  writeFileSync(envPath, text, "utf8");
  console.log(
    `עודכן .env.local — ${winningIndex.size} מפתחות ייחודיים (כפילויות הוסרו).`,
  );
}

main();
