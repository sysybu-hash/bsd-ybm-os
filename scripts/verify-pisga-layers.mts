#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — every layer of the plan sheets against the model, by footprint.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-layers.mts "<drawing.dxf>" [out.md]
 *
 * For each layer on each plan sheet (floors −2, −1, roof) the ink — each line, arc, circle and hatch ring, sampled every 10 cm — is looked up in
 * a 5 cm raster of the model's footprint (every box, prism and cylinder seen from above, the ground left out). The share of the layer's ink within
 * 20 cm of a model part is its coverage. Text, dimension and symbol layers are listed too, so nothing is hidden: a layer the model cannot show
 * (text) reads low and says why in the table's note column.
 */
import fs from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing, flattenDxf, entitiesWithin, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const { buildPisga } = await import("@/lib/projects/building/pisga");
const dxf = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const model = await buildPisga(null, { dxf });
const X0 = -16, X1 = 74, Z0 = -14, Z1 = 38, PPM = 20;
const W = (X1 - X0) * PPM, H = (Z1 - Z0) * PPM;
const foot = new Uint8Array(W * H);
const put = (x: number, z: number) => { const i = Math.round((x - X0) * PPM), j = Math.round((z - Z0) * PPM); if (i >= 0 && i < W && j >= 0 && j < H) foot[j * W + i] = 1; };
const fillPoly = (ring: Array<[number, number]>) => {
  const zs = ring.map((q) => q[1]);
  for (let j = Math.max(0, Math.floor((Math.min(...zs) - Z0) * PPM)); j <= Math.min(H - 1, Math.ceil((Math.max(...zs) - Z0) * PPM)); j++) {
    const z = Z0 + j / PPM;
    const xs: number[] = [];
    for (let a = 0; a < ring.length; a++) { const p = ring[a]!, q = ring[(a + 1) % ring.length]!; if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + ((z - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.floor((xs[k]! - X0) * PPM)); i <= Math.min(W - 1, Math.ceil((xs[k + 1]! - X0) * PPM)); i++) foot[j * W + i] = 1;
  }
};
for (const p of model.primitives) {
  if (p.type === "terrain" && (p.tag ?? "").startsWith("site:surface:")) {
    // A surface patch: the cells whose vertices stand over the ground, i.e. inside its polygon (the others are sunk a metre).
    const lo = Math.min(...p.heights);
    for (let j = 0; j < p.nz - 1; j++) for (let i = 0; i < p.nx - 1; i++) {
      const hs = [p.heights[j * p.nx + i]!, p.heights[j * p.nx + i + 1]!, p.heights[(j + 1) * p.nx + i]!, p.heights[(j + 1) * p.nx + i + 1]!];
      if (hs.every((h) => h > lo + 0.5)) fillPoly([[p.x0 + i * p.dx, p.z0 + j * p.dx], [p.x0 + (i + 1) * p.dx, p.z0 + j * p.dx], [p.x0 + (i + 1) * p.dx, p.z0 + (j + 1) * p.dx], [p.x0 + i * p.dx, p.z0 + (j + 1) * p.dx]]);
    }
    continue;
  }
  if (p.type === "terrain" || p.type === "tree" || p.type === "car" || p.type === "person" || p.type === "plant") continue;
  if ((p.tag ?? "").startsWith("site:ground") || (p.tag ?? "").startsWith("site:surface:") && false) continue;
  if (p.type === "box") {
    const a = -(p.rotY ?? 0), c = Math.cos(a), s = Math.sin(a);
    fillPoly(([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [p.centre.x + (u * p.size.x / 2) * c - (v * p.size.z / 2) * s, p.centre.z + (u * p.size.x / 2) * s + (v * p.size.z / 2) * c] as [number, number]));
  } else if (p.type === "prism") fillPoly(p.ring);
  else if (p.type === "cylinder") fillPoly(Array.from({ length: 16 }, (_, k) => [p.centre.x + p.radius * Math.cos((k * Math.PI) / 8), p.centre.z + p.radius * Math.sin((k * Math.PI) / 8)] as [number, number]));
}
// A model part within 20 cm.
const R = 4;
const near = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (foot[j * W + i]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const jj = j + dy, ii = i + dx; if (jj >= 0 && jj < H && ii >= 0 && ii < W) near[jj * W + ii] = 1; }

const lines: string[] = ["# מרכז פסג\"ה — כיסוי שכבות מול המודל", "", "| גיליון | שכבה | דיו (מ') | מכוסה | סוגים | הערה |", "|---|---|---:|---:|---|---|"];
const NOTE: Array<[RegExp, string]> = [[/טקסט|TEXT|TXT|מידה|DIM|מידו|כיתוב/i, "טקסט/מידות: לא גוף"], [/סימנים|C3-10|BL-TR|han-|tamrur|SL-/i, "סמלים"], [/Defpoints|LAYOUT|LAYOT|HATCH$/i, "עזר"]];
for (const sheet of ["floor-2", "floor-1", "roof"] as const) {
  const left = PISGA_DXF.sheets[sheet];
  const shift = sheet === "roof" ? -152 : 0;
  const { frameY, width, height, corner } = PISGA_DXF;
  const at = (q: { x: number; y: number }): [number, number] => [(q.x - left - corner.x - shift) / 100 + 0.88, (frameY + corner.y - q.y) / 100 + 1.02];
  const stat = new Map<string, { len: number; hit: number; n: number; types: Set<string> }>();
  const miss = new Map<string, number>();
  for (const p of flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }))) {
    if (p.text) continue;
    const pts = p.circle ? arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : p.pts;
    const rings = p.rings && p.rings.length ? p.rings : pts && pts.length >= 2 ? [pts] : [];
    const e = stat.get(p.layer) ?? { len: 0, hit: 0, n: 0, types: new Set<string>() };
    for (const r of rings) {
      const q = r.map(at);
      for (let i = 1; i < q.length; i++) {
        const [ax, az] = q[i - 1]!, [bx, bz] = q[i]!;
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(len / 0.1));
        for (let k = 0; k <= steps; k++) {
          const x = ax + ((bx - ax) * k) / steps, z = az + ((bz - az) * k) / steps;
          const ii = Math.round((x - X0) * PPM), jj = Math.round((z - Z0) * PPM);
          e.len += len / (steps + 1);
          if (ii >= 0 && ii < W && jj >= 0 && jj < H && near[jj * W + ii]) e.hit += len / (steps + 1);
          else if (process.env.LAYER === p.layer) { const key = `${Math.round(x / 3) * 3},${Math.round(z / 3) * 3}`; miss.set(key, (miss.get(key) ?? 0) + len / (steps + 1)); }
        }
      }
    }
    e.n++; e.types.add(p.type);
    stat.set(p.layer, e);
  }
  if (process.env.LAYER && miss.size) console.log(`-- ${sheet} ${process.env.LAYER}: uncovered ink by 3 m cell`, [...miss].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `(${k}) ${v.toFixed(0)}m`).join("  "));
  for (const [layer, e] of [...stat].sort((a, b) => b[1].len * (1 - b[1].hit / Math.max(1e-9, b[1].len)) - a[1].len * (1 - a[1].hit / Math.max(1e-9, a[1].len)))) {
    if (e.len < 1) continue;
    lines.push(`| ${sheet} | ${layer} | ${Math.round(e.len)} | ${Math.round((100 * e.hit) / e.len)}% | ${[...e.types].join(",")} | ${NOTE.find(([r]) => r.test(layer))?.[1] ?? ""} |`);
  }
}
const out = process.argv[3];
if (out) fs.writeFileSync(out, lines.join("\n"));
console.log(lines.join("\n"));
