#!/usr/bin/env node
/**
 * Lightweight HTTP load smoke for core API routes (local/staging).
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/load-test.mjs
 */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const paths = [
  "/api/auth/session",
  "/api/auth/csrf",
];
const requests = Number.parseInt(process.env.LOAD_REQUESTS ?? "20", 10);
const concurrency = Number.parseInt(process.env.LOAD_CONCURRENCY ?? "5", 10);

async function fetchOnce(path) {
  const start = performance.now();
  const res = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
  const ms = performance.now() - start;
  await res.arrayBuffer().catch(() => null);
  return { path, status: res.status, ms };
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
    arr.push(r.ms);
    byPath.set(r.path, arr);
  }
  console.log(`BASE_URL=${base} requests=${requests} concurrency=${concurrency}\n`);
  for (const [path, times] of byPath) {
    times.sort((a, b) => a - b);
    const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const ok = all.filter((r) => r.path === path && r.status < 500).length;
    console.log(
      `${path}: avg=${avg.toFixed(0)}ms p95=${p95?.toFixed(0)}ms ok=${ok}/${times.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
