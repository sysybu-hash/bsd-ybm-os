/**
 * בודק מפתח Gemini מול Models API + Live ephemeral token.
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

const LIVE_MODELS = [
  "gemini-2.5-flash-native-audio-latest",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3.1-flash-live-preview",
];

const TEXT_MODEL = "gemini-2.5-flash";

const listRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
);
const listJson = await listRes.json();
if (!listRes.ok) {
  console.error("Models API:", listRes.status, listJson?.error?.message || listJson);
  process.exit(1);
}
console.log("Models API: OK", (listJson.models || []).length, "models");

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
for (const model of LIVE_MODELS) {
  try {
    await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model,
          config: { responseModalities: [Modality.AUDIO] },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    console.log(`Live token (${model}): OK`);
  } catch (e) {
    console.log(`Live token (${model}): FAIL`, String(e.message || e).slice(0, 120));
  }
}

console.log("\nסיום — אם הכל OK, הרץ: npm run vercel:env:push -- --only=GOOGLE_GENERATIVE_AI_API_KEY");
