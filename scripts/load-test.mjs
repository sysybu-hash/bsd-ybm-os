#!/usr/bin/env node
/**
 * BSD-YBM OS — Load Test Script
 * Stage 12.2 — Launch Readiness
 *
 * Usage:
 *   BASE_URL=https://staging.bsd-ybm.co.il \
 *   E2E_COOKIE="next-auth.session-token=..." \
 *   node scripts/load-test.mjs
 *
 * Requires: npm install -D autocannon
 * Or run directly: npx autocannon ...
 *
 * Thresholds (per FIX-PLAN §12.2):
 *   p95 < 1000ms, p99 < 3000ms, error rate < 0.1%
 */

import autocannon from "autocannon";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import path from "node:path";

const run = promisify(autocannon);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const AUTH_COOKIE = process.env.E2E_COOKIE ?? "";
const DURATION_SEC = parseInt(process.env.DURATION ?? "10", 10);
const REPORT_PATH = path.resolve(process.cwd(), "load-test-results.json");

const authHeaders = AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {};

const SCENARIOS = [
  {
    name: "Public landing page (50 concurrent)",
    connections: 50,
    duration: DURATION_SEC,
    url: `${BASE_URL}/`,
    headers: {},
  },
  {
    name: "API /api/health (100 concurrent)",
    connections: 100,
    duration: DURATION_SEC,
    url: `${BASE_URL}/api/health`,
    headers: {},
  },
  {
    name: "Authenticated dashboard data (20 concurrent)",
    connections: 20,
    duration: DURATION_SEC,
    url: `${BASE_URL}/api/user/launcher-config`,
    headers: authHeaders,
  },
  {
    name: "Invoice list fetch (20 concurrent)",
    connections: 20,
    duration: DURATION_SEC,
    url: `${BASE_URL}/api/erp/issued-documents`,
    headers: authHeaders,
    method: "GET",
  },
];

const P95_THRESHOLD_MS = 1000;
const P99_THRESHOLD_MS = 3000;
const ERROR_RATE_THRESHOLD = 0.001; // 0.1%

function formatLatency(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function checkThresholds(result, scenarioName) {
  const latency = result.latency;
  const p95 = latency.p97_5 ?? latency.p99; // autocannon uses p97_5 as approximation
  const p99 = latency.p99;
  const errorRate = result.errors / (result.requests.sent || 1);

  const failures = [];
  if (p95 > P95_THRESHOLD_MS) {
    failures.push(`p95 ${formatLatency(p95)} > ${formatLatency(P95_THRESHOLD_MS)}`);
  }
  if (p99 > P99_THRESHOLD_MS) {
    failures.push(`p99 ${formatLatency(p99)} > ${formatLatency(P99_THRESHOLD_MS)}`);
  }
  if (errorRate > ERROR_RATE_THRESHOLD) {
    failures.push(`error rate ${(errorRate * 100).toFixed(2)}% > ${(ERROR_RATE_THRESHOLD * 100).toFixed(1)}%`);
  }

  const status = failures.length === 0 ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${status} — ${scenarioName}`);
  console.log(`  Requests/sec: ${result.requests.average.toFixed(1)}`);
  console.log(`  Latency avg/p95/p99: ${formatLatency(latency.average)} / ${formatLatency(p95)} / ${formatLatency(p99)}`);
  console.log(`  Errors: ${result.errors} (${(errorRate * 100).toFixed(2)}%)`);
  if (failures.length > 0) {
    failures.forEach((f) => console.log(`  ⚠️  ${f}`));
  }

  return failures.length === 0;
}

async function main() {
  console.log(`\n🚀 BSD-YBM OS — Load Test`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Duration: ${DURATION_SEC}s per scenario`);
  console.log(`   Thresholds: p95 < ${P95_THRESHOLD_MS}ms, p99 < ${P99_THRESHOLD_MS}ms, errors < 0.1%\n`);

  const allResults = [];
  let allPassed = true;

  for (const scenario of SCENARIOS) {
    console.log(`\n▶  ${scenario.name}`);
    try {
      const result = await run({
        url: scenario.url,
        connections: scenario.connections,
        duration: scenario.duration,
        headers: scenario.headers,
        method: scenario.method ?? "GET",
        title: scenario.name,
        silent: true,
      });

      const passed = checkThresholds(result, scenario.name);
      if (!passed) allPassed = false;
      allResults.push({ scenario: scenario.name, passed, result });
    } catch (err) {
      console.error(`  ❌ ERROR running scenario: ${err.message}`);
      allPassed = false;
      allResults.push({ scenario: scenario.name, passed: false, error: err.message });
    }
  }

  // Save results
  writeFileSync(REPORT_PATH, JSON.stringify(allResults, null, 2), "utf8");
  console.log(`\n📄 Full results saved to: ${REPORT_PATH}`);

  console.log(`\n${"─".repeat(60)}`);
  if (allPassed) {
    console.log("✅ All scenarios PASSED — load test successful");
  } else {
    console.log("❌ Some scenarios FAILED — check results above");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
