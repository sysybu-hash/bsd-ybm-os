#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — every piece of the 2022 site survey against the model, layer by layer (free, no model calls).
 *
 *   DXF=<drawing.dxf> SURVEY=<survey.dxf> npx tsx --conditions=react-server scripts/audit-pisga-survey.mts <out dir>
 *
 * The plan-sheet audits (audit-pisga-sheets, verify-pisga-layers) hold only the architect's DXF against the model. This one takes
 * every entity of the survey file, flattened, and says where it went:
 *  - not read: an entity readPisgaSurvey leaves out (block contents, frame/legend/cadastre layers, pieces with no points), counted by layer and type;
 *  - a line: covered when 60% of its ink, sampled every 10 cm, lies within 25 cm of a model part (the ground left out; pavings by their edges);
 *  - a spot height: used when it is one of the ground's spots (its layer feeds the terrain) and the model's top within 1 m is within 20 cm of it;
 *  - a symbol (INSERT): covered when a model part stands within 50 cm.
 * Everything outside the model's plan box is listed apart: the survey reaches past the site.
 *
 * Writes <out>/report.md and <out>/survey.png (ink green where the model has it, red where not, over the model in grey).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const { readDxfDrawing, flattenDxf } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");
const { readPisgaSurvey } = await import("@/lib/projects/building/pisga-survey");
const outDir = process.argv[2];
if (!outDir || !process.env.DXF || !process.env.SURVEY) throw new Error("usage: DXF=<file> SURVEY=<file> audit-pisga-survey.mts <out dir>");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(process.env.DXF))!;
const surveyDrawing = readDxfDrawing(fs.readFileSync(process.env.SURVEY))!;
const model = await buildPisga(null, { dxf, survey: surveyDrawing });
const survey = readPisgaSurvey(surveyDrawing);

const X0 = -40, X1 = 100, Z0 = -40, Z1 = 60, PPM = 10;
const W = (X1 - X0) * PPM, H = (Z1 - Z0) * PPM;
const inBox = (x: number, z: number) => x >= X0 && x < X1 && z >= Z0 && z < Z1;
const GROUND = /^site:ground/;

/** The model from above: parts filled, wide thin plates (pavings, slabs) by their outline only, the bare ground left out. */
const m = new Uint8Array(W * H);
const px = (x: number, z: number) => { const i = Math.round((x - X0) * PPM), j = Math.round((z - Z0) * PPM); if (i >= 0 && i < W && j >= 0 && j < H) m[j * W + i] = 1; };
const line = (ring: Array<[number, number]>, closed: boolean) => {
  for (let a = 0; a < ring.length - (closed ? 0 : 1); a++) {
    const p = ring[a]!, q = ring[(a + 1) % ring.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * PPM));
    for (let k = 0; k <= n; k++) px(p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n);
  }
};
const fill = (ring: Array<[number, number]>, plate: boolean) => {
  line(ring, true);
  if (plate) return;
  const zs = ring.map((q) => q[1]);
  for (let j = Math.max(0, Math.floor((Math.min(...zs) - Z0) * PPM)); j <= Math.min(H - 1, Math.ceil((Math.max(...zs) - Z0) * PPM)); j++) {
    const z = Z0 + j / PPM, xs: number[] = [];
    for (let a = 0; a < ring.length; a++) { const p = ring[a]!, q = ring[(a + 1) % ring.length]!; if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + ((z - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.floor((xs[k]! - X0) * PPM)); i <= Math.min(W - 1, Math.ceil((xs[k + 1]! - X0) * PPM)); i++) m[j * W + i] = 1;
  }
};
const circle = (cx: number, cz: number, r: number) => fill(Array.from({ length: 12 }, (_, k) => [cx + r * Math.cos((k * Math.PI) / 6), cz + r * Math.sin((k * Math.PI) / 6)] as [number, number]), false);
for (const p of model.primitives) {
  const tag = p.tag ?? "";
  if (GROUND.test(tag) || p.type === "person" || p.type === "car" || p.type === "text") continue;
  if (p.type === "box") {
    const a = -(p.rotY ?? 0), c = Math.cos(a), s = Math.sin(a);
    const ring = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [p.centre.x + (u * p.size.x / 2) * c - (v * p.size.z / 2) * s, p.centre.z + (u * p.size.x / 2) * s + (v * p.size.z / 2) * c] as [number, number]);
    fill(ring, p.size.x > 2.5 && p.size.z > 2.5 && p.size.y < 0.5);
  } else if (p.type === "prism") {
    const xs = p.ring.map((q: [number, number]) => q[0]), zs = p.ring.map((q: [number, number]) => q[1]);
    fill(p.ring, Math.max(...xs) - Math.min(...xs) > 2.5 && Math.max(...zs) - Math.min(...zs) > 2.5 && p.y1 - p.y0 < 0.5);
  } else if (p.type === "custom-mesh") {
    for (let k = 1; k < p.stations.length; k++) {
      const [a, b] = [p.stations[k - 1]!, p.stations[k]!];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = (-(b.z - a.z) / l) * (p.thick / 2), nz = ((b.x - a.x) / l) * (p.thick / 2);
      fill([[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]], false);
    }
  } else if (p.type === "drape") fill(p.ring, true);
  else if (p.type === "cylinder") circle(p.centre.x, p.centre.z, Math.max(p.radius, 0.05));
  else if (p.type === "tree" || p.type === "plant") circle(p.at.x, p.at.z, (p.type === "tree" ? p.crown : p.spread) / 2);
  else if (p.type === "terrain" && tag.startsWith("site:surface:")) {
    // A raised patch (a planter, a stair's earth) by its cells' outline.
    for (let j = 0; j < p.nz - 1; j++) for (let i = 0; i < p.nx - 1; i++) {
      const xa = p.x0 + i * p.dx, za = p.z0 + j * p.dx;
      line([[xa, za], [xa + p.dx, za], [xa + p.dx, za + p.dx], [xa, za + p.dx]], true);
    }
  }
}
/** Distance-limited lookup: a model pixel within r metres. */
const near = (x: number, z: number, r: number) => {
  const ci = Math.round((x - X0) * PPM), cj = Math.round((z - Z0) * PPM), R = Math.ceil(r * PPM);
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    if (di * di + dj * dj > R * R) continue;
    const i = ci + di, j = cj + dj;
    if (i >= 0 && i < W && j >= 0 && j < H && m[j * W + i]) return true;
  }
  return false;
};

