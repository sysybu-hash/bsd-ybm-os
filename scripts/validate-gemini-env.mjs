/**
 * בודק מפתח Gemini מול Models API + Live ephemeral token לכל שרשרת ה-fallback.
 * שימוש: node scripts/validate-gemini-env.mjs
 */
import dotenv from "dotenv";
import { GoogleGenAI, Modality } from "@google/genai";

dotenv.config();

const key =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
  process.env.GEMINI_API_KEY?.trim();

if (!key) {
  console.error("חסר GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY");
  process.exit(1);
}

/** תואם ל־lib/gemini-model.ts (2026-05-19) */
const LIVE_MODEL_FALLBACK_CHAIN = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-latest",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
];

const envOverride = process.env.GEMINI_LIVE_MODEL?.trim();
const modelsToTest = envOverride
  ? [envOverride, ...LIVE_MODEL_FALLBACK_CHAIN.filter((m) => m !== envOverride)]
  : [...LIVE_MODEL_FALLBACK_CHAIN];

const TEXT_MODEL = "gemini-2.5-flash";

const listRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
);
const listJson = await listRes.json();
if (!listRes.ok) {
  console.error("Models API:", listRes.status, listJson?.error?.message || listJson);
  process.exit(1);
}
const modelNames = new Set((listJson.models || []).map((m) => String(m.name || "").replace(/^models\//, "")));
console.log("Models API: OK", modelNames.size, "models");
console.log("Catalog date (code): 2026-05-19");

const liveCapable = [...modelNames].filter((id) =>
  (listJson.models || []).some(
    (m) =>
      String(m.name || "").replace(/^models\//, "") === id &&
      (m.supportedGenerationMethods || []).some((x) =>
        String(x).toLowerCase().includes("bidi"),
      ),
  ),
);
if (liveCapable.length) {
  console.log("Live-capable models (sample):", liveCapable.slice(0, 8).join(", "));
}

const genRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${key}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
  },
);
console.log(`generateContent (${TEXT_MODEL}):`, genRes.status);

const client = new GoogleGenAI({ apiKey: key });
let recommended = null;

for (const model of modelsToTest) {
  try {
    await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 120 * 1000).toISOString(),
        liveConnectConstraints: {
          model,
          config: { responseModalities: [Modality.AUDIO] },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    console.log(`Live token (${model}): OK`);
    if (!recommended) recommended = model;
  } catch (e) {
    console.log(`Live token (${model}): FAIL`, String(e.message || e).slice(0, 120));
  }
}

console.log("\nRecommended GEMINI_LIVE_MODEL:", recommended ?? "(none — check API key / billing)");
if (envOverride) console.log("GEMINI_LIVE_MODEL env override:", envOverride);
console.log("\nסיום — אם הכל OK, הרץ: npm run vercel:env:push -- --only=GOOGLE_GENERATIVE_AI_API_KEY");
