#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — every piece on the plan sheets (floors −2, −1, roof) against the model, object by object.
 *
 *   DXF=<drawing.dxf> SURVEY=<survey.dxf> npx tsx --conditions=react-server scripts/audit-pisga-sheets.mts <out dir>
 *
 * verify-pisga-layers.mts counts a line covered when any model part lies under it — the floor slab and the ceiling included, so the
 * inside of a floor reads covered whatever stands there. Here each sheet is held only against the model at its own storey's height,
 * without the slabs, ceilings, lights, floor finishes and any wide thin plate (over 2.5 m each way, under 50 cm thick: a paving, a
 * deck, the parking's asphalt) (a fill layer, a material, is held against those as well), and the pieces
 * are taken as objects: the pieces of a layer that touch within 3 cm are one object (a chair, a basin, a door with its swing). An
 * object is covered when 60% of its ink lies within 12 cm of a model part. Dashed overhead lines (…עליון) are held against what
 * stands above the storey, dashed lower lines (…תחתון) against what lies below it.
 *
 * Writes <out>/report.md (per layer: objects, missed objects with place, size, block and the nearest label) and <out>/<sheet>.png
 * (the sheet's ink in green where the model has it, red where it does not, over the model's parts in grey).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const { readDxfDrawing, flattenDxf, entitiesWithin, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const { buildPisga, LEVEL, OUTLINE_MINUS1 } = await import("@/lib/projects/building/pisga");
const { insidePolygon } = await import("@/lib/projects/building/assemble");
const outDir = process.argv[2];
if (!outDir || !process.env.DXF) throw new Error("usage: DXF=<file> [SURVEY=<file>] audit-pisga-sheets.mts <out dir>");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(process.env.DXF))!;
const survey = process.env.SURVEY ? readDxfDrawing(fs.readFileSync(process.env.SURVEY)) ?? undefined : undefined;
const model = await buildPisga(null, { dxf, survey });

const X0 = -16, X1 = 74, Z0 = -14, Z1 = 38, PPM = 20;
const W = (X1 - X0) * PPM, H = (Z1 - Z0) * PPM;
type Band = [number, number];
/** A plate the storey stands on or under: it covers the whole plan, so it says nothing of what stands there. */
const PLATE = /:inside:(ceiling|light|finish)|:slab$|:floor$|^site:ground/;

/** The model's parts kept, filled; or, with `outline`, only the outlines of the plates kept (a kerb is where two pavings meet). */
function mask(keep: (p: { tag: string; y0: number; y1: number; plate: boolean }) => boolean, outline = false): Uint8Array {
  const m = new Uint8Array(W * H);
  const line = (ring: Array<[number, number]>, closed = true) => {
    for (let a = 0; a < ring.length - (closed ? 0 : 1); a++) {
      const p = ring[a]!, q = ring[(a + 1) % ring.length]!;
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * PPM));
      for (let k = 0; k <= n; k++) {
        const i = Math.round((p[0] + ((q[0] - p[0]) * k) / n - X0) * PPM), j = Math.round((p[1] + ((q[1] - p[1]) * k) / n - Z0) * PPM);
        if (i >= 0 && i < W && j >= 0 && j < H) m[j * W + i] = 1;
      }
    }
  };
  const fillOnly = (ring: Array<[number, number]>) => {
    const zs = ring.map((q) => q[1]);
    for (let j = Math.max(0, Math.floor((Math.min(...zs) - Z0) * PPM)); j <= Math.min(H - 1, Math.ceil((Math.max(...zs) - Z0) * PPM)); j++) {
      const z = Z0 + j / PPM;
      const xs: number[] = [];
      for (let a = 0; a < ring.length; a++) { const p = ring[a]!, q = ring[(a + 1) % ring.length]!; if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + ((z - p[1]) / (q[1] - p[1])) * (q[0] - p[0])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.floor((xs[k]! - X0) * PPM)); i <= Math.min(W - 1, Math.ceil((xs[k + 1]! - X0) * PPM)); i++) m[j * W + i] = 1;
    }
  };
  let plate = false;
  // A part thinner than a pixel (a door's 4 cm leaf between two scan lines) is drawn by its edges as well, or the fill misses it.
  const fill = (ring: Array<[number, number]>) => (outline ? plate && line(ring) : (fillOnly(ring), line(ring)));
  const keep0 = keep;
  keep = (p) => { plate = p.plate; return keep0(p) && (!outline || p.plate); };
  for (const p of model.primitives) {
    const tag = p.tag ?? "";
    if (p.type === "person" || p.type === "car" || p.type === "text") continue;
    if (p.type === "terrain") {
      if (!tag.startsWith("site:surface:")) continue;
      const lo = Math.min(...p.heights);
      const inCell = (i: number, j: number) => {
        if (i < 0 || j < 0 || i >= p.nx - 1 || j >= p.nz - 1) return false;
        const hs = [p.heights[j * p.nx + i]!, p.heights[j * p.nx + i + 1]!, p.heights[(j + 1) * p.nx + i]!, p.heights[(j + 1) * p.nx + i + 1]!];
        return hs.every((h) => h > lo + 0.5) && keep({ tag, y0: Math.min(...hs), y1: Math.max(...hs), plate: true });
      };
      for (let j = 0; j < p.nz - 1; j++) for (let i = 0; i < p.nx - 1; i++) {
        if (!inCell(i, j)) continue;
        const [xa, xb, za, zb] = [p.x0 + i * p.dx, p.x0 + (i + 1) * p.dx, p.z0 + j * p.dx, p.z0 + (j + 1) * p.dx];
        if (!outline) { fillOnly([[xa, za], [xb, za], [xb, zb], [xa, zb]]); continue; }
        // The patch's edge: each side of a cell inside it that meets a cell outside.
        if (!inCell(i - 1, j)) line([[xa, za], [xa, zb]], false);
        if (!inCell(i + 1, j)) line([[xb, za], [xb, zb]], false);
        if (!inCell(i, j - 1)) line([[xa, za], [xb, za]], false);
        if (!inCell(i, j + 1)) line([[xa, zb], [xb, zb]], false);
      }
      continue;
    }
    if (p.type === "box") {
      if (!keep({ tag, y0: p.centre.y - p.size.y / 2, y1: p.centre.y + p.size.y / 2, plate: p.size.x > 2.5 && p.size.z > 2.5 && p.size.y < 0.5 })) continue;
      const a = -(p.rotY ?? 0), c = Math.cos(a), s = Math.sin(a);
      fill(([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [p.centre.x + (u * p.size.x / 2) * c - (v * p.size.z / 2) * s, p.centre.z + (u * p.size.x / 2) * s + (v * p.size.z / 2) * c] as [number, number]));
    } else if (p.type === "prism") {
      const xs = p.ring.map((q: [number, number]) => q[0]), zs = p.ring.map((q: [number, number]) => q[1]);
      if (keep({ tag, y0: p.y0, y1: p.y1, plate: Math.max(...xs) - Math.min(...xs) > 2.5 && Math.max(...zs) - Math.min(...zs) > 2.5 && p.y1 - p.y0 < 0.5 })) fill(p.ring);
    } else if (p.type === "custom-mesh") {
      for (let k = 1; k < p.stations.length; k++) {
        const [a, b] = [p.stations[k - 1]!, p.stations[k]!];
        if (!keep({ tag, y0: Math.min(a.yFoot, b.yFoot), y1: Math.max(a.yTop, b.yTop), plate: false })) continue;
        const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = (-(b.z - a.z) / l) * (p.thick / 2), nz = ((b.x - a.x) / l) * (p.thick / 2);
        fill([[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]]);
      }
    } else if (p.type === "drape") {
      if (keep({ tag, y0: -Infinity, y1: Infinity, plate: true })) fill(p.ring);
    } else if (p.type === "cylinder") {
      if (keep({ tag, y0: p.centre.y - p.height / 2, y1: p.centre.y + p.height / 2, plate: false })) fill(Array.from({ length: 16 }, (_, k) => [p.centre.x + p.radius * Math.cos((k * Math.PI) / 8), p.centre.z + p.radius * Math.sin((k * Math.PI) / 8)] as [number, number]));
    } else if (p.type === "tree" || p.type === "plant") {
      // A tree by its crown, a plant by its spread.
      const r = p.type === "tree" ? p.crown / 2 : p.spread / 2;
      if (keep({ tag, y0: p.at.y, y1: p.at.y + p.height, plate: false })) fill(Array.from({ length: 8 }, (_, k) => [p.at.x + r * Math.cos((k * Math.PI) / 4), p.at.z + r * Math.sin((k * Math.PI) / 4)] as [number, number]));
    }
  }
  return m;
}
const grow = (m: Uint8Array, r: number) => {
  const o = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (m[j * W + i]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const jj = j + dy, ii = i + dx; if (jj >= 0 && jj < H && ii >= 0 && ii < W) o[jj * W + ii] = 1; }
  return o;
};
const overlap = (b: Band) => (p: { y0: number; y1: number }) => p.y1 > b[0] && p.y0 < b[1];
/** The tops of the model's parts at a point, within a metre: boxes of half a square metre or more, prisms, ground patches (a cell's mean). */
function topsAt(x: number, z: number): number[] {
  const out: number[] = [];
  const R = 1.0;
  const near = (ring: Array<[number, number]>) => [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]].some(([dx, dz]) => insidePolygon(ring, x + dx!, z + dz!));
  for (const p of model.primitives) {
    if (p.type === "box") {
      const a = p.rotY ?? 0, c = Math.cos(a), s = Math.sin(a), dx = x - p.centre.x, dz = z - p.centre.z;
      const u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) <= p.size.x / 2 + R && Math.abs(v) <= p.size.z / 2 + R && p.size.x * p.size.z > 0.1) out.push(p.centre.y + p.size.y / 2);
    } else if (p.type === "prism" && near(p.ring)) out.push(p.y1);
    else if (p.type === "terrain") {
      for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]] as const) {
        const i = Math.floor((x + dx - p.x0) / p.dx), j = Math.floor((z + dz - p.z0) / p.dx);
        if (i >= 0 && j >= 0 && i < p.nx - 1 && j < p.nz - 1) out.push((p.heights[j * p.nx + i]! + p.heights[j * p.nx + i + 1]! + p.heights[(j + 1) * p.nx + i]! + p.heights[(j + 1) * p.nx + i + 1]!) / 4);
      }
    }
  }
  return out;
}

