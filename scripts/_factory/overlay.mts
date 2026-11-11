/**
 * The factory model over its PDF sheet: registers the model's walls to the sheet's ink (scale ~1:200, searched 1:160–1:240, position, a small rotation),
 * draws them in colour by how far each point is from the nearest drawn line, and prints the deviation per kind.
 *   npx tsx --conditions=react-server scripts/_factory/overlay.mts <sheet.pdf> <model dir> <ground|first> <out.jpg> [scaleDenominator=200]
 * Green ≤ 0.15 m from ink, yellow ≤ 0.35 m, red beyond. Free; needs pdftoppm on PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const [pdf, dir, st, out, denArg] = process.argv.slice(2) as [string, string, string, string, string?];
const DPI = 100, den = Number(denArg ?? 200);
const pxPerM = (1000 / den / 25.4) * DPI;

// ---- the sheet: ink mask and a chamfer distance map (px) ----
const tmp = path.join(os.tmpdir(), `factory-ov-${process.pid}`);
execFileSync("pdftoppm", ["-r", String(DPI), "-gray", "-png", "-singlefile", pdf, tmp]);
const img = sharp(`${tmp}.png`);
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;
const INF = 1e9;
const dist = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) dist[i] = data[i * ch]! < 140 ? 0 : INF;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; let d = dist[i]!;
  if (x > 0) d = Math.min(d, dist[i - 1]! + 1);
  if (y > 0) { d = Math.min(d, dist[i - W]! + 1); if (x > 0) d = Math.min(d, dist[i - W - 1]! + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1]! + 1.414); }
  dist[i] = d;
}
for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
  const i = y * W + x; let d = dist[i]!;
  if (x < W - 1) d = Math.min(d, dist[i + 1]! + 1);
  if (y < H - 1) { d = Math.min(d, dist[i + W]! + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1]! + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1]! + 1.414); }
  dist[i] = d;
}
const D = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= W || yi >= H ? 40 : Math.min(40, dist[yi * W + xi]!); };

// ---- the model: outline points of walls, ovens, stairs, lifts on this storey, every 0.2 m ----
type P2 = [number, number];
type Box = { type: "box"; centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; rotY?: number; tag?: string };
type Prism = { type: "prism"; ring: P2[]; tag?: string };
const model = JSON.parse(fs.readFileSync(path.join(dir, "model.json"), "utf8")) as { primitives: Array<Box | Prism | { type: string; tag?: string }> };
const kindOf = (tag: string) => {
  const t = tag.slice(st.length + 1);
  if (/^shell(?!:base)/.test(t)) return "shell";
  if (/^room$/.test(t)) return "room walls";
  if (/^corridor-wall/.test(t)) return "corridor walls";
  if (/^oven$/.test(t)) return "ovens";
  if (/^stair|^elevator/.test(t)) return "stairs/lifts";
  return null;
};
const pts: Array<{ p: P2; k: string }> = [];
const ring = (r: P2[], k: string) => { for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 0.2)); for (let j = 0; j < n; j++) pts.push({ p: [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n], k }); } };
for (const p of model.primitives) {
  if (!p.tag?.startsWith(`${st}:`)) continue;
  const k = kindOf(p.tag); if (!k) continue;
  if (p.type === "prism") ring((p as Prism).ring, k);
  else if (p.type === "box") {
    const b = p as Box; if (b.size.y < 1.0) continue; // lintels and sills: the plan cuts through the wall, not over them
    const r = -(b.rotY ?? 0), ux = Math.cos(r), uz = Math.sin(r), vx = -uz, vz = ux, hx = b.size.x / 2, hz = b.size.z / 2;
    const c = (sx: number, sz: number): P2 => [b.centre.x + ux * hx * sx + vx * hz * sz, b.centre.z + uz * hx * sx + vz * hz * sz];
    // only the two long faces of a wall are drawn lines on the sheet
    if (b.size.x >= b.size.z) { ring([c(-1, -1), c(1, -1)], k); ring([c(-1, 1), c(1, 1)], k); } else { ring([c(-1, -1), c(-1, 1)], k); ring([c(1, -1), c(1, 1)], k); }
  }
}
if (!pts.length) { console.log(`no ${st} geometry in ${dir}`); process.exit(1); }
const cx = pts.reduce((a, q) => a + q.p[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q.p[1], 0) / pts.length;

// ---- registration: image = s·R(θ)·(p − c) + t ----
type Fit = { s: number; th: number; tx: number; ty: number };
const proj = (f: Fit, p: P2): P2 => { const x = p[0] - cx, z = p[1] - cz, co = Math.cos(f.th), si = Math.sin(f.th); return [f.s * (co * x - si * z) + f.tx, f.s * (si * x + co * z) + f.ty]; };
const score = (f: Fit, sub: typeof pts) => { let a = 0; for (const q of sub) { const [x, y] = proj(f, q.p); a += Math.min(D(x, y), 12); } return a / sub.length; };
const sub = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 600)) === 0);
let best: Fit = { s: pxPerM, th: 0, tx: W / 2, ty: H / 2 }, bs = Infinity;
// coarse: the plot scale is not printed in a way we can read (text is curves), so try the usual ones round the given one
const tries: Array<{ den: number; v: number }> = [];
for (const dd of [0.8, 0.9, 1, 1.1, 1.2]) {
  const s0 = pxPerM / dd; let lb = Infinity, lf = best;
  for (let ty = 0; ty < H; ty += 4) for (let tx = 0; tx < W; tx += 4) { const f = { s: s0, th: 0, tx, ty }; const v = score(f, sub); if (v < lb) { lb = v; lf = f; } }
  // a short local polish so scales are compared fairly
  for (const step of [2, 1]) { let mv = true; while (mv) { mv = false; for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) { const f = { tx: lf.tx + d[0] * step, ty: lf.ty + d[1] * step, s: lf.s * (1 + d[2] * 0.004 * step), th: 0 }; const v = score(f, sub); if (v < lb - 1e-6) { lb = v; lf = f; mv = true; } } } }
  tries.push({ den: Math.round(den * dd), v: lb / lf.s });
  if (lb / lf.s < bs / best.s || bs === Infinity) { bs = lb; best = lf; }
}
console.log("coarse by scale (mean m):", tries.map((t) => `1:${t.den} ${t.v.toFixed(3)}`).join("  "));
bs = score(best, pts);
for (const step of [3, 1, 0.5, 0.25]) {
  let moved = true;
  while (moved) {
    moved = false;
    for (const d of [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]] as const) {
      const f = { tx: best.tx + d[0] * step, ty: best.ty + d[1] * step, s: best.s * (1 + d[2] * 0.002 * step), th: best.th + d[3] * 0.001 * step };
      const v = score(f, pts); if (v < bs - 1e-6) { bs = v; best = f; moved = true; }
    }
  }
}
const scaleDen = (1000 / 25.4) * DPI / best.s;
console.log(`fit: 1:${scaleDen.toFixed(1)}  rotation ${(best.th * 180 / Math.PI).toFixed(2)}°  mean ${(bs / best.s).toFixed(3)} m (truncated at ${(12 / best.s).toFixed(2)} m)`);

// ---- per-kind deviation, and the picture ----
const byK = new Map<string, number[]>();
const marks: string[] = [];
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (const q of pts) {
  const [x, y] = proj(best, q.p); const m = D(x, y) / best.s;
  (byK.get(q.k) ?? byK.set(q.k, []).get(q.k)!).push(m);
  const col = m <= 0.15 ? "#00b050" : m <= 0.35 ? "#f0b000" : "#e00000";
  marks.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${col}"/>`);
  x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
}
const q = (a: number[], f: number) => [...a].sort((u, v) => u - v)[Math.floor((a.length - 1) * f)]!;
for (const [k, a] of byK) console.log(`${k.padEnd(15)} n=${String(a.length).padStart(5)}  median ${q(a, 0.5).toFixed(2)} m  p90 ${q(a, 0.9).toFixed(2)} m  ≤0.15 m ${(100 * a.filter((v) => v <= 0.15).length / a.length).toFixed(0)}%  >0.35 m ${(100 * a.filter((v) => v > 0.35).length / a.length).toFixed(0)}%`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${marks.join("")}</svg>`;
const pad = 60, L = Math.max(0, Math.floor(x0 - pad)), T = Math.max(0, Math.floor(y0 - pad));
const cw = Math.min(W - L, Math.ceil(x1 - x0 + 2 * pad)), chh = Math.min(H - T, Math.ceil(y1 - y0 + 2 * pad));
const comp = await sharp(`${tmp}.png`).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
await sharp(comp).extract({ left: L, top: T, width: cw, height: chh }).jpeg({ quality: 88 }).toFile(out);
fs.rmSync(`${tmp}.png`, { force: true });
console.log(`→ ${out}`);
