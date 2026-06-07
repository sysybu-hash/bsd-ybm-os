#!/usr/bin/env node
/**
 * Full-site Lighthouse matrix (public + authenticated).
 *
 * Usage:
 *   node scripts/lighthouse-site-matrix.mjs --base=https://www.bsd-ybm.co.il --tier=public --strategy=both
 *   node scripts/lighthouse-site-matrix.mjs --base=http://127.0.0.1:3000 --tier=auth --strategy=mobile
 *
 * Args:
 *   --base=<url>
 *   --strategy=mobile|desktop|both  (default: mobile)
 *   --tier=public|auth|all          (default: all)
 *   --priority=P0|P1|P2|P3          (filter max priority)
 *   --output-dir=reports/pagespeed
 *   --fail-under=100                (exit 1 if any score below N)
 *   --auth-state=reports/.lighthouse-auth-state.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = path.join(__dirname, "..", "config", "lighthouse-url-matrix.json");

const CATEGORY_KEYS = ["performance", "accessibility", "best-practices", "seo"];

function argValue(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function parseBase() {
  const raw = argValue("--base=") ?? process.env.LIGHTHOUSE_BASE_URL ?? "http://127.0.0.1:3000";
  return raw.replace(/\/$/, "");
}

function parseStrategy() {
  const s = argValue("--strategy=")?.toLowerCase() ?? "mobile";
  if (s === "both") return ["mobile", "desktop"];
  if (s === "desktop" || s === "mobile") return [s];
  return ["mobile"];
}

function parseTier() {
  return argValue("--tier=")?.toLowerCase() ?? "all";
}

function parsePriority() {
  const p = argValue("--priority=")?.toUpperCase();
  if (!p) return null;
  const order = ["P0", "P1", "P2", "P3"];
  const idx = order.indexOf(p);
  return idx >= 0 ? order.slice(0, idx + 1) : null;
}

function parseOutputDir() {
  return argValue("--output-dir=") ?? "reports/pagespeed";
}

function parseFailUnder() {
  const raw = argValue("--fail-under=");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseAuthState() {
  return argValue("--auth-state=") ?? "reports/.lighthouse-auth-state.json";
}

function loadMatrix() {
  return JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
}

function filterUrls(urls, { tier, priorities }) {
  return urls.filter((entry) => {
    if (tier !== "all" && entry.tier !== tier) return false;
    if (priorities && !priorities.includes(entry.priority)) return false;
    return true;
  });
}

function categoryScores(lhr) {
  const cats = lhr?.categories ?? {};
  const out = {};
  for (const key of CATEGORY_KEYS) {
    const c = cats[key];
    out[key] = typeof c?.score === "number" ? c.score : null;
  }
  return out;
}

function auditMetrics(lhr) {
  const a = lhr?.audits ?? {};
  const num = (id) => {
    const v = a[id]?.numericValue;
    return typeof v === "number" ? v : null;
  };
  return {
    lcpMs: num("largest-contentful-paint") != null ? Math.round(num("largest-contentful-paint")) : null,
    cls: num("cumulative-layout-shift"),
    tbtMs: num("total-blocking-time") != null ? Math.round(num("total-blocking-time")) : null,
    inpMs: num("interaction-to-next-paint") != null ? Math.round(num("interaction-to-next-paint")) : null,
  };
}

function failedAudits(lhr, limit = 8) {
  const audits = lhr?.audits ?? {};
  return Object.entries(audits)
    .filter(([, a]) => a?.score != null && a.score < 1 && a.scoreDisplayMode !== "informative")
    .sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0))
    .slice(0, limit)
    .map(([id, a]) => ({ id, title: a.title, score: a.score }));
}

function lighthouseSettings(strategy) {
  return {
    onlyCategories: CATEGORY_KEYS,
    formFactor: strategy,
    screenEmulation:
      strategy === "mobile"
        ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
        : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  };
}

function toPuppeteerCookies(storageState, baseUrl) {
  const host = new URL(baseUrl).hostname;
  const cookies = storageState?.cookies ?? [];
  return cookies
    .filter((c) => !c.domain || host.endsWith(c.domain.replace(/^\./, "")))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || host,
      path: c.path ?? "/",
      expires: c.expires && c.expires > 0 ? c.expires : undefined,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? baseUrl.startsWith("https"),
      sameSite: c.sameSite === "None" ? "None" : c.sameSite === "Strict" ? "Strict" : "Lax",
    }));
}

async function runLighthouseOnPage(browser, targetUrl, strategy) {
  const page = await browser.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 90_000 });
  } catch {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => {});
  }

  const port = new URL(browser.wsEndpoint()).port;
  const runnerResult = await lighthouse(targetUrl, {
    logLevel: "error",
    output: "json",
    port: Number(port),
    ...lighthouseSettings(strategy),
  });
  await page.close();
  return runnerResult?.lhr;
}

async function main() {
  const base = parseBase();
  const strategies = parseStrategy();
  const tier = parseTier();
  const priorities = parsePriority();
  const outputDir = path.join(process.cwd(), parseOutputDir());
  const failUnder = parseFailUnder();
  const authStatePath = path.join(process.cwd(), parseAuthState());

  const { urls } = loadMatrix();
  const selected = filterUrls(urls, { tier, priorities });

  const needsAuth = selected.some((u) => u.requiresAuth);
  let puppeteerCookies = [];
  if (needsAuth) {
    if (!fs.existsSync(authStatePath)) {
      console.error(
        `[lighthouse-site-matrix] auth URLs require ${authStatePath} — run: node scripts/lighthouse-auth-setup.mjs --base=${base}`,
      );
      process.exit(1);
    }
    const state = JSON.parse(fs.readFileSync(authStatePath, "utf8"));
    puppeteerCookies = toPuppeteerCookies(state, base);
  }

  console.log(
    `[lighthouse-site-matrix] base=${base} tier=${tier} strategies=${strategies.join(",")} urls=${selected.length}`,
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  if (puppeteerCookies.length > 0) {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.setCookie(...puppeteerCookies);
    await page.close();
  }

  let exitCode = 0;
  const bundle = [];
  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  for (const entry of selected) {
    const pathname = entry.pathname;
    const targetUrl = pathname.startsWith("/?")
      ? `${base}${pathname}`
      : new URL(pathname, `${base}/`).href;

    for (const strategy of strategies) {
      const label = `${pathname.replace(/[^a-zA-Z0-9]+/g, "_")}-${strategy}`;
      process.stdout.write(`  → ${targetUrl} (${strategy}) ... `);

      let lhr;
      try {
        lhr = await runLighthouseOnPage(browser, targetUrl, strategy);
      } catch (e) {
        console.log(`FAIL ${e?.message ?? e}`);
        exitCode = 1;
        bundle.push({
          url: targetUrl,
          pathname,
          strategy,
          tier: entry.tier,
          priority: entry.priority,
          error: e?.message ?? String(e),
          fetchedAt: new Date().toISOString(),
        });
        continue;
      }

      const scores = categoryScores(lhr);
      const metrics = auditMetrics(lhr);
      const parts = Object.entries(scores)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}:${Math.round(v * 100)}`);
      const metricPart = [
        metrics.lcpMs != null ? `LCP=${metrics.lcpMs}ms` : null,
        metrics.tbtMs != null ? `TBT=${metrics.tbtMs}ms` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`${parts.join(" ")} ${metricPart}`.trim());

      const record = {
        url: targetUrl,
        pathname,
        strategy,
        tier: entry.tier,
        priority: entry.priority,
        requiresAuth: entry.requiresAuth,
        fetchedAt: new Date().toISOString(),
        scores,
        metrics,
        failedAudits: failedAudits(lhr),
      };
      bundle.push(record);

      const outFile = path.join(outputDir, `${runId}-${label}.json`);
      fs.writeFileSync(outFile, JSON.stringify({ ...record, categories: lhr?.categories }, null, 2));

      if (failUnder != null) {
        for (const [key, score] of Object.entries(scores)) {
          if (score != null && Math.round(score * 100) < failUnder) {
            console.error(`    ✗ ${pathname} ${strategy} ${key}=${Math.round(score * 100)} < ${failUnder}`);
            exitCode = 1;
          }
        }
      }
    }
  }

  const summaryPath = path.join(outputDir, `${runId}-summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(bundle, null, 2), "utf8");
  console.log(`[lighthouse-site-matrix] wrote ${summaryPath} (${bundle.length} runs)`);

  try {
    await browser.close();
  } catch (e) {
    if (process.platform === "win32") {
      console.warn("[lighthouse-site-matrix] browser cleanup skipped (Windows)");
    } else {
      console.warn(`[lighthouse-site-matrix] browser cleanup: ${e?.message ?? e}`);
    }
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error("[lighthouse-site-matrix] failed:", e?.message ?? e);
  process.exit(1);
});
