#!/usr/bin/env node
/**
 * Playwright login → storage state for authenticated Lighthouse runs.
 *
 * Usage:
 *   node scripts/lighthouse-auth-setup.mjs --base=http://127.0.0.1:3000
 *
 * Env: E2E_EMAIL, E2E_PASSWORD (from .env.local)
 * Output: reports/.lighthouse-auth-state.json
 */

import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const E2E_EMAIL = process.env.E2E_EMAIL ?? "owner@bsd-demo.test";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Demo!2026";
const COOKIE_CONSENT_KEY = "bsd-ybm-cookie-consent-v1";
const PASSKEY_OFFER_KEY = "bsd-passkey-offer-dismissed";
const FIRST_DAY_WIZARD_KEY = "bsd_ybm_first_day_wizard_v2";
const LAUNCHER_V2_BANNER_KEY = "bsd_ybm_launcher_v2_banner_seen";
const LAUNCHER_STORAGE_KEY = "bsd_ybm_launcher_v2";

function argValue(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function parseBase() {
  const fromArg = argValue("--base=");
  const fromEnv = process.env.LIGHTHOUSE_BASE_URL?.trim();
  const raw = fromArg ?? fromEnv ?? "http://127.0.0.1:3000";
  return raw.replace(/\/$/, "");
}

async function primeStorage(page) {
  await page.addInitScript(
    ({ passkeyKey, wizardKey, launcherBannerKey, launcherStorageKey, cookieKey }) => {
      try {
        localStorage.setItem(passkeyKey, "1");
        localStorage.setItem(wizardKey, "dismissed");
        localStorage.setItem(launcherBannerKey, "1");
        localStorage.setItem(launcherStorageKey, "{}");
        localStorage.setItem(
          cookieKey,
          JSON.stringify({
            version: 1,
            necessary: true,
            analytics: true,
            marketing: true,
            updatedAt: new Date().toISOString(),
          }),
        );
      } catch {
        /* ignore */
      }
    },
    {
      passkeyKey: PASSKEY_OFFER_KEY,
      wizardKey: FIRST_DAY_WIZARD_KEY,
      launcherBannerKey: LAUNCHER_V2_BANNER_KEY,
      launcherStorageKey: LAUNCHER_STORAGE_KEY,
      cookieKey: COOKIE_CONSENT_KEY,
    },
  );
}

async function signInViaApi(page, base) {
  return page.evaluate(
    async ({ email, password, origin }) => {
      const csrf = (await fetch(`${origin}/api/auth/csrf`).then((r) => r.json())) as {
        csrfToken: string;
      };
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email,
        password,
        callbackUrl: `${origin}/`,
        json: "true",
      });
      const res = await fetch(`${origin}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (data?.error) return false;
      if (data?.url) await fetch(data.url, { credentials: "include" });
      const session = await fetch("/api/auth/session", { credentials: "include" }).then((r) => r.json());
      return Boolean((session as { user?: { email?: string } }).user?.email);
    },
    { email: E2E_EMAIL, password: E2E_PASSWORD, origin: base },
  );
}

async function main() {
  const base = parseBase();
  const outDir = path.join(process.cwd(), "reports");
  const outPath = path.join(outDir, ".lighthouse-auth-state.json");

  console.log(`[lighthouse-auth-setup] base=${base} email=${E2E_EMAIL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();

  await primeStorage(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const ok = await signInViaApi(page, base);
  if (!ok) {
    await browser.close();
    console.error("[lighthouse-auth-setup] credentials sign-in failed");
    process.exit(1);
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("navigation", { name: /יישומים|Apps/i })
    .or(page.getByTestId("mobile-bottom-nav"))
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});

  fs.mkdirSync(outDir, { recursive: true });
  await context.storageState({ path: outPath });
  await browser.close();

  console.log(`[lighthouse-auth-setup] wrote ${outPath}`);
}

main().catch((e) => {
  console.error("[lighthouse-auth-setup] failed:", e?.message ?? e);
  process.exit(1);
});
