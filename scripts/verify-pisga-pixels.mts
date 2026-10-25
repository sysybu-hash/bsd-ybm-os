#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the model against the DXF, class by class, in a 5 cm raster of the plan.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-pixels.mts "<drawing.dxf>" <out dir>
 *
 * Each class is a kind of thing the plan draws (walls, windows, door swings, furniture, fixtures, stairs, columns, hatched surfaces). For a floor, the
 * DXF's ink of the class's layers (lines, arcs, circles, hatch rings and strokes) is rasterised; the model's parts of the class (by tag, on that
 * floor's height band) are rasterised as footprints. Reported per class: recall = the share of the drawing's ink within `tol` of a model part, and
 * precision = the share of the model's footprint within `tol` of the drawing's ink. A class with no drawing ink is reported as such. Writes
 * <floor>-<class>.png: drawing in red, model in blue, both dark where they meet.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing, flattenDxf, entitiesWithin, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { buildPisga, LEVEL } = await import("@/lib/projects/building/pisga");
const { PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <drawing.dxf> <out dir>");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(file))!;
const model = await buildPisga(null, { dxf });

const PPM = 20;
const X0 = -14, X1 = 72, Z0 = -10, Z1 = 32;
const W = (X1 - X0) * PPM, H = (Z1 - Z0) * PPM;

type Cls = { id: string; layers: RegExp; tags: RegExp; band: [number, number]; tol: number; note?: string };
const CLASSES: Cls[] = [
  { id: "walls", layers: /^(קיר בטון|קיר בלוק)/, tags: /^floor-[12](:fin)?$|^site:north-parapet$/, band: [0.5, 2.5], tol: 0.12 },
  { id: "windows", layers: /^חלון גוטליב/, tags: /:(window|curtain|sill|surround|glazing)$/, band: [0.3, 3.4], tol: 0.3, note: "opening position within a wall's thickness" },
  { id: "doors", layers: /^דלטוט גוטליב/, tags: /:(door|door-leaf)$/, band: [0.1, 2.6], tol: 0.25, note: "the drawing's swing arcs, not the leaf" },
  { id: "furniture", layers: /^(רהיטים|furniture|ARREDI)/, tags: /:inside:(furniture)$/, band: [0.05, 2.2], tol: 0.2 },
  { id: "fixtures", layers: /^כלים סניטריים/, tags: /:inside:(fixture|partition)$/, band: [0.05, 2.2], tol: 0.2 },
  { id: "stairs", layers: /^מדרגוט/, tags: /stair/, band: [-1, 4], tol: 0.25 },
  { id: "surfaces", layers: /^(מילוי גוטליב|A4-10)/, tags: /^site:surface|^site:kerb-dxf|^site:(courtyard|colonnade|north-terrace)|^roof:(plaza|parking)|:grate|-platform/, band: [-3, 25], tol: 0.4 },
];

const idx = (x: number, z: number): [number, number] => [Math.round((x - X0) * PPM), Math.round((z - Z0) * PPM)];
const stamp = (m: Uint8Array, x: number, z: number) => { const [i, j] = idx(x, z); if (i >= 0 && i < W && j >= 0 && j < H) m[j * W + i] = 1; };
const line = (m: Uint8Array, a: [number, number], b: [number, number]) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * PPM));
  for (let k = 0; k <= n; k++) stamp(m, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
};
const fillPoly = (m: Uint8Array, ring: Array<[number, number]>) => {
  const zs = ring.map((q) => q[1]);
  for (let j = Math.max(0, Math.floor((Math.min(...zs) - Z0) * PPM)); j <= Math.min(H - 1, Math.ceil((Math.max(...zs) - Z0) * PPM)); j++) {
    const z = Z0 + j / PPM;
    const xs: number[] = [];
    for (let a = 0; a < ring.length; a++) { const p = ring[a]!, q = ring[(a + 1) % ring.length]!; if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + ((z - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.floor((xs[k]! - X0) * PPM)); i <= Math.min(W - 1, Math.ceil((xs[k + 1]! - X0) * PPM)); i++) m[j * W + i] = 1;
  }
};
const dilate = (a: Uint8Array, r: number) => {
  // Two separable passes.
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let j = 0; j < H; j++) { let last = -1e9; for (let i = 0; i < W; i++) { if (a[j * W + i]) last = i; if (i - last <= r) t[j * W + i] = 1; } last = 1e9; for (let i = W - 1; i >= 0; i--) { if (a[j * W + i]) last = i; if (last - i <= r) t[j * W + i] = 1; } }
  for (let i = 0; i < W; i++) { let last = -1e9; for (let j = 0; j < H; j++) { if (t[j * W + i]) last = j; if (j - last <= r) o[j * W + i] = 1; } last = 1e9; for (let j = H - 1; j >= 0; j--) { if (t[j * W + i]) last = j; if (last - j <= r) o[j * W + i] = 1; } }
  return o;
};