/** The model's highest top within a metre of a point: boxes, prisms, the ground's cells. */
const tops = (x: number, z: number): number[] => {
  const out: number[] = [];
  for (const p of model.primitives) {
    if (p.type === "terrain") {
      const i = Math.floor((x - p.x0) / p.dx), j = Math.floor((z - p.z0) / p.dx);
      if (i >= 0 && j >= 0 && i < p.nx && j < p.nz) out.push(p.heights[j * p.nx + i]!);
    } else if (p.type === "box" && Math.abs(p.centre.x - x) < p.size.x / 2 + 0.3 && Math.abs(p.centre.z - z) < p.size.z / 2 + 0.3) out.push(p.centre.y + p.size.y / 2);
  }
  return out;
};

// ── 1. What the reader takes from the file ──────────────────────────────────────────────────────────────────────────────
const pieces = flattenDxf(surveyDrawing);
const notRead = new Map<string, number>();
const NOT_SITE = /^(C1680|C169\d|SCELLNO|Mcellno|migrashim|TR_|tr_|declaration|Tcontours|Mrozeta|0)$/;
for (const p of pieces) {
  if (p.type === "INSERT" && p.at) continue;
  const why = p.path.length ? "inside a block (its symbol)" : NOT_SITE.test(p.layer) ? "frame / legend / cadastre layer" : !p.pts || p.pts.length < 2 ? `no points (${p.type})` : "";
  if (!why) continue;
  const k = `${why} | ${p.layer} | ${p.type}`;
  notRead.set(k, (notRead.get(k) ?? 0) + 1);
}

// ── 2. Lines, by layer ──────────────────────────────────────────────────────────────────────────────────────────────────
type Row = { layer: string; lines: number; covered: number; outside: number; legend: number; missed: Array<{ x: number; z: number; len: number }> };
// The survey sheet's legend: a column of sample strokes, one per code, at x 85–87 north of the site (z under 0). Not on the site.
const inLegend = (pts: Array<[number, number]>) => pts.every(([x, z]) => x > 82 && x < 90 && z < 0);
const rows = new Map<string, Row>();
const row = (layer: string) => rows.get(layer) ?? rows.set(layer, { layer, lines: 0, covered: 0, outside: 0, legend: 0, missed: [] }).get(layer)!;
const ink: Array<{ x: number; z: number; ok: boolean }> = [];
for (const l of survey.lines) {
  const r = row(l.layer);
  r.lines++;
  if (inLegend(l.pts)) { r.legend++; continue; }
  const pts = l.closed ? [...l.pts, l.pts[0]!] : l.pts;
  let n = 0, hit = 0, len = 0, inside = 0;
  for (let a = 1; a < pts.length; a++) {
    const p = pts[a - 1]!, q = pts[a]!, d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    len += d;
    const k = Math.max(1, Math.ceil(d / 0.1));
    for (let s = 0; s <= k; s++) {
      const x = p[0] + ((q[0] - p[0]) * s) / k, z = p[1] + ((q[1] - p[1]) * s) / k;
      n++;
      if (!inBox(x, z)) continue;
      inside++;
      const ok = near(x, z, 0.25);
      if (ok) hit++;
      ink.push({ x, z, ok });
    }
  }
  if (inside < n * 0.5) { r.outside++; continue; }
  if (hit >= inside * 0.6) r.covered++;
  else { const mid = pts[Math.floor(pts.length / 2)]!; r.missed.push({ x: mid[0], z: mid[1], len }); }
}