// Each sheet by its frame's left edge and its registration (cm): the lift shaft's west face, the same on every sheet, sits at x 30.35 on the
// floors; the roof sheet (+17.25) draws it 0.63 m further west than the upper roof's (+19.82) does, which the model's roof reads.
const SHEETS = [
  { id: "floor-2", left: PISGA_DXF.sheets["floor-2"], shift: 0, level: LEVEL.floorMinus2, top: LEVEL.floorMinus1 },
  { id: "floor-1", left: PISGA_DXF.sheets["floor-1"], shift: 0, level: LEVEL.floorMinus1, top: LEVEL.roof },
  { id: "roof", left: PISGA_DXF.sheets.roof, shift: -215, level: LEVEL.roof, top: LEVEL.roof + 6 },
  { id: "roof-upper", left: 203544, shift: -152, level: LEVEL.roof, top: LEVEL.roof + 6 },
] as const;
const report: string[] = ["# מרכז פסג\"ה — ביקורת תשריטים מול המודל", "", `נוצר ${new Date().toISOString().slice(0, 16)} · עצם מכוסה = 60% מהדיו שלו בטווח 12 ס"מ מחלק במודל בגובה הקומה (בלי רצפה, תקרה וגמרים; שכבת מילוי נבדקת גם מולם)`, ""];
const summary: string[] = ["| גיליון | שכבה | עצמים | מכוסים | חסרים | דיו מכוסה | הערה |", "|---|---|---:|---:|---:|---:|---|"];
const levels: string[] = ["| גיליון | x | z | כתוב | במודל | הפרש |", "|---|---:|---:|---:|---:|---:|"];
const detail: string[] = [];

