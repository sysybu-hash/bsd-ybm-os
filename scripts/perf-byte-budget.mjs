#!/usr/bin/env node
/**
 * Byte budgets per route — a perf metric this machine can actually measure.
 *
 * Lighthouse timings here are not reproducible: `docs/PERF-LCP-STATUS.md`
 * records the same commit returning performance 47 and 69 for the same route
 * twenty minutes apart, with an idle CPU and no stray processes. Two runs
 * agreeing is not evidence, because the drift is consistent across consecutive
 * runs — which already produced one wrong regression call and one wrong revert.
 *
 * What a loaded machine cannot distort is how many bytes a page asks for. That
 * is what this measures: requests, total transfer, script transfer, and the
 * largest single script, per route.
 *
 * Usage:
 *   node scripts/perf-byte-budget.mjs --base=https://www.bsd-ybm.co.il
 *   node scripts/perf-byte-budget.mjs --base=... --tier=auth
 *   node scripts/perf-byte-budget.mjs --base=... --save        (write baseline)
 *   node scripts/perf-byte-budget.mjs --base=... --check       (fail on regression)
 *
 * Auth-tier routes reuse the storage state from scripts/lighthouse-auth-setup.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const BASE = arg("base", "https://www.bsd-ybm.co.il").replace(/\/$/, "");
const TIER = arg("tier", "all");
const PRIORITY = arg("priority", null);
/** Tolerance before --check fails. Chunk hashing shifts a few bytes between builds. */
const TOLERANCE = Number(arg("tolerance", "0.05"));
const SETTLE_MS = Number(arg("settle", "8000"));

const ROOT = process.cwd();
const MATRIX = path.join(ROOT, "config", "lighthouse-url-matrix.json");
const BASELINE = path.join(ROOT, "config", "perf-byte-baseline.json");
const AUTH_STATE = path.join(ROOT, "reports", ".lighthouse-auth-state.json");

const { urls } = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
const routes = urls.filter(
  (u) =>
    (TIER === "all" || u.tier === TIER) &&
    (!PRIORITY || u.priority === PRIORITY),
);

if (routes.some((r) => r.requiresAuth) && !fs.existsSync(AUTH_STATE)) {
  console.error(
    `Missing ${path.relative(ROOT, AUTH_STATE)} — run scripts/lighthouse-auth-setup.mjs first.`,
  );
  process.exit(1);
}

/**
 * Encoded (over-the-wire) body size, from Playwright's own accounting.
 *
 * An earlier version preferred the `content-length` header and fell back to the
 * decoded body when it was absent. That silently mixed two different units: a
 * brotli-compressed chunk served without `content-length` was reported at its
 * decoded size while its neighbour was reported compressed, so routes were not
 * comparable — `/` looked like it shipped a 790KB script next to `/login`'s
 * 297KB when the difference was largely the unit.
 *
 * `request.sizes().responseBodySize` is always the encoded size, so every route
 * is measured the same way.
 */
async function transferSize(res) {
  try {
    const sizes = await res.request().sizes();
    return sizes.responseBodySize ?? 0;
  } catch {
    return 0;
  }
}

async function measure(context, route) {
  const page = await context.newPage();
  const seen = [];
  page.on("response", async (res) => {
    seen.push({
      type: res.request().resourceType(),
      size: await transferSize(res),
      url: res.url(),
    });
  });

  try {
    // Not networkidle: the workspace polls (presence heartbeat, notifications
    // feed) and never goes idle, so it would always time out.
    await page.goto(`${BASE}${route.pathname}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(SETTLE_MS);
  } catch (err) {
    await page.close();
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const scripts = seen.filter((r) => r.type === "script");
  const largest = scripts.reduce((m, r) => (r.size > m.size ? r : m), { size: 0, url: "" });

  /**
   * Third-party bytes are tracked separately because they are a different kind
   * of risk, not just weight. The App Builder preview was pulling
   * @babel/standalone from unpkg.com — 622KB, the largest asset on the whole
   * site, and executable code from a host this project does not control. A
   * total-bytes number alone would have shown a big page; it would not have
   * shown that most of it came from somewhere else.
   */
  const thirdParty = seen.filter((r) => {
    try {
      return new URL(r.url).origin !== new URL(BASE).origin;
    } catch {
      return false;
    }
  });
  const hosts = [...new Set(thirdParty.filter((r) => r.size > 0).map((r) => new URL(r.url).host))];

  await page.close();

  return {
    requests: seen.length,
    totalKB: Math.round(seen.reduce((s, r) => s + r.size, 0) / 1024),
    scriptKB: Math.round(scripts.reduce((s, r) => s + r.size, 0) / 1024),
    largestScriptKB: Math.round(largest.size / 1024),
    thirdPartyKB: Math.round(thirdParty.reduce((s, r) => s + r.size, 0) / 1024),
    thirdPartyHosts: hosts.sort(),
  };
}

const browser = await chromium.launch();
const results = {};

for (const route of routes) {
  const context = await browser.newContext({
    ...(route.requiresAuth ? { storageState: AUTH_STATE } : {}),
    viewport: { width: 412, height: 823 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36",
  });
  const out = await measure(context, route);
  await context.close();
  results[route.pathname] = out;

  if (out.error) {
    console.log(`  ${route.pathname.padEnd(34)} FAILED  ${out.error.slice(0, 60)}`);
  } else {
    console.log(
      `  ${route.pathname.padEnd(34)} ${String(out.requests).padStart(3)} req  ` +
        `${String(out.totalKB).padStart(5)}KB total  ${String(out.scriptKB).padStart(5)}KB js  ` +
        `${String(out.largestScriptKB).padStart(4)}KB largest  ` +
        `${String(out.thirdPartyKB).padStart(4)}KB 3p` +
        (out.thirdPartyHosts.length ? `  [${out.thirdPartyHosts.join(" ")}]` : ""),
    );
  }
}

await browser.close();

if (flag("save")) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nBaseline written to ${path.relative(ROOT, BASELINE)}`);
  process.exit(0);
}

if (flag("check")) {
  if (!fs.existsSync(BASELINE)) {
    console.error("\nNo baseline. Run with --save first.");
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const regressions = [];
  for (const [pathname, now] of Object.entries(results)) {
    const before = base[pathname];
    if (!before || now.error || before.error) continue;
    // A new third-party host is reported regardless of size: it is a change in
    // who can run code on the page, which no byte threshold should absorb.
    const newHosts = (now.thirdPartyHosts ?? []).filter(
      (h) => !(before.thirdPartyHosts ?? []).includes(h),
    );
    if (newHosts.length > 0) {
      regressions.push(`  ${pathname}  new third-party host(s): ${newHosts.join(", ")}`);
    }
    for (const key of ["totalKB", "scriptKB", "largestScriptKB", "thirdPartyKB"]) {
      const limit = before[key] * (1 + TOLERANCE);
      if (now[key] > limit) {
        regressions.push(
          `  ${pathname}  ${key}: ${before[key]}KB -> ${now[key]}KB ` +
            `(+${Math.round(((now[key] - before[key]) / before[key]) * 100)}%)`,
        );
      }
    }
  }
  if (regressions.length > 0) {
    console.error(`\nFAIL: byte budget regressed (tolerance ${TOLERANCE * 100}%)`);
    for (const r of regressions) console.error(r);
    console.error("\n  Intentional? Re-run with --save to move the baseline.");
    process.exit(1);
  }
  console.log("\nByte budgets OK.");
}