const sheets = [{ id: "floor-2", level: LEVEL.floorMinus2 }, { id: "floor-1", level: LEVEL.floorMinus1 }, { id: "roof", level: LEVEL.roof }] as const;
const rows: string[] = ["# Pisga: model vs DXF, per class (5 cm raster)", "", "| sheet | class | ink m | recall | model m² | precision | gaps (largest ink the model lacks) |", "|---|---|---:|---:|---:|---:|---|"];
for (const sh of sheets) {
  const left = PISGA_DXF.sheets[sh.id];
  const shift = sh.id === "roof" ? -152 : 0;
  const { frameY, width, height, corner } = PISGA_DXF;
  const at = (q: { x: number; y: number }): [number, number] => [(q.x - left - corner.x - shift) / 100 + 0.88, (frameY + corner.y - q.y) / 100 + 1.02];
  const pieces = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
  for (const c of CLASSES) {
    if (sh.id === "roof" && !["surfaces", "stairs"].includes(c.id)) continue;
    const ink = new Uint8Array(W * H);
    for (const p of pieces) {
      if (!c.layers.test(p.layer) || p.text) continue;
      const pts = p.circle ? arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : p.pts;
      if (p.rings && p.rings.length) for (const r of p.rings) { const q = r.map(at); for (let i = 1; i < q.length; i++) line(ink, q[i - 1]!, q[i]!); }
      else if (pts && pts.length >= 2) { const q = pts.map(at); for (let i = 1; i < q.length; i++) line(ink, q[i - 1]!, q[i]!); }
    }
    const built = new Uint8Array(W * H);
    for (const p of model.primitives) {
      const tag = p.tag ?? "";
      if (!c.tags.test(tag)) continue;
      if (sh.id !== "roof" && !tag.startsWith(sh.id) && !/^(site|roof|kindergarten)/.test(tag) && c.id !== "stairs") continue;
      if (sh.id !== "roof" && /^floor-/.test(tag) && !tag.startsWith(sh.id)) continue;
      const yc = p.type === "prism" ? (p.y0 + p.y1) / 2 : p.type === "terrain" ? 0 : p.centre.y;
      if (p.type !== "terrain" && (yc < sh.level + c.band[0] - 2 || yc > sh.level + c.band[1] + 2) && !/^site/.test(tag)) continue;
      if (p.type === "box") {
        const a = -(p.rotY ?? 0), cs = Math.cos(a), sn = Math.sin(a);
        fillPoly(built, ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [p.centre.x + (u * p.size.x / 2) * cs - (v * p.size.z / 2) * sn, p.centre.z + (u * p.size.x / 2) * sn + (v * p.size.z / 2) * cs] as [number, number]));
      } else if (p.type === "prism") fillPoly(built, p.ring);
      else if (p.type === "cylinder") fillPoly(built, Array.from({ length: 16 }, (_, k) => [p.centre.x + p.radius * Math.cos((k * Math.PI) / 8), p.centre.z + p.radius * Math.sin((k * Math.PI) / 8)] as [number, number]));
      else if (p.type === "terrain" && /surface/.test(tag)) {
        const lo = Math.min(...p.heights);
        for (let j = 0; j < p.nz - 1; j++) for (let i = 0; i < p.nx - 1; i++) {
          if ([p.heights[j * p.nx + i]!, p.heights[j * p.nx + i + 1]!, p.heights[(j + 1) * p.nx + i]!, p.heights[(j + 1) * p.nx + i + 1]!].every((h) => h > lo + 0.5)) fillPoly(built, [[p.x0 + i * p.dx, p.z0 + j * p.dx], [p.x0 + (i + 1) * p.dx, p.z0 + j * p.dx], [p.x0 + (i + 1) * p.dx, p.z0 + (j + 1) * p.dx], [p.x0 + i * p.dx, p.z0 + (j + 1) * p.dx]]);
        }
      }
    }
    const r = Math.round(c.tol * PPM);
    const dB = dilate(built, r), dI = dilate(ink, r);
    let inkN = 0, inkHit = 0, bN = 0, bHit = 0;
    const miss = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { if (ink[i]) { inkN++; if (dB[i]) inkHit++; else miss[i] = 1; } if (built[i]) { bN++; if (dI[i]) bHit++; } }
    // The largest 3 m cells of missing ink.
    const cells = new Map<string, number>();
    for (let i = 0; i < W * H; i++) if (miss[i]) { const x = (i % W) / PPM + X0, z = Math.floor(i / W) / PPM + Z0; const k = `${Math.round(x / 3) * 3},${Math.round(z / 3) * 3}`; cells.set(k, (cells.get(k) ?? 0) + 1 / PPM); }
    const gaps = [...cells].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `(${k}) ${v.toFixed(1)} m`).join("; ");
    rows.push(`| ${sh.id} | ${c.id} | ${(inkN / PPM).toFixed(0)} | ${inkN ? ((100 * inkHit) / inkN).toFixed(0) + "%" : "—"} | ${(bN / PPM / PPM).toFixed(0)} | ${bN ? ((100 * bHit) / bN).toFixed(0) + "%" : "—"} | ${gaps || (inkN ? "" : "no ink in this class")} |`);
    const rgb = Buffer.alloc(W * H * 3, 255);
    for (let i = 0; i < W * H; i++) { const a = ink[i], b = built[i]; const col = a && b ? [30, 30, 30] : a ? [225, 40, 40] : b ? [90, 130, 235] : null; if (col) { rgb[i * 3] = col[0]!; rgb[i * 3 + 1] = col[1]!; rgb[i * 3 + 2] = col[2]!; } }
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(outDir, `${sh.id}-${c.id}.png`));
  }
}
fs.writeFileSync(path.join(outDir, "pixels.md"), rows.join("\n"));
console.log(rows.join("\n"));
