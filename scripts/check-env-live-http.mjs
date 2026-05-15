#!/usr/bin/env node
/**
 * בדיקת חיבור HTTP חיה למשתני סביבה — מדווח קוד סטטוס לכל שירות.
 * לא מדפיס ערכי סוד.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

for (const file of [".env", ".env.local", ".env.vercel.pull"]) {
  const p = path.join(process.cwd(), file);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false, quiet: true });
}

const env = process.env;
const rows = [];

function has(k) {
  const v = env[k];
  return typeof v === "string" && v.trim().length > 0;
}

function push(name, status, detail, skipped = false) {
  rows.push({ name, status, detail, skipped });
}

async function testDb() {
  if (!has("DATABASE_URL")) {
    push("DATABASE_URL", "—", "חסר", true);
    return;
  }
  const p = new PrismaClient();
  try {
    await p.$queryRaw`SELECT 1`;
    push("DATABASE_URL / DIRECT_URL", "OK", "Prisma SELECT 1");
  } catch (e) {
    push("DATABASE_URL / DIRECT_URL", "FAIL", e?.message || String(e));
  } finally {
    await p.$disconnect();
  }
}

async function testFetch(name, url, init = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    const code = res.status;
    const ok = code >= 200 && code < 300;
    let extra = "";
    if (!ok) {
      const text = await res.text().catch(() => "");
      extra = text.slice(0, 120).replace(/\s+/g, " ");
    }
    push(name, ok ? "200" : String(code), ok ? "HTTP " + code : `HTTP ${code} ${extra}`);
  } catch (e) {
    push(name, "ERR", e?.name === "AbortError" ? "timeout" : e?.message || String(e));
  }
}

async function testGemini() {
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!key) {
    push("GOOGLE_GENERATIVE_AI_API_KEY", "—", "חסר", true);
    return;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  await testFetch("GOOGLE_GENERATIVE_AI_API_KEY", url);
}

async function testMaps() {
  const key = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    push("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "—", "חסר", true);
    return;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Tel+Aviv&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({}));
    const apiStatus = j?.status || "";
    const ok = res.status === 200 && apiStatus === "OK";
    push(
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      ok ? "200" : apiStatus || String(res.status),
      ok
        ? "Geocoding OK"
        : `HTTP ${res.status} — הפעל Geocoding API + Maps JavaScript API + Places API בפרויקט bsd-ybm`,
    );
  } catch (e) {
    push("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "ERR", e?.message || String(e));
  }
}

async function testPayPal() {
  const id =
    env.PAYPAL_CLIENT_ID?.trim() || env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  const secret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    push("PayPal (CLIENT_ID + SECRET)", "—", "חסר", true);
    return;
  }
  const mode = env.PAYPAL_ENV?.trim().toLowerCase();
  const base =
    mode === "sandbox"
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  try {
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    const ok = res.status === 200;
    const j = await res.json().catch(() => ({}));
    push(
      `PayPal (${env.PAYPAL_ENV || "live"})`,
      ok ? "200" : String(res.status),
      ok ? "OAuth token" : j?.error_description || `HTTP ${res.status}`,
    );
  } catch (e) {
    push("PayPal", "ERR", e?.message || String(e));
  }
}

async function testMeckano() {
  const key = env.MECKANO_API_KEY?.trim();
  if (!key) {
    push("MECKANO_API_KEY", "—", "חסר", true);
    return;
  }
  try {
    const res = await fetch("https://app.meckano.co.il/rest/users", {
      method: "GET",
      headers: {
        key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    const ok = res.status === 200;
    push("MECKANO_API_KEY", ok ? "200" : String(res.status), ok ? "Users API" : `HTTP ${res.status}`);
  } catch (e) {
    push("MECKANO_API_KEY", "ERR", e?.message || String(e));
  }
}

async function testOpenAI() {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    push("OPENAI_API_KEY", "—", "חסר", true);
    return;
  }
  await testFetch("OPENAI_API_KEY", "https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
}

async function testAnthropic() {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    push("ANTHROPIC_API_KEY", "—", "חסר", true);
    return;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const ok = res.status === 200;
    push(
      "ANTHROPIC_API_KEY",
      ok ? "200" : String(res.status),
      ok ? "Messages API" : `HTTP ${res.status}`,
    );
  } catch (e) {
    push("ANTHROPIC_API_KEY", "ERR", e?.message || String(e));
  }
}

async function testGroq() {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) {
    push("GROQ_API_KEY", "—", "חסר", true);
    return;
  }
  await testFetch("GROQ_API_KEY", "https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
}

async function testFirebaseRtdb() {
  const base = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  if (!base) {
    push("NEXT_PUBLIC_FIREBASE_DATABASE_URL", "—", "חסר", true);
    return;
  }
  const url = `${base.replace(/\/$/, "")}/.json?shallow=true&limitToFirst=1`;
  await testFetch("NEXT_PUBLIC_FIREBASE_DATABASE_URL", url);
}

async function testSiteUrls() {
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    await testFetch("NEXT_PUBLIC_SITE_URL", site.replace(/\/$/, "") + "/");
  } else {
    push("NEXT_PUBLIC_SITE_URL", "—", "חסר", true);
  }
  const api = env.NEXT_PUBLIC_API_URL?.trim();
  if (api) {
    await testFetch("NEXT_PUBLIC_API_URL", api.replace(/\/$/, "") + "/health", {
      method: "GET",
    }).catch(() => {});
    const last = rows[rows.length - 1];
    if (last?.name === "NEXT_PUBLIC_API_URL" && last.status !== "200") {
      rows.pop();
      await testFetch("NEXT_PUBLIC_API_URL (root)", api.replace(/\/$/, "") + "/");
    }
  }
}

async function testGeminiModelsEnv() {
  const key =
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!key) return;
  for (const [envName, model] of [
    ["CRM_ANALYSIS_GEMINI_MODEL", env.CRM_ANALYSIS_GEMINI_MODEL?.trim()],
    ["PREMIUM_GEMINI_MODEL", env.PREMIUM_GEMINI_MODEL?.trim()],
  ]) {
    if (!model) continue;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(key)}`;
    await testFetch(envName, url);
  }
}

function configOnly() {
  const names = [
    "NEXTAUTH_SECRET / AUTH_SECRET",
    "NEXTAUTH_URL",
    "AUTH_TRUST_HOST",
    "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
    "LOGIN_ALLOWLIST_EMAILS",
    "TENANT_OS_HOSTS",
    "TENANT_FALLBACK_REDIRECT",
    "NEXT_PUBLIC_USE_API_AUTH",
    "NEXT_PUBLIC_ADMIN_EMAILS",
    "NEXT_PUBLIC_VAT_RATE",
    "GOOGLE_CLOUD_PROJECT_ID",
    "GOOGLE_CLOUD_LOCATION",
    "OS_PAYPAL_MERCHANT_EMAIL",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  ];
  for (const n of names) {
    push(n, "N/A", "הגדרה מקומית — אין בדיקת HTTP ישירה", true);
  }
}

async function main() {
  console.log("[check-env-live-http] בדיקות חיבור חי\n");
  await testDb();
  await testSiteUrls();
  await testGemini();
  await testGeminiModelsEnv();
  await testMaps();
  await testPayPal();
  await testMeckano();
  await testOpenAI();
  await testAnthropic();
  await testGroq();
  await testFirebaseRtdb();
  configOnly();

  const w = Math.max(36, ...rows.map((r) => r.name.length));
  console.log(`${"משתנה".padEnd(w)}  סטטוס  פירוט`);
  console.log("-".repeat(w + 40));
  for (const r of rows) {
    const st = r.skipped ? "skip" : r.status;
    console.log(`${r.name.padEnd(w)}  ${String(st).padEnd(6)}  ${r.detail}`);
  }

  const httpRows = rows.filter((r) => !r.skipped);
  const ok200 = httpRows.filter((r) => r.status === "200" || r.status === "OK");
  const failed = httpRows.filter((r) => r.status !== "200" && r.status !== "OK");

  console.log(`\nסיכום HTTP: ${ok200.length}/${httpRows.length} הצליחו (200/OK)`);
  if (failed.length) {
    console.log("\nנכשלו:");
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.status} — ${r.detail}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