for (const sheet of SHEETS) {
  const { left, shift } = sheet;
  const { frameY, width, height, corner } = PISGA_DXF;
  const at = (q: { x: number; y: number }): [number, number] => [(q.x - left - corner.x - shift) / 100 + 0.88, (frameY + corner.y - q.y) / 100 + 1.02];
  // The storey's height, a little below its floor (a step, a sill) to under the next floor; on the roof sheet, everything from the street up.
  const roofSheet = sheet.id.startsWith("roof");
  const band: Band = roofSheet ? [-Infinity, Infinity] : [sheet.level - 0.4, sheet.top - 0.2];
  const above: Band = roofSheet ? [sheet.level + 0.5, Infinity] : [sheet.level + 2.2, sheet.top + 6];
  const below: Band = [-Infinity, sheet.level + 0.2];
  // A storey's own parts by their tag, whatever their height (the hall steps down below its floor); the rest by the band. The roof sheet
  // draws the roof and the site round it: the storeys and the kindergarten under the roof are not what it shows.
  const storey = (p: { tag: string; y1: number }) => roofSheet ? !/^(floor-|kindergarten)/.test(p.tag) || p.y1 > sheet.level + 0.1 : p.tag.startsWith(sheet.id) || !p.tag.startsWith("floor-");
  const inBand = (p: { tag: string; y0: number; y1: number }) => storey(p) && (p.tag.startsWith(sheet.id) || overlap(band)(p));
  // A line on a plate (a kerb, a paving's edge, a step's nose on a landing) is drawn where the model's plates have an edge.
  const things = grow(mask((p) => !PLATE.test(p.tag) && !p.plate && inBand(p)), 2);
  const edges = grow(mask((p) => inBand(p) && !/:inside:(ceiling|light)/.test(p.tag), true), 2);
  for (let i = 0; i < W * H; i++) if (edges[i]) things[i] = 1;
  const withPlates = grow(mask(inBand), 2);
  // Outside the building the sheets draw the site (the street, the stairs, the walls round the plot) at whatever height it lies.
  const site = grow(mask((p) => !p.tag.startsWith("floor-") && !PLATE.test(p.tag) && !p.plate), 2);
  const siteEdges = grow(mask((p) => !p.tag.startsWith("floor-") && !/^site:ground/.test(p.tag), true), 2);
  for (let i = 0; i < W * H; i++) if (siteEdges[i] || things[i]) site[i] = 1;
  const outside = (bb: [number, number, number, number]) => !insidePolygon(OUTLINE_MINUS1, (bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2);
  // A fill outside the building is a paving or a planting: the site's surfaces at any height.
  const sitePlates = grow(mask((p) => !p.tag.startsWith("floor-") && !/^site:ground/.test(p.tag)), 2);
  // Anything of the model at any height, the storeys included: what a sheet draws of the storey under it or the existing building.
  const anywhere = grow(mask((p) => !PLATE.test(p.tag) && !p.plate), 2);
  for (let i = 0; i < W * H; i++) if (edges[i] || siteEdges[i]) anywhere[i] = 1;
  const over = grow(mask((p) => (!PLATE.test(p.tag) && overlap(above)(p)) || /:slab$|roof:/.test(p.tag)), 2);
  const under = grow(mask((p) => overlap(below)(p)), 2);
  const pieces = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
  const labels = pieces.filter((p) => p.text && p.at).map((p) => ({ t: p.text!, q: at(p.at!) }));
  type Obj = { layer: string; ink: number; hit: number; elsewhere: number; x0: number; x1: number; z0: number; z1: number; blocks: Set<string>; types: Set<string>; hatch: boolean; pts: Array<[number, number, boolean]> };
  const items: Array<{ layer: string; rings: Array<Array<[number, number]>>; insert?: string; type: string; hatch: boolean; bb: [number, number, number, number] }> = [];
  for (const p of pieces) {
    if (p.text) continue;
    const pts = p.circle ? arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : p.pts;
    const rings = (p.rings && p.rings.length ? p.rings : pts && pts.length >= 2 ? [p.closed ? [...pts, pts[0]!] : pts] : []).map((r) => r.map(at));
    if (!rings.length) continue;
    const all = rings.flat();
    const bb: [number, number, number, number] = [Math.min(...all.map((q) => q[0])), Math.max(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), Math.max(...all.map((q) => q[1]))];
    if (bb[1] < X0 || bb[0] > X1 || bb[3] < Z0 || bb[2] > Z1) continue;
    items.push({ layer: p.layer, rings, insert: p.insert, type: p.type, hatch: p.type === "HATCH", bb });
  }
  // Objects: a layer's pieces whose boxes touch within 3 cm, by a 1 m grid.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const grid = new Map<string, number[]>();
  items.forEach((it, i) => {
    if (it.bb[1] - it.bb[0] > 12 || it.bb[3] - it.bb[2] > 12) return; // a long line (an outline, a road edge) is an object of its own
    for (let gx = Math.floor(it.bb[0]); gx <= Math.floor(it.bb[1]); gx++) for (let gz = Math.floor(it.bb[2]); gz <= Math.floor(it.bb[3]); gz++) {
      const k = `${it.layer}|${gx},${gz}`;
      for (const j of grid.get(k) ?? []) {
        const o = items[j]!;
        if (it.bb[0] - 0.03 <= o.bb[1] && o.bb[0] - 0.03 <= it.bb[1] && it.bb[2] - 0.03 <= o.bb[3] && o.bb[2] - 0.03 <= it.bb[3]) parent[find(i)] = find(j);
      }
      grid.set(k, [...(grid.get(k) ?? []), i]);
    }
  });
  const objs = new Map<number, Obj>();
  const img = Buffer.alloc(W * H * 3, 255);
  for (let i = 0; i < W * H; i++) if (things[i]) { img[i * 3] = 215; img[i * 3 + 1] = 215; img[i * 3 + 2] = 215; }
  items.forEach((it, i) => {
    const o = objs.get(find(i)) ?? { layer: it.layer, ink: 0, hit: 0, elsewhere: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, blocks: new Set<string>(), types: new Set<string>(), hatch: false, pts: [] };
    const ref = /עליון/.test(it.layer) ? over : /תחתון/.test(it.layer) ? under : it.hatch ? (outside(it.bb) ? sitePlates : withPlates) : outside(it.bb) || /^מבט/.test(it.layer) ? site : things;
    // A door's swing is the path its leaf sweeps, not a part: the leaf and the frame say whether the door is there.
    const swing = it.type === "ARC" && /דלת|דלטוט/.test(it.layer);
    for (const r of it.rings) for (let k = 1; k < r.length; k++) {
      const [ax, az] = r[k - 1]!, [bx, bz] = r[k]!;
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.round(len / 0.05));
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
        const ii = Math.round((x - X0) * PPM), jj = Math.round((z - Z0) * PPM);
        if (ii < 0 || ii >= W || jj < 0 || jj >= H) continue;
        const ok = !!ref[jj * W + ii];
        if (!swing) o.ink += len / (steps + 1);
        if (ok && !swing) o.hit += len / (steps + 1);
        if (!swing && anywhere[jj * W + ii]) o.elsewhere += len / (steps + 1);
        const c = swing ? [90, 140, 230] : it.hatch ? (ok ? [120, 200, 120] : [240, 150, 150]) : ok ? [0, 140, 0] : [220, 0, 0];
        img[(jj * W + ii) * 3] = c[0]!; img[(jj * W + ii) * 3 + 1] = c[1]!; img[(jj * W + ii) * 3 + 2] = c[2]!;
      }
    }
    o.x0 = Math.min(o.x0, it.bb[0]); o.x1 = Math.max(o.x1, it.bb[1]); o.z0 = Math.min(o.z0, it.bb[2]); o.z1 = Math.max(o.z1, it.bb[3]);
    if (it.insert) o.blocks.add(it.insert);
    o.types.add(it.type);
    o.hatch ||= it.hatch;
    objs.set(find(i), o);
  });
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(outDir, `${sheet.id}.png`));
  // Each level the sheet writes (+12.77, or 935.97 above sea, 0.00 = 923.20) against the model's surfaces at its mark: the nearest top.
  for (const l of labels) {
    const m = /^(?:%%)?\s*([+-]?\d+\.\d\d)(?:\s*=\s*\d{3}\.\d\d)?$/.exec(l.t.trim());
    if (!m) continue;
    const v = Number(m[1]);
    const rel = Math.abs(v) < 100 ? v : v - 923.2;
    const tops = topsAt(l.q[0], l.q[1]);
    if (!tops.length) { levels.push(`| ${sheet.id} | ${l.q[0].toFixed(1)} | ${l.q[1].toFixed(1)} | ${rel.toFixed(2)} | — | אין משטח |`); continue; }
    const best = tops.reduce((a, b) => (Math.abs(b - rel) < Math.abs(a - rel) ? b : a));
    const bad = Math.abs(best - rel) > 0.1 ? "**" : "";
    levels.push(`| ${sheet.id} | ${l.q[0].toFixed(1)} | ${l.q[1].toFixed(1)} | ${rel.toFixed(2)} | ${best.toFixed(2)} | ${bad}${(best - rel).toFixed(2)}${bad} |`);
  }
  const byLayer = new Map<string, Obj[]>();
  for (const o of objs.values()) if (o.ink >= 0.05) byLayer.set(o.layer, [...(byLayer.get(o.layer) ?? []), o]);
  detail.push(`## ${sheet.id}`, "");
  for (const [layer, list] of [...byLayer].sort((a, b) => b[1].filter((o) => o.hit / o.ink < 0.6).length - a[1].filter((o) => o.hit / o.ink < 0.6).length)) {
    const missed = list.filter((o) => o.hit / o.ink < 0.6);
    const ink = list.reduce((s, o) => s + o.ink, 0), hit = list.reduce((s, o) => s + o.hit, 0);
    // A layer of level marks, section marks and the sheet's lettering is the drawing's notation, not a thing to build.
    const notation = list.filter((o) => [...o.blocks].some((b) => /miplas|miflas/.test(b)) || /^C3-10$|טקסט/.test(layer)).length >= list.length / 2;
    summary.push(`| ${sheet.id} | ${layer} | ${list.length} | ${list.length - missed.length} | ${missed.length} | ${Math.round((100 * hit) / ink)}% | ${notation ? "סימון" : ""} |`);
    if (!missed.length) continue;
    detail.push(`### ${sheet.id} · ${layer} — ${missed.length} חסרים מתוך ${list.length}`, "", "| x | z | גודל (מ') | כיסוי | בלוק | סוג | תווית קרובה | הערה |", "|---:|---:|---|---:|---|---|---|---|");
    for (const o of missed.sort((a, b) => b.ink - a.ink)) {
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      const lab = labels.map((l) => ({ ...l, d: Math.hypot(l.q[0] - cx, l.q[1] - cz) })).filter((l) => l.d < 3).sort((a, b) => a.d - b.d)[0];
      const wheel = lab && /כסא גלגלים/.test(lab.t) && Math.abs(o.z1 - o.z0 - 1.5) < 0.1 && Math.abs((o.x1 - o.x0) / 1.5 - Math.round((o.x1 - o.x0) / 1.5)) < 0.07;
      const why = wheel ? "מעגל סיבוב: רצפה פנויה, בכוונה" : /הריסה/.test(layer) ? "להריסה: לא נבנה, בכוונה" : (lab && /^(%%)?\s*[+-]?\d+\.\d\d/.test(lab.t)) || /^C3-10$/.test(layer) ? "סימון" : o.elsewhere / o.ink >= 0.6 ? "קיים במודל בגובה אחר" : "";
      detail.push(`| ${cx.toFixed(1)} | ${cz.toFixed(1)} | ${(o.x1 - o.x0).toFixed(2)}×${(o.z1 - o.z0).toFixed(2)} | ${Math.round((100 * o.hit) / o.ink)}% | ${[...o.blocks].slice(0, 2).join(",")} | ${[...o.types].join(",")} | ${lab ? lab.t : ""} | ${why} |`);
    }
    detail.push("");
  }
}
report.push(...summary, "", "## מפלסים: כל סימון גובה בתשריט מול המשטח הקרוב במודל", "", ...levels, "", ...detail);
fs.writeFileSync(path.join(outDir, "report.md"), report.join("\n"));
console.log(summary.join("\n"));