// ── 3. Spot heights and symbols ─────────────────────────────────────────────────────────────────────────────────────────
type SpotRow = { layer: string; n: number; outside: number; within: number; off: Array<{ x: number; z: number; level: number; top: number | null }> };
const spotRows = new Map<string, SpotRow>();
for (const s of [...survey.spots, ...survey.roofs]) {
  const r = spotRows.get(s.layer) ?? spotRows.set(s.layer, { layer: s.layer, n: 0, outside: 0, within: 0, off: [] }).get(s.layer)!;
  r.n++;
  if (!inBox(s.x, s.z)) { r.outside++; continue; }
  const t = tops(s.x, s.z);
  const best = t.length ? t.reduce((b, v) => (Math.abs(v - s.level) < Math.abs(b - s.level) ? v : b)) : null;
  if (best != null && Math.abs(best - s.level) <= 0.2) r.within++;
  else r.off.push({ x: s.x, z: s.z, level: s.level, top: best });
}
type MarkRow = { layer: string; block: string; n: number; outside: number; covered: number; missed: Array<{ x: number; z: number; text: string }> };
const markRows = new Map<string, MarkRow>();
for (const mk of survey.marks) {
  const k = `${mk.layer}|${mk.block}`;
  const r = markRows.get(k) ?? markRows.set(k, { layer: mk.layer, block: mk.block, n: 0, outside: 0, covered: 0, missed: [] }).get(k)!;
  r.n++;
  if (!inBox(mk.x, mk.z)) { r.outside++; continue; }
  if (near(mk.x, mk.z, 0.5)) r.covered++;
  else r.missed.push({ x: mk.x, z: mk.z, text: mk.text });
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const f = (v: number) => v.toFixed(1);
const out: string[] = [
  `# Survey vs model — ${new Date().toISOString().slice(0, 16)}`, "",
  `Survey: ${process.env.SURVEY}`, `Model: ${model.primitives.length} primitives. Plan box x ${X0}…${X1}, z ${Z0}…${Z1}.`, "",
  `Flattened: ${pieces.length} pieces → ${survey.lines.length} lines, ${survey.spots.length} ground spots, ${survey.roofs.length} roof spots, ${survey.marks.length} symbols.`, "",
  "## 1. Not read by the survey reader", "", "| why | layer | type | count |", "|---|---|---|---|",
  ...[...notRead.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k.split(" | ").join(" | ")} | ${n} |`), "",
  "## 2. Lines by layer", "", "| layer | lines | covered | missed | outside box | legend | missed samples (x, z, length m) |", "|---|---|---|---|---|---|---|",
  ...[...rows.values()].sort((a, b) => b.missed.length - a.missed.length).map((r) => `| ${r.layer} | ${r.lines} | ${r.covered} | ${r.missed.length} | ${r.outside} | ${r.legend} | ${r.missed.slice(0, 6).map((q) => `(${f(q.x)}, ${f(q.z)}) ${f(q.len)}`).join("; ")} |`), "",
  "## 3. Spot heights by layer (model top within 20 cm)", "", "| layer | spots | within | off | outside box | off samples (x, z, level → model top) |", "|---|---|---|---|---|---|",
  ...[...spotRows.values()].map((r) => `| ${r.layer} | ${r.n} | ${r.within} | ${r.off.length} | ${r.outside} | ${r.off.slice(0, 5).map((q) => `(${f(q.x)}, ${f(q.z)}) ${q.level.toFixed(2)} → ${q.top == null ? "none" : q.top.toFixed(2)}`).join("; ")} |`), "",
  "## 4. Symbols by layer and block (a model part within 50 cm)", "", "| layer | block | n | covered | missed | outside box | missed samples |", "|---|---|---|---|---|---|---|",
  ...[...markRows.values()].sort((a, b) => b.missed.length - a.missed.length).map((r) => `| ${r.layer} | ${r.block} | ${r.n} | ${r.covered} | ${r.missed.length} | ${r.outside} | ${r.missed.slice(0, 4).map((q) => `(${f(q.x)}, ${f(q.z)})${q.text ? ` ${q.text}` : ""}`).join("; ")} |`), "",
];
fs.writeFileSync(path.join(outDir, "report.md"), out.join("\n"));

const img = Buffer.alloc(W * H * 3, 255);
for (let k = 0; k < W * H; k++) if (m[k]) img.fill(200, k * 3, k * 3 + 3);
for (const s of ink) {
  const i = Math.round((s.x - X0) * PPM), j = Math.round((s.z - Z0) * PPM);
  if (i < 0 || i >= W || j < 0 || j >= H) continue;
  const o = (j * W + i) * 3;
  img[o] = s.ok ? 0 : 220; img[o + 1] = s.ok ? 150 : 0; img[o + 2] = 0;
}
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(outDir, "survey.png"));
process.stdout.write(`${out.slice(0, 7).join("\n")}\nlines: ${[...rows.values()].reduce((a, r) => a + r.missed.length, 0)} missed of ${survey.lines.length}\n`);
