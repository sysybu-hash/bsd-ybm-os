#!/usr/bin/env node
/**
 * Lightweight HTTP load smoke for core API routes (local/staging).
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/load-test.mjs
 *
 * Thresholds (override via env): P95_MS (default 1000), MAX_ERROR_RATE (default 0.001).
 * Exits non-zero when a path breaches a threshold — CI-gate ready.
 */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const paths = (process.env.LOAD_PATHS ?? "/api/health,/api/auth/session,/api/auth/csrf")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const requests = Number.parseInt(process.env.LOAD_REQUESTS ?? "50", 10);
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? "10", 10);
const p95Threshold = Number.parseFloat(process.env.P95_MS ?? "1000");
const maxErrorRate = Number.parseFloat(process.env.MAX_ERROR_RATE ?? "0.001");

async function fetchOnce(path) {
  const start = performance.now();
  try {
    const res = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
    const ms = performance.now() - start;
    await res.arrayBuffer().catch(() => null);
    return { path, status: res.status, ms };
  } catch {
    return { path, status: 0, ms: performance.now() - start };
  }
}

async function runBatch(batch) {
  return Promise.all(batch.map((p) => fetchOnce(p)));
}

async function main() {
  const queue = [];
  for (let i = 0; i < requests; i++) {
    queue.push(paths[i % paths.length]);
  }
  const all = [];
  for (let i = 0; i < queue.length; i += concurrency) {
    const slice = queue.slice(i, i + concurrency);
    all.push(...(await runBatch(slice)));
  }
  const byPath = new Map();
  for (const r of all) {
    const arr = byPath.get(r.path) ?? [];
    arr.push(r);
    byPath.set(r.path, arr);
  }
  console.log(`BASE_URL=${base} requests=${requests} concurrency=${concurrency}`);
  console.log(`thresholds: p95<${p95Threshold}ms error-rate<${maxErrorRate * 100}%\n`);

  let failed = false;
  for (const [path, results] of byPath) {
    const times = results.map((r) => r.ms).sort((a, b) => a - b);
    const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const errors = results.filter((r) => r.status === 0 || r.status >= 500).length;
    const errorRate = errors / results.length;
    const p95Ok = p95 <= p95Threshold;
    const errOk = errorRate <= maxErrorRate;
    if (!p95Ok || !errOk) failed = true;
    console.log(
      `${p95Ok && errOk ? "PASS" : "FAIL"} ${path}: avg=${avg.toFixed(0)}ms p95=${p95?.toFixed(0)}ms errors=${errors}/${results.length}`,
    );
  }
  if (failed) {
    console.error("\nload smoke FAILED — threshold breached");
    process.exit(1);
  }
  console.log("\nload smoke passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
