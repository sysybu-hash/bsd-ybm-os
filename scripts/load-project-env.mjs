/**
 * טוען משתני סביבה מקבצי .env בפרויקט (כמו Next.js):
 * קבצים מאוחרים יותר ברשימה דורסים קודמים; ערך מקובץ גובר על process.env ריק.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/** סדר טעינה — תואם ל-Next (בסיס → local → production → vercel pull) */
export const PROJECT_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.vercel.pull",
  ".env.vercel.prod",
  ".env.vercel.production",
];

/**
 * @param {string} [cwd]
 * @returns {Record<string, string>}
 */
export function parseProjectEnvFiles(cwd = process.cwd()) {
  /** @type {Record<string, string>} */
  const merged = {};
  for (const file of PROJECT_ENV_FILES) {
    const envPath = path.join(cwd, file);
    if (!fs.existsSync(envPath)) continue;
    try {
      const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (value != null && String(value).trim() !== "") {
          merged[key] = String(value).trim();
        }
      }
    } catch {
      /* skip unreadable env file */
    }
  }
  return merged;
}

/**
 * ממזג ל-process.env — ערכים מקבצים דורסים משתני מעטפת ריקים/חסרים.
 * @param {string} [cwd]
 */
export function applyProjectEnvFiles(cwd = process.cwd()) {
  const fromFiles = parseProjectEnvFiles(cwd);
  for (const [key, value] of Object.entries(fromFiles)) {
    process.env[key] = value;
  }
}

/**
 * @param {string} key
 * @param {string} [cwd]
 */
export function getProjectEnv(key, cwd = process.cwd()) {
  const fromFiles = parseProjectEnvFiles(cwd)[key];
  if (fromFiles) return fromFiles;
  const fromProc = process.env[key];
  return typeof fromProc === "string" ? fromProc.trim() : "";
}

/**
 * מפתח Gemini — כל השמות הנפוצים בפרויקט.
 * @param {string} [cwd]
 */
export function getProjectGeminiApiKey(cwd = process.cwd()) {
  const names = [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
  ];
  for (const name of names) {
    const v = getProjectEnv(name, cwd);
    if (v) return v;
  }
  return "";
}
