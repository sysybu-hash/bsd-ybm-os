import { chromium } from "playwright";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
const password = process.env.E2E_PASSWORD ?? "Demo!2026";

async function checkGeminiKey() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    console.log("gemini-live", 0, "missing_key");
    return;
  }
  const models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    process.env.GEMINI_MODEL || process.env.GOOGLE_GENERATIVE_AI_MODEL || "gemini-3.1-pro-stable",
  ];
  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelId of [...new Set(models)]) {
    try {
      const result = await genAI
        .getGenerativeModel({ model: modelId })
        .generateContent(['Return JSON only: {"ok": true}']);
      console.log("gemini-live", 200, modelId, result.response.text().slice(0, 120));
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("gemini-live", 500, modelId, msg.slice(0, 360).replace(/\s+/g, " "));
    }
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL });

try {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const csrf = await page.request.get("/api/auth/csrf").then((r) => r.json());
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: `${baseURL}/app`,
      json: "true",
    },
  });

  const meta = await page.request.get("/api/scan/engine-meta");
  console.log("engine-meta", meta.status(), await meta.text());
  await checkGeminiKey();

  const sample = [
    "חשבונית ספק",
    "ספק: חומרי בדיקה בעמ",
    "תאריך: 22/04/2026",
    "פריט: ברזל 12 ממ, כמות 10, מחיר יחידה 5.20, סהכ 52",
    "מע״מ: 8.84",
    "סהכ לתשלום: 60.84",
  ].join("\n");

  const response = await page.request.post("/api/scan/tri-engine", {
    timeout: 180_000,
    multipart: {
      scanMode: "INVOICE_FINANCIAL",
      persist: "false",
      project: "בדיקת מנועים חיה",
      client: "לקוח בדיקה",
      file: {
        name: "live-engine-check.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(sample, "utf8"),
      },
    },
  });

  const text = await response.text();
  console.log("tri-engine", response.status(), text.slice(0, 4000));
  if (!response.ok()) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
