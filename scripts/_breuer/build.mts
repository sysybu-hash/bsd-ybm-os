/**
 * Breuer 21 — exterior model from the execution DXF, free (no paid call).
 *   npx tsx --conditions=react-server scripts/_breuer/build.mts <main dxf> <out dir>
 * Writes model.json + state.json (for scripts/_breuer/view.mts) and report.json: what was read, what was skipped and why.
 */
import fs from "node:fs";
import path from "node:path";
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { readBreuer, ABS_ZERO, STOREYS, type Storey } from "./read.mts";
import { buildGrid, CELL, centreOf, rects, segmentsOf, type Grid } from "./grid.mts";
import { readSite } from "./site.mts";
import { readElevOpenings, ELEVS, Y0 } from "./elev-openings.mts";
import { FACE, LINE_SHIFT, sideOf, fitOffset } from "./elev-fit.mts";

const [file, out] = process.argv.slice(2);
if (!file || !out) throw new Error("usage: build.mts <main dxf> <out dir>");
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

const { drawing, storeys } = readBreuer(file);
say(`read ${storeys.length} storeys`);
const report: Record<string, unknown> = {};
const prims: Primitive[] = [];

/** Blocks that are not the building: the survey, the plot boundary, level marks, the north arrow. */
const NOT_BUILDING = /^A\$C2edb|גבולות מעודכנים|מפלס כולל רחוב|צפון-2|^\*D|DIM/;
const WALL_LAYERS = /^(wall|wall2)$/;
/** Railing glass: the tinted pane (the clear railGlass all but vanished in the renders; the user asked for it darker). */
const RAIL_GLASS: BuildingMaterial = "glassTint";
const OPEN_LAYERS = /^(opens|open windows|open door)$/;

// Block extents (lines only, arcs left out: a door's swing is not its opening), cached per block name.
const { flattenDxf } = await import("@/lib/projects/dxf-drawing");
const blockBox = new Map<string, { x0: number; y0: number; x1: number; y1: number } | null>();
function boxOfBlock(name: string) {
  if (blockBox.has(name)) return blockBox.get(name)!;
  const blk = drawing.blocks.get(name);
  let b: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (blk) {
    for (const p of flattenDxf(drawing, blk.entities)) {
      if (!p.pts) continue;
      for (const q of p.pts) {
        const x = q.x - blk.base.x, y = q.y - blk.base.y;
        b = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
      }
    }
  }
  blockBox.set(name, b);
  return b;
}
function insertBox(p: DxfPiece) {
  const b = boxOfBlock(p.insert!);
  if (!b || !p.m) return null;
  const blk = drawing.blocks.get(p.insert!)!;
  const cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => ({ x: p.m!.a * (x! + blk.base.x) + p.m!.c * (y! + blk.base.y) + p.m!.e, y: p.m!.b * (x! + blk.base.x) + p.m!.d * (y! + blk.base.y) + p.m!.f }));
  return { x0: Math.min(...cs.map((c) => c.x)), y0: Math.min(...cs.map((c) => c.y)), x1: Math.max(...cs.map((c) => c.x)), y1: Math.max(...cs.map((c) => c.y)) };
}

type Opening = { box: { x0: number; y0: number; x1: number; y1: number }; layer: string; block: string; sill: number; head: number; source: string; face?: string; span?: number[]; line?: number; hz?: boolean; cross?: number; elev?: boolean };

/** "u.k=105 o.k=210" (sill and head above the floor, cm) written on the dimension of each opening, outside the face. */
function openingHeights(st: Storey) {
  const marks: Array<{ at: Pt; sill: number; head: number; rot: number }> = [];
  for (const p of st.pieces) {
    if (!p.text || !p.at || p.dimension) continue;
    const m = /u\.?k\s*=\s*(\d+)\s*o\.?k\s*=\s*(\d+)/i.exec(p.text);
    if (m) marks.push({ at: p.at, sill: Number(m[1]), head: Number(m[2]), rot: (((p.rotation ?? 0) % 180) + 180) % 180 });
  }
  return marks;
}

const storeyReport: Record<string, unknown>[] = [];
/** Louvre panels found per storey; built after all storeys as one strip per run, as the elevations draw them. */
const screenPanels: Array<{ storey: string; L: number; H: number; alongX: boolean; cross: number; a0: number; a1: number; ring?: Array<[number, number]> }> = [];
const footprints = new Map<string, { grid: Grid; inside: (k: number) => boolean }>();

function storeyGrid(st: Storey) {
  const o = st.origin;
  const local = (q: Pt): Pt => ({ x: q.x - o.x, y: q.y - o.y });
  const wallSegs: Array<[Pt, Pt]> = [];
  for (const p of st.pieces) {
    if (!WALL_LAYERS.test(p.layer) || p.text || p.dimension) continue;
    if (p.path.some((n) => NOT_BUILDING.test(n))) continue;
    for (const [a, b] of segmentsOf(p)) wallSegs.push([local(a), local(b)]);
  }
  if (!wallSegs.length) return null;
  const plotPts = st.pieces.filter((p) => p.path.includes("גבולות מעודכנים") && p.pts && p.pts.length > 3).flatMap((p) => p.pts!.map(local));
  const px = plotPts.map((q) => q.x), py = plotPts.map((q) => q.y);
  const plot = { x0: Math.min(...px), y0: Math.min(...py), x1: Math.max(...px), y1: Math.max(...py) };
  // Only what stands on the plot (the roof tab draws the upper roof beside it).
  const segs = wallSegs.filter(([a, b]) => [a, b].every((q) => q.x >= plot.x0 - 50 && q.x <= plot.x1 + 50 && q.y >= plot.y0 - 50 && q.y <= plot.y1 + 50));
  const g = buildGrid(segs, plot);
  // The slab edges drawn as a view ("mabat", "mabat dak"): a balcony outside the walls is closed by them.
  const edgeSegs: Array<[Pt, Pt]> = [];
  for (const p of st.pieces) {
    if (!/^(mabat|mabat dak)$/.test(p.layer) || p.text || p.dimension || p.path.some((n) => NOT_BUILDING.test(n))) continue;
    for (const [a, b] of segmentsOf(p)) { const s: [Pt, Pt] = [local(a), local(b)]; if (s.every((q) => q.x >= plot.x0 - 50 && q.x <= plot.x1 + 50 && q.y >= plot.y0 - 50 && q.y <= plot.y1 + 50)) edgeSegs.push(s); }
  }
  const g2 = buildGrid([...segs, ...edgeSegs], plot);
  return { g, segs, local, g2, edgeSegs: edgeSegs.length, edges: edgeSegs };
}
/**
 * A balcony band and its glass along the drawn outer edge, so a curved front is a smooth curve and not a staircase of grid
 * boxes. Each outer-edge chord (air on one side, the band on the other) becomes one stone piece reaching `depth` inward and one
 * thin pane set in from the edge. The cells the pieces cover are marked, so what is left over can still be built as before.
 */
function bandAlongLines(g: Grid, lines: Array<[Pt, Pt]>, isAir: (k: number) => boolean, isBand: (k: number) => boolean, near: (k: number) => boolean, depthOf: (m: Pt, inn: Pt) => number, inward?: (m: Pt, nrm: Pt) => Pt) {
  const cellAt = (p: Pt) => { const i = Math.floor((p.x - g.x0) / CELL), j = Math.floor((p.y - g.y0) / CELL); return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i; };
  const out: Array<{ a: Pt; b: Pt; inn: Pt; depth: number }> = [];
  const covered = new Uint8Array(g.nx * g.ny);
  for (const [a, b] of lines) {
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 2) continue;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, km = cellAt(m); if (km < 0 || !near(km)) continue;
    const nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const side = (d: number) => cellAt({ x: m.x + nrm.x * d, y: m.y + nrm.y * d });
    const p1 = side(8), p2 = side(-8);
    if (p1 < 0 || p2 < 0) continue;
    let inn: Pt | null = inward ? inward(m, nrm) : null;
    if (inn) { /* chosen by the caller */ } else if (isAir(p1) && isBand(p2)) inn = { x: -nrm.x, y: -nrm.y }; else if (isAir(p2) && isBand(p1)) inn = nrm;
    if (!inn) continue;
    const depth = depthOf(m, inn);
    out.push({ a, b, inn, depth });
    for (let u = -2.5; u <= len + 2.5; u += 2.5) for (let w = -2.5; w <= depth + 5; w += 2.5) { const k = cellAt({ x: a.x + ((b.x - a.x) * u) / len + inn.x * w, y: a.y + ((b.y - a.y) * u) / len + inn.y * w }); if (k >= 0) covered[k] = 1; }
  }
  return { pieces: out, covered };
}
/** Stone band (−0.35..+0.45) and a 2 cm glass pane (to +1.10) for each piece, rings in model metres; chords overlap 1 cm so a curve has no seams. */
function rectCovered(r: { i0: number; j0: number; i1: number; j1: number }, covered: Uint8Array, nx = 0) {
  void nx; let n = 0, c = 0;
  for (let j = r.j0; j < Math.max(r.j0 + 1, r.j1); j++) for (let i = r.i0; i < Math.max(r.i0 + 1, r.i1); i++) { n++; if (covered[j * RECT_NX + i]) c++; }
  return c >= 0.6 * n;
}
let RECT_NX = 0;
function pushBand(prims: Primitive[], pieces: Array<{ a: Pt; b: Pt; inn: Pt; depth: number }>, L: number, id: string, glass: BuildingMaterial, outset = 0) {
  const M = (p: Pt): [number, number] => [p.x / 100, -p.y / 100];
  // where two chords meet at a real corner (over 20°) the panes would cross and double the tint: each pane stops short there
  const dir = (p: { a: Pt; b: Pt }) => { const l = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y); return { x: (p.b.x - p.a.x) / l, y: (p.b.y - p.a.y) / l }; };
  const cornerAt = (self: { a: Pt; b: Pt }, q: Pt) => pieces.some((o) => o !== self && [o.a, o.b].some((e) => Math.hypot(e.x - q.x, e.y - q.y) < 3) && Math.abs(dir(o).x * dir(self).x + dir(o).y * dir(self).y) < Math.cos((20 * Math.PI) / 180));
  for (const piece of pieces) {
    const { a, b, inn, depth } = piece;
    const len = Math.hypot(b.x - a.x, b.y - a.y), t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const ga = cornerAt(piece, a) ? 7 : -1, gb = cornerAt(piece, b) ? 7 : -1;
    const a2 = { x: a.x + t.x * ga, y: a.y + t.y * ga }, b2 = { x: b.x - t.x * gb, y: b.y - t.y * gb };
    const a1 = { x: a.x - t.x, y: a.y - t.y }, b1 = { x: b.x + t.x, y: b.y + t.y };
    const at = (p: Pt, w: number) => ({ x: p.x + inn.x * w, y: p.y + inn.y * w });
    prims.push({ type: "prism", ring: [M(at(a1, -outset)), M(at(b1, -outset)), M(at(b1, depth)), M(at(a1, depth))], y0: L - 0.35, y1: L + 0.45, material: "stone", tag: `balcony-band:${id}` });
    prims.push({ type: "prism", ring: [M(at(a2, 5)), M(at(b2, 5)), M(at(b2, 7)), M(at(a2, 7))], y0: L + 0.45, y1: L + 1.1, material: glass, tag: `balcony-rail:${id}` });
  }
}
const grids = new Map(storeys.map((st) => [st.id, storeyGrid(st)] as const));
const THIN = 3;
const towerG = grids.get("א")!.g;
// The ground storey draws window blocks where its own tab has no wall ("שטח מפולש" under the tower): the sheet's elevations show a
// closed wall with those windows. That wall is the storey above's outer wall, taken over each run of it that holds a window
// symbol of the ground tab. Counted in the report.
const groundWallAdded: Record<string, number> = {};
const groundWallMask = new Map<string, Uint8Array>();
for (const id of ["ק"] as const) {
  const sg0 = grids.get(id), up = grids.get("א");
  if (!sg0 || !up || sg0.g.nx !== up.g.nx || sg0.g.ny !== up.g.ny || sg0.g.x0 !== up.g.x0 || sg0.g.y0 !== up.g.y0) continue;
  const g0 = sg0.g, gu = up.g, st0 = storeys.find((s) => s.id === id)!;
  const upWall = (k: number) => !!gu.line[k] || (gu.region[k]! > 0 && gu.regionDepth[gu.region[k]!]! <= THIN);
  const sym = new Uint8Array(g0.nx * g0.ny);
  for (const p of st0.pieces) {
    if (!/^(open windows|opens)$/.test(p.layer) || p.text || p.dimension || p.path.some((n) => NOT_BUILDING.test(n))) continue;
    for (const [a0, b0] of segmentsOf(p)) { const a = sg0.local(a0), b = sg0.local(b0); const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let s = 0; s <= n; s++) { const i = Math.floor((a.x + ((b.x - a.x) * s) / n - g0.x0) / CELL), j = Math.floor((a.y + ((b.y - a.y) * s) / n - g0.y0) / CELL); if (i >= 0 && j >= 0 && i < g0.nx && j < g0.ny) sym[j * g0.nx + i] = 1; } }
  }
  const C = (k: number) => !!g0.outside[k] && upWall(k);
  const seen = new Uint8Array(g0.nx * g0.ny); let added = 0; const mask = new Uint8Array(g0.nx * g0.ny); groundWallMask.set(id, mask);
  for (let k0 = 0; k0 < g0.nx * g0.ny; k0++) {
    if (!C(k0) || seen[k0]) continue;
    const comp: number[] = []; const q = [k0]; seen[k0] = 1; let holds = false;
    while (q.length) { const k = q.pop()!; comp.push(k); const i = k % g0.nx, j = (k - i) / g0.nx;
      for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g0.nx || jj >= g0.ny) continue; const kk = jj * g0.nx + ii; if (sym[kk]) holds = true; if (Math.abs(a) <= 1 && Math.abs(b) <= 1 && C(kk) && !seen[kk]) { seen[kk] = 1; q.push(kk); } } }
    if (!holds) continue;
    // only within 2 m of a window symbol: the run that holds the windows, not the whole outer ring of the storey above
    for (const k of comp) { const i = k % g0.nx, j = (k - i) / g0.nx; let near = false; for (let b = -40; b <= 40 && !near; b += 2) for (let a = -40; a <= 40 && !near; a += 2) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g0.nx && jj < g0.ny && sym[jj * g0.nx + ii]) near = true; } if (!near) continue; g0.line[k] = 1; g0.outside[k] = 0; mask[k] = 1; added++; }
  }
  groundWallAdded[id] = added;
  console.log(`${id}: ${added} wall cells taken from א's outer wall under window symbols with no wall`);
}
const site = readSite(storeys, { g: towerG, inside: (k) => !towerG.outside[k] });
report.groundWallAdded = groundWallAdded;
report.site = { notes: site.notes, marks: site.marks, trees: site.trees.length, spotsUsed: site.spots.filter((x) => x.used).length };
say(site.notes.join("; "));
const underTower = (p: Pt) => { const i = Math.floor((p.x - towerG.x0) / CELL), j = Math.floor((p.y - towerG.y0) / CELL); return i >= 0 && j >= 0 && i < towerG.nx && j < towerG.ny && !towerG.outside[j * towerG.nx + i]; };

// The four elevation drawings (model space). Their offset along each face is fitted on the typical storey, which the loop
// therefore takes first.
const elevAll = readElevOpenings(file);
const elevOffset: Record<string, number> = {};
const FIT_STOREY = "א";
/** Openings of the two ground storeys that the elevations draw, for capping the site walls in front of them. */
const shownLow: Array<{ hz: boolean; cross: number; s0: number; s1: number; sill: number; storey: string; floor: number; out: number }> = [];
const siteWallCapped: string[] = [];
/** How far in front of a ground-storey window a site wall is capped at its sill (cm): the elevation draws the window clear, and the
 *  east ramp wall stands 3.5 m out (1.5 m left it hiding two thirds of the slope windows). */
const CAP_REACH = 400;
report.elevations = { openings: elevAll.length };
/** The louvres as the elevations draw them: the "_USER" hatch (vertical slat lines), per sheet, as [elevation x, level from, level to]. */
const elevLouvre: Array<{ sheet: string; x: number; z0: number; z1: number }> = [];
for (const p of flattenDxf(drawing)) {
  if (p.type !== "HATCH" || !p.strokes || (p as { pattern?: string }).pattern !== "_USER") continue;
  for (const [u, v] of p.strokes) {
    if (Math.abs(u.x - v.x) > 1) continue; // slat lines are vertical
    const e = ELEVS.find((e) => u.x >= e.x0 && u.x <= e.x1); if (!e || Math.min(u.y, v.y) < -35300 || Math.max(u.y, v.y) > -31300) continue;
    elevLouvre.push({ sheet: e.sheet, x: u.x - e.x0, z0: (Math.min(u.y, v.y) - Y0) / 100 + LINE_SHIFT, z1: (Math.max(u.y, v.y) - Y0) / 100 + LINE_SHIFT });
  }
}
/** Layers read by another key than their name (for the coverage audit): "h kayam" (the elevations' AR-B816 stone hatch, read by
 *  pattern below), "-door" (anonymous block *U146 whose lines are on "opens", read by the elevation reader), "M4804" and "M2802"
 *  (survey manhole and planting outside the plot, read by block name). */
export const READ_BY_OTHER_KEY = ["h kayam", "-door", "M4804", "M2802"];
/** The elevations' stone hatches ("h kayam", AR-B816), ring by ring, as [sheet, elevation x from–to, level from–to]: the fronts of
 *  the stone boxes, the balcony bands and the boxes' sides. */
const elevBoxes: Array<{ sheet: string; xa: number; xb: number; z0: number; z1: number }> = [];
for (const p of flattenDxf(drawing)) {
  if (p.type !== "HATCH" || (p as { pattern?: string }).pattern !== "AR-B816") continue;
  for (const r of p.rings ?? []) { const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
    const e = ELEVS.find((e) => Math.min(...xs) >= e.x0 - 300 && Math.max(...xs) <= e.x1 + 300); if (!e || Math.min(...ys) < -35300 || Math.max(...ys) > -31300) continue;
    elevBoxes.push({ sheet: e.sheet, xa: Math.min(...xs) - e.x0, xb: Math.max(...xs) - e.x0, z0: (Math.min(...ys) - Y0) / 100 + LINE_SHIFT, z1: (Math.max(...ys) - Y0) / 100 + LINE_SHIFT }); }
}
for (const st of [...storeys].sort((a, b) => Number(b.id === FIT_STOREY) - Number(a.id === FIT_STOREY))) {
  const o = st.origin;
  const sg = grids.get(st.id);
  if (!sg) continue;
  const { g, segs, local } = sg;
  // The basement is wholly under the ground (the sections bury it; the yards are at −3.00 and its roof at −3.00): not drawn.
  if (st.id === "מרתף") { storeyReport.push({ id: st.id, level: st.level, skipped: "underground: walls not drawn in an exterior model" }); say(`${st.id}: underground, not drawn`); continue; }
  // Wall = drawn line cells + thin enclosed regions (a wall's core between its faces): deepest cell ≤ 3 cells (15 cm) from a face.
  const isWall = (k: number) => !!g.line[k] || (g.region[k]! > 0 && g.regionDepth[g.region[k]!]! <= THIN);
  const inside = (k: number) => !g.outside[k];
  footprints.set(st.id, { grid: g, inside });
  // Labelled regions: "מרפסת" is a balcony (its outer walls are a stone band + a rail, not a storey-high wall: the sheet
  // elevations draw the band and the 2.40 doors behind it); "מסתור" is a laundry / AC screen (its outer wall is louvres).
  const labelled = (re: RegExp) => {
    const set = new Set<number>();
    for (const p of st.pieces) {
      if (!p.text || !p.at || !re.test(p.text)) continue;
      const a = local(p.at); const i = Math.floor((a.x - g.x0) / CELL), j = Math.floor((a.y - g.y0) / CELL);
      let r = 0;
      for (let d = 0; d < 10 && !r; d++) for (let b = -d; b <= d && !r; b++) for (let c = -d; c <= d && !r; c++) {
        const ii = i + c, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const rr = g.region[jj * g.nx + ii]!; if (rr && g.regionDepth[rr]! > THIN) r = rr;
      }
      if (r) set.add(r);
    }
    return set;
  };
  const balconyR = labelled(/מרפסת/), screenR = labelled(/מסתור/);
  // A wall cell belongs to a balcony's (screen's) front when, walking through wall cells up to 60 cm, it meets that region
  // and no other room: a wall between a balcony and a room is the façade itself, storey high.
  const frontOf = (rs: Set<number>) => {
    const out = new Uint8Array(g.nx * g.ny);
    if (!rs.size) return out;
    for (let k = 0; k < g.nx * g.ny; k++) {
      if (!isWall(k)) continue;
      const seen = new Set<number>([k]); const q = [k]; let hit = false, other = false, outside = false;
      for (let h = 0; h < q.length && q.length < 400; h++) {
        const c = q[h]!;
        for (const n of [c - 1, c + 1, c - g.nx, c + g.nx]) {
          if (n < 0 || n >= g.nx * g.ny || seen.has(n)) continue; seen.add(n);
          if (g.outside[n]) { outside = true; continue; }
          const r = g.region[n]!;
          if (r && g.regionDepth[r]! > THIN) { if (rs.has(r)) hit = true; else other = true; continue; }
          if (isWall(n) && Math.abs((n % g.nx) - (k % g.nx)) <= 12 && Math.abs(Math.floor(n / g.nx) - Math.floor(k / g.nx)) <= 12) q.push(n);
        }
      }
      if (hit && !other && outside) out[k] = 1;
    }
    return out;
  };
  const parapet = frontOf(balconyR), screen = frontOf(screenR);
  // In the two ground tabs, walls that stand only between yards (no room under the tower within 60 cm) are site walls.
  const siteWall = new Uint8Array(g.nx * g.ny);
  if (st.id === "ק" || st.id === "שיפוע") {
    const dist = new Int32Array(g.nx * g.ny).fill(-1);
    const q: number[] = [];
    for (let k = 0; k < g.nx * g.ny; k++) {
      const r = g.region[k]!;
      if (r > 0 && g.regionDepth[r]! > THIN) { const i = k % g.nx, j = (k - i) / g.nx; if (underTower(centreOf(g, i, j))) { dist[k] = 0; q.push(k); } }
    }
    for (let h = 0; h < q.length; h++) {
      const k = q[h]!; if (dist[k]! >= 12) continue;
      const i = k % g.nx, j = (k - i) / g.nx;
      for (const kk of [k - 1, k + 1, k - g.nx, k + g.nx]) { if (kk < 0 || kk >= g.nx * g.ny || dist[kk] !== -1 || !isWall(kk)) continue; dist[kk] = dist[k]! + 1; q.push(kk); }
    }
    { const gm = groundWallMask.get(st.id); for (let k = 0; k < g.nx * g.ny; k++) if (isWall(k) && dist[k] === -1 && !gm?.[k]) siteWall[k] = 1; }
  }

  // Openings: each dimension written "u.k=… o.k=…" spans one opening of the facade it stands beside. Its extension lines give the
  // exact span; walking from the dimension line toward the building, the first wall band met is the one it opens.
  const openings: Opening[] = [];
  const unmatched: string[] = [];
  const owner = new Int32Array(g.nx * g.ny).fill(-1);
  const dimSegs = new Map<string, Array<[Pt, Pt]>>();
  for (const p of st.pieces) { const n = p.path.at(-1); if (n?.startsWith("*D") && p.pts) for (const s of segmentsOf(p)) (dimSegs.get(n) ?? dimSegs.set(n, []).get(n)!).push([local(s[0]), local(s[1])]); }
  // Two ways the sheet writes an opening's heights on its dimension: "u.k=SILL o.k=HEAD", and a door "<>\X240" (the measured
  // width over its height, sill on the floor). The second is the dimension's own override text; its block holds the drawn copy.
  const cands: Array<{ p: DxfPiece; m: [string, string, string]; dn: string }> = [];
  const dimTexts = st.pieces.filter((q) => q.text && q.at && !q.dimension && q.path.at(-1)?.startsWith("*D"));
  for (const p of st.pieces) {
    if (!p.text || !p.at) continue;
    if (p.dimension) {
      const x = /^<>\\X(\d{3})$/.exec(p.text.trim());
      if (!x) continue;
      const near = dimTexts.filter((q) => q.text!.trim() === x[1] && Math.hypot(q.at!.x - p.at!.x, q.at!.y - p.at!.y) < 40).sort((a, b) => Math.hypot(a.at!.x - p.at!.x, a.at!.y - p.at!.y) - Math.hypot(b.at!.x - p.at!.x, b.at!.y - p.at!.y))[0];
      if (!near) { unmatched.push(`door dimension without its block: ${p.text}`); continue; }
      cands.push({ p: near, m: [p.text, "0", x[1]], dn: near.path.at(-1)! });
      continue;
    }
    const m = /u\.?k\s*=\s*(\d+)[\s/]*o\.?k\s*=\s*(\d+)/i.exec(p.text);
    const dn = p.path.at(-1);
    if (!m || !dn?.startsWith("*D")) continue;
    cands.push({ p, m: [m[0], m[1]!, m[2]!], dn });
  }
  const seenBlock = new Set<string>();
  for (const { p, m, dn } of cands) {
    if (!p.at || seenBlock.has(dn)) continue;
    seenBlock.add(dn);
    const segs2 = dimSegs.get(dn) ?? [];
    const rot = ((((p.rotation ?? 0) % 180) + 180) % 180);
    const horiz = rot < 45 || rot > 135; // the dimension runs along x
    // The dimension line (extension lines are suppressed in this set): the longest segment along the run.
    const runs = segs2.filter(([u, v]) => (horiz ? Math.abs(u.y - v.y) < 0.5 : Math.abs(u.x - v.x) < 0.5)).sort((u, v) => Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y) - Math.hypot(u[1].x - u[0].x, u[1].y - u[0].y));
    const dl = runs[0];
    if (!dl || Math.hypot(dl[1].x - dl[0].x, dl[1].y - dl[0].y) < 30) { unmatched.push(`no dimension line: ${p.text} @${local(p.at).x.toFixed(0)},${local(p.at).y.toFixed(0)}`); continue; }
    const s0 = horiz ? Math.min(dl[0].x, dl[1].x) : Math.min(dl[0].y, dl[1].y), s1 = horiz ? Math.max(dl[0].x, dl[1].x) : Math.max(dl[0].y, dl[1].y);
    const t = local(p.at);
    const tp = horiz ? dl[0].y : dl[0].x;
    // Which side the building is: the side whose wall is met first from the run's middle.
    const firstWall = (dir: number) => { const sv = (s0 + s1) / 2; for (let w = 0; w < 600 / CELL; w++) { const pv = tp + dir * w * CELL; const x = horiz ? sv : pv, y = horiz ? pv : sv; const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL); if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return 1e9; if (!g.outside[j * g.nx + i]) return w; } return 1e9; };
    const up = firstWall(1), down = firstWall(-1);
    if (Math.min(up, down) >= 1e9) { unmatched.push(`no wall behind: ${p.text} @${t.x.toFixed(0)},${t.y.toFixed(0)}`); continue; }
    const dir = up <= down ? 1 : -1;
    const n = openings.length;
    const op: Opening = { box: { x0: horiz ? s0 : tp, y0: horiz ? tp : s0, x1: horiz ? s1 : tp, y1: horiz ? tp : s1 }, layer: "dim", block: dn, sill: Number(m[1]), head: Number(m[2]), source: p.path.slice(0, -1).join(">") || "drawn on the tab", face: horiz ? (dir > 0 ? "plan-bottom" : "plan-top") : (dir > 0 ? "plan-left" : "plan-right"), span: [Math.round(s0), Math.round(s1)], line: Math.round(tp), hz: horiz, cross: tp };
    let hit = 0;
    const cols = Math.round((s1 - s0) / CELL);
    for (let c = 0; c < cols; c++) {
      const sv = s0 + (c + 0.5) * CELL;
      // walk inward up to 6 m
      let inBand = false, depth = 0;
      for (let w = 0; w < 600 / CELL; w++) {
        const pv = tp + dir * w * CELL;
        const x = horiz ? sv : pv, y = horiz ? pv : sv;
        const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL);
        if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) break;
        const k = j * g.nx + i;
        if (g.outside[k]) { if (inBand) break; continue; }
        // a balcony's front and floor are crossed: the door stands in the façade behind them
        if (parapet[k] || balconyR.has(g.region[k]!)) { inBand = false; depth = 0; continue; }
        if (!isWall(k)) break; // a room: the band is crossed
        inBand = true; depth++;
        if (owner[k] === -1) { owner[k] = n; hit++; }
        if (depth > 12) break; // 60 cm: no wall is thicker
      }
    }
    if (!hit) { unmatched.push(`no wall behind: ${p.text} @${t.x.toFixed(0)},${t.y.toFixed(0)}`); continue; }
    openings.push(op);
  }
  // Window symbols in an outer wall that no dimension speaks of: the opening is drawn, its heights are not written. Built at the
  // typical floors' 105/210 and counted, so the report says which openings stand on a default.
  const dimOpenings = openings.length;
  {
    // "outside" for a window: open air, or on the two ground storeys a yard (a room-sized region not under the tower)
    const ext = new Uint8Array(g.nx * g.ny);
    for (let k = 0; k < g.nx * g.ny; k++) { if (g.outside[k]) { ext[k] = 1; continue; } const r = g.region[k]!; if ((st.id === "ק" || st.id === "שיפוע") && r && g.regionDepth[r]! > THIN) { const i = k % g.nx, j = (k - i) / g.nx; if (site.yard(centreOf(g, i, j))) ext[k] = 1; } }
    const nearOut = (k: number, n: number) => { const i = k % g.nx, j = (k - i) / g.nx; for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny && ext[jj * g.nx + ii]) return true; } return false; };
    const cand = new Uint8Array(g.nx * g.ny); const symSegs: Array<[Pt, Pt]> = []; let symbolDup = 0;
    for (const p of st.pieces) {
      if (!/^(open windows|opens)$/.test(p.layer) || p.text || p.dimension || p.path.some((n) => NOT_BUILDING.test(n))) continue;
      for (const [a0, b0] of segmentsOf(p)) {
        const a = local(a0), b = local(b0); symSegs.push([a, b]); const len = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.max(1, Math.ceil(len / 2));
        for (let s = 0; s <= n; s++) {
          const x = a.x + ((b.x - a.x) * s) / n, y = a.y + ((b.y - a.y) * s) / n;
          const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL);
          if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
          const k = j * g.nx + i;
          if (isWall(k) && !siteWall[k] && !parapet[k] && nearOut(k, 8)) cand[k] = 1;
        }
      }
    }
    const seen = new Uint8Array(g.nx * g.ny);
    for (let k0 = 0; k0 < g.nx * g.ny; k0++) {
      if (!cand[k0] || seen[k0]) continue;
      const comp: number[] = []; const q = [k0]; seen[k0] = 1;
      while (q.length) { const k = q.pop()!; comp.push(k); const i = k % g.nx, j = (k - i) / g.nx; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue; const kk = jj * g.nx + ii; if (cand[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); } } }
      const is = comp.map((k) => k % g.nx), js = comp.map((k) => Math.floor(k / g.nx));
      const i0 = Math.min(...is), i1 = Math.max(...is), j0 = Math.min(...js), j1 = Math.max(...js);
      const horiz = i1 - i0 >= j1 - j0;
      const len = (horiz ? i1 - i0 : j1 - j0) + 1;
      if (len * CELL < 40) continue;
      const owned = comp.filter((k) => owner[k]! >= 0).length;
      if (owned > comp.length * 0.2) continue; // a dimension already gives this one
      // The symbol's extent holds its frame and sill ears: the opening is the sash, the commonest length of the symbol's lines
      // that run along the wall.
      const bx0 = g.x0 + i0 * CELL, bx1 = g.x0 + (i1 + 1) * CELL, by0 = g.y0 + j0 * CELL, by1 = g.y0 + (j1 + 1) * CELL;
      const lens = new Map<number, number>();
      for (const [a, b] of symSegs) {
        const along = horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y), across = horiz ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
        if (across > 1 || along < 40 || along > 400) continue;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (mx < bx0 - 5 || mx > bx1 + 5 || my < by0 - 5 || my > by1 + 5) continue;
        const r = Math.round(along / 10) * 10; lens.set(r, (lens.get(r) ?? 0) + 1);
      }
      // lengths drawn at least twice, longest first: the sill board spans the whole symbol (skip it), then the frame; the leaves are shorter
      const ext0 = horiz ? bx1 - bx0 : by1 - by0;
      const twice = [...lens].filter(([, c]) => c >= 2).map(([l]) => l).sort((u, v) => v - u);
      const sash = (twice[0] !== undefined && twice[0] >= 0.85 * ext0 ? twice[1] : twice[0]) ?? ext0;
      const cA = horiz ? (bx0 + bx1) / 2 : (by0 + by1) / 2, cX = horiz ? (by0 + by1) / 2 : (bx0 + bx1) / 2;
      const s0 = cA - sash / 2, s1 = cA + sash / 2;
      // one opening once: a dimension (or another symbol) on the same run, overlapping by half, within 3 m across, is this one
      const dup = openings.find((o) => o.hz === horiz && o.span && Math.min(o.span[1]!, s1) - Math.max(o.span[0]!, s0) > 0.5 * Math.min(o.span[1]! - o.span[0]!, s1 - s0) && Math.abs((o.cross ?? 1e9) - cX) < 300);
      if (dup) { symbolDup++; continue; }
      const n = openings.length; let hit = 0;
      const a0 = Math.floor((s0 - (horiz ? g.x0 : g.y0)) / CELL), a1 = Math.ceil((s1 - (horiz ? g.x0 : g.y0)) / CELL);
      for (let jj = horiz ? j0 - 12 : a0; jj < (horiz ? j1 + 13 : a1); jj++) for (let ii = horiz ? a0 : i0 - 12; ii < (horiz ? a1 : i1 + 13); ii++) {
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue; const k = jj * g.nx + ii;
        if (isWall(k) && !siteWall[k] && !parapet[k] && owner[k] === -1 && nearOut(k, 12)) { owner[k] = n; hit++; }
      }
      if (!hit) continue;
      openings.push({ box: horiz ? { x0: s0, y0: by0, x1: s1, y1: by1 } : { x0: bx0, y0: s0, x1: bx1, y1: s1 }, layer: "symbol", block: "symbol", sill: 105, head: 210, source: `window symbol, no dimension: default 105/210, sash ${sash}`, face: "symbol", span: [Math.round(s0), Math.round(s1)], line: Math.round(cX), hz: horiz, cross: cX });
    }
    if (symbolDup) unmatched.push(`${symbolDup} window symbols already given by a dimension or another symbol: not built twice`);
  }
  if (openings.length > dimOpenings) unmatched.push(`${openings.length - dimOpenings} openings from window symbols with no dimension: default heights 105/210`);

  // The elevations decide (the user's rule when plan and elevation disagree). Each outer opening the elevation draws on this
  // storey is matched to a plan opening on the same face by its centre (25 cm). A match keeps the plan's measured span and takes
  // the elevation's heights when they differ by more than 10 cm; an elevation opening with no plan opening is built from the
  // elevation; a plan opening on that face that the elevation does not draw is closed. Every change is listed in the report.
  const elevChanges: string[] = [];
  {
    const SNAP = [0, 40, 60, 100, 105, 110, 150, 210, 240];
    const snap = (v: number) => SNAP.find((x) => Math.abs(x - v) <= 6) ?? Math.round(v / 5) * 5;
    const isYard = (k: number) => { if (st.id !== "ק" && st.id !== "שיפוע") return false; const r = g.region[k]!; if (!r || g.regionDepth[r]! <= THIN) return false; const i = k % g.nx, j = (k - i) / g.nx; return site.yard(centreOf(g, i, j)); };
    const outerOf = (op: Opening) => { if (op.hz === undefined || op.cross === undefined) return null; for (const sheet of Object.keys(FACE)) if (sideOf(sheet, { line: op.cross, hz: op.hz })) return sheet; return null; };
    const elevOf = (sheet: string, c: number) => { const fc = FACE[sheet]!, ex0 = ELEVS.find((e) => e.sheet === sheet)!.x0;
      return elevAll.filter((o) => o.sheet === sheet && o.z0 + LINE_SHIFT - st.level >= -0.1 && o.z0 + LINE_SHIFT - st.level < st.height - 0.1)
        .map((o) => { const a = fc.sign * (o.x0 - ex0) + c, b = fc.sign * (o.x1 - ex0) + c; return { a: Math.min(a, b), b: Math.max(a, b), sill: Math.round((o.z0 + LINE_SHIFT - st.level) * 100), head: Math.round((o.z1 + LINE_SHIFT - st.level) * 100) }; }); };
    // the offset along each face: fitted on the typical storey (processed first), where plan and elevation agree
    if (st.id === FIT_STOREY) for (const sheet of Object.keys(FACE)) {
      const raw = elevOf(sheet, 0).map((e) => ({ sheet, x0: 0, x1: 0, z0: 0, z1: 0, n: 0, a: e.a, b: e.b }));
      const fit = fitOffset(sheet, raw.map((e) => ({ sheet, x0: e.a, x1: e.b, z0: 0, z1: 0, n: 0 })), openings.filter((op) => outerOf(op) === sheet).map((op) => ({ a: op.span![0]!, b: op.span![1]! })), true);
      elevOffset[sheet] = fit.c; say(`elevation ${sheet}: offset ${fit.c} cm, ${fit.hits}/${raw.length} of ${st.id}'s elevation openings on plan openings`);
      (report.elevations as Record<string, unknown>)[sheet] = { offset: fit.c, hits: fit.hits, of: raw.length };
    }
    for (const sheet of Object.keys(FACE)) {
      const fc = FACE[sheet]!, c = elevOffset[sheet];
      if (c === undefined) continue;
      const els = elevOf(sheet, c);
      // an elevation that draws two openings over each other on one storey contradicts itself there: the plan is kept
      const clash = els.find((e, i) => els.some((q, j) => j > i && Math.min(e.b, q.b) - Math.max(e.a, q.a) > 10));
      if (clash) { elevChanges.push(`${sheet}: the elevation draws overlapping openings at ${Math.round(clash.a)}-${Math.round(clash.b)} — this face is kept as the plan has it`); continue; }
      // an opening whose cut fell wholly in a site wall (a dimension written past a ramp, walked to the ramp's wall) opens no
      // building wall: it is no match for the elevation, which then cuts its window in the building's own wall
      const inBuilding = new Map<number, number>(); for (let k = 0; k < owner.length; k++) if (owner[k]! >= 0 && !siteWall[k]) inBuilding.set(owner[k]!, (inBuilding.get(owner[k]!) ?? 0) + 1);
      const mine = openings.map((op, i) => ({ op, i })).filter(({ op, i }) => outerOf(op) === sheet && (inBuilding.get(i) ?? 0) > 0);
      for (const [i, op] of openings.entries()) if (outerOf(op) === sheet && !inBuilding.get(i) && op.layer !== "elevation") elevChanges.push(`${sheet} ${op.span!.join("-")} (${op.layer}): its cut fell in a site wall only — not a building opening`);
      // The elevation is drawn up to ~45 cm off the plan's measured spans: pairs are matched nearest first within 60 cm (openings
      // stand 2 m and more apart). A pair whose widths differ by 25 cm or more is not the same opening: the elevation's is built.
      const mid = (op: Opening) => (op.span![0]! + op.span![1]!) / 2;
      const frame = (e: { a: number; b: number }) => (e.b - e.a < 200 ? { s0: e.a + 5, s1: e.b - 5 } : { s0: e.a + 1, s1: e.b - 1 }); // a window's frame is drawn 5 cm a side
      const pairs: Array<{ ei: number; mi: number; d: number }> = [];
      els.forEach((e, ei) => mine.forEach(({ op }, mi) => { const d = Math.abs(mid(op) - (e.a + e.b) / 2); if (d < 60) pairs.push({ ei, mi, d }); }));
      pairs.sort((u, v) => u.d - v.d);
      const eUsed = new Map<number, number>(), mUsed = new Set<number>();
      for (const p of pairs) {
        if (eUsed.has(p.ei) || mUsed.has(p.mi)) continue;
        const e = els[p.ei]!, op = mine[p.mi]!.op, fr = frame(e);
        if (Math.abs((fr.s1 - fr.s0) - (op.span![1]! - op.span![0]!)) >= 25) continue;
        eUsed.set(p.ei, p.mi); mUsed.add(p.mi);
      }
      // first close what the elevation does not draw, so its own opening can be cut in that wall
      mine.forEach(({ op, i }, mi) => {
        if (mUsed.has(mi)) return;
        let closed = 0; for (let k = 0; k < owner.length; k++) if (owner[k] === i) { owner[k] = -1; closed++; }
        elevChanges.push(`${sheet} ${op.span!.join("-")} ${op.sill}/${op.head} (${op.layer}): not on the elevation — closed (${closed} cells)`);
      });
      els.forEach((e, ei) => {
        const sill = snap(e.sill), head = snap(e.head);
        const mi = eUsed.get(ei);
        if (mi !== undefined) {
          const op = mine[mi]!.op;
          op.elev = true;
          if (Math.abs(op.sill - sill) > 10 || Math.abs(op.head - head) > 10) { elevChanges.push(`${sheet} ${op.span!.join("-")}: heights ${op.sill}/${op.head} → ${sill}/${head} (elevation)`); op.sill = sill; op.head = head; op.source += " · heights from the elevation"; }
          return;
        }
        const { s0, s1 } = frame(e);
        const n = openings.length; let hit = 0, crossAt = 0;
        const nAlong = fc.hz ? g.nx : g.ny, nAcross = fc.hz ? g.ny : g.nx, o0 = fc.hz ? g.x0 : g.y0;
        for (let a = Math.floor((s0 - o0) / CELL); a < Math.ceil((s1 - o0) / CELL); a++) {
          if (a < 0 || a >= nAlong) continue;
          let inBand = false, depth = 0;
          for (let w2 = 0; w2 < nAcross; w2++) {
            const b = fc.far ? nAcross - 1 - w2 : w2;
            const k = fc.hz ? b * g.nx + a : a * g.nx + b;
            if (g.outside[k] || isYard(k) || siteWall[k]) { if (inBand) break; continue; }
            if (parapet[k] || balconyR.has(g.region[k]!)) { inBand = false; depth = 0; continue; }
            if (!isWall(k)) break;
            inBand = true; depth++;
            if (owner[k] === -1) { owner[k] = n; hit++; crossAt = b; }
            if (depth > 12) break;
          }
        }
        if (!hit) { elevChanges.push(`${sheet} ${Math.round(s0)}-${Math.round(s1)} ${sill}/${head}: drawn on the elevation, no wall met from outside — not built`); return; }
        const cross = (fc.hz ? g.y0 : g.x0) + (crossAt + 0.5) * CELL;
        openings.push({ box: fc.hz ? { x0: s0, y0: cross, x1: s1, y1: cross } : { x0: cross, y0: s0, x1: cross, y1: s1 }, layer: "elevation", block: "elevation", sill, head, source: `elevation ${sheet}`, face: "elevation", span: [Math.round(s0), Math.round(s1)], line: Math.round(cross), hz: fc.hz, cross, elev: true });
        elevChanges.push(`${sheet} ${Math.round(s0)}-${Math.round(s1)} ${sill}/${head}: built from the elevation (no plan opening of its size within 60 cm)`);
      });
    }
    // ground-storey openings the elevation shows: a site wall standing in front of one may not rise over its sill (see the site walls)
    if (st.id === "שיפוע" || st.id === "ק") for (const op of openings) if (op.elev && op.span && op.cross !== undefined && op.hz !== undefined) { const sh = Object.keys(FACE).find((x) => sideOf(x, { line: op.cross!, hz: op.hz! })); shownLow.push({ hz: op.hz, cross: op.cross, s0: op.span[0]!, s1: op.span[1]!, sill: st.level + op.sill / 100, storey: st.id, floor: st.level, out: sh && FACE[sh]!.far ? 1 : -1 }); }
    // A wall borrowed from the storey above (rule 3.60) that stands as a screen in front of a window the elevation shows on this
    // storey is not there: the elevation draws the window clear. Only a run parallel to the window, across at least half its width
    // and a metre or more in front, goes: nearer cells are the storey above's own face over the window, and runs across the window
    // line are side walls (r13 removed both and opened a corner). Counted.
    { const gm = groundWallMask.get(st.id);
      if (gm) { let dropped = 0, screens = 0;
        for (const o of shownLow) { if (o.storey !== st.id) continue;
          const rows = new Map<number, number[]>();
          for (let k = 0; k < gm.length; k++) { if (!gm[k] || !g.line[k]) continue; const i = k % g.nx, j = (k - i) / g.nx; const c = centreOf(g, i, j);
            const along = o.hz ? c.x : c.y, out = ((o.hz ? c.y : c.x) - o.cross) * o.out;
            if (along < o.s0 - 10 || along > o.s1 + 10 || out < 100 || out > CAP_REACH) continue;
            const r = Math.round(out / CELL); (rows.get(r) ?? rows.set(r, []).get(r)!).push(k); }
          const need = (0.5 * (o.s1 - o.s0)) / CELL; let hit = false;
          for (const ks of rows.values()) { if (ks.length < need) continue; for (const k of ks) { g.line[k] = 0; g.outside[k] = 1; } dropped += ks.length; hit = true; }
          if (hit) screens++; }
        if (dropped) elevChanges.push(`${dropped} borrowed wall cells stood as a screen in front of ${screens} window(s) the elevation shows: removed`); } }
    if (elevChanges.length) say(`${st.id}: by the elevations — ${elevChanges.length} changes\n    ${elevChanges.join("\n    ")}`);
  }

  const L = st.level, H = st.height;
  const roofStorey = st.id === "גג";
  const toM = (i: number, j: number): [number, number] => [(g.x0 + i * CELL) / 100, -(g.y0 + j * CELL) / 100];
  const ringOf = (r: { i0: number; j0: number; i1: number; j1: number }): Array<[number, number]> => [toM(r.i0, r.j0), toM(r.i1, r.j0), toM(r.i1, r.j1), toM(r.i0, r.j1)];
  // Roof: the outer loop is the parapet; walls inside it (stair and lift heads) are full rooms.
  const nearOutside = (k: number, n: number) => { const i = k % g.nx, j = (k - i) / g.nx; for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) { const q = (j + b) * g.nx + (i + a); if (g.outside[q]) return true; } return false; };
  let wallPrims = 0, openPrims = 0;
  let parapetPrims = 0, screenPrims = 0;
  // a walled balcony's front follows its drawn wall face (curved fronts stay curved); its thickness is measured across the cells
  RECT_NX = g.nx;
  const parBand = bandAlongLines(g, segs, (k) => !!g.outside[k], (k) => !!parapet[k] || balconyR.has(g.region[k]!), // a single drawn face: the balcony floor is right behind it
    (k) => { const i = k % g.nx, j = (k - i) / g.nx; for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const q = (j + b) * g.nx + (i + a); if (q >= 0 && q < g.nx * g.ny && parapet[q]) return true; } return false; },
    (m, inn) => { let d = 0; for (let w = 2; w <= 45; w += 1) { const i = Math.floor((m.x + inn.x * w - g.x0) / CELL), j = Math.floor((m.y + inn.y * w - g.y0) / CELL); if (i < 0 || j < 0 || i >= g.nx || j >= g.ny || !parapet[j * g.nx + i]) break; d = w; } return Math.max(20, d + 1); });
  // 5 cm proud of the drawn face: the storey slab, cut from the 5 cm grid, steps out past a slanted face by up to a cell
  pushBand(prims, parBand.pieces, L, st.id, RAIL_GLASS, 5); parapetPrims += parBand.pieces.length;
  for (const r of rects(g, (k) => isWall(k), (k) => (siteWall[k] ? 2 : owner[k]! >= 0 ? 1000 + owner[k]! : parapet[k] ? 3 : screen[k] ? 4 : roofStorey && nearOutside(k, 8) ? 1 : 0))) {
    const ring = ringOf(r);
    if (r.key === 3 && parBand.pieces.length && rectCovered(r, parBand.covered)) continue; // built along its drawn face above
    if (r.key === 3) {
      // the balcony's stone band round the slab edge (0.8 m: −0.35 to +0.45) and a glass rail to 1.10 above the floor
      prims.push({ type: "prism", ring, y0: L - 0.35, y1: L + 0.45, material: "stone", tag: `balcony-band:${st.id}` });
      prims.push({ type: "prism", ring, y0: L + 0.45, y1: L + 1.1, material: RAIL_GLASS, tag: `balcony-rail:${st.id}` });
      parapetPrims++; continue;
    }
    // screens stay stone walls until their louvre panels are read from the elevations (a plain louvre box read as a white block)
    if (r.key === 4) {
      // a closed screen recess: its front wall is the louvre panel, built as slats along the wall (4 cm every 12 cm)
      const [ax0, az0] = toM(r.i0, r.j0), [ax1, az1] = toM(r.i1, r.j1);
      const alongX = r.i1 - r.i0 >= r.j1 - r.j0, Lm = alongX ? ax1 - ax0 : Math.abs(az1 - az0);
      screenPanels.push({ storey: st.id, L, H, alongX, cross: alongX ? (az0 + az1) / 2 : (ax0 + ax1) / 2, a0: alongX ? ax0 : Math.min(az0, az1), a1: alongX ? ax1 : Math.max(az0, az1), ring });
      void Lm;
      screenPrims++; continue;
    }
    if (r.key === 0) { prims.push({ type: "prism", ring, y0: L, y1: L + H, material: "stone", tag: `wall:${st.id}` }); wallPrims++; continue; }
    if (r.key === 2) {
      // a site wall: from the lower ground beside it to the higher + a 1.05 m parapet (the sheets' rail height), or a retaining wall's top
      const c = centreOf(g, Math.floor((r.i0 + r.i1) / 2), Math.floor((r.j0 + r.j1) / 2));
      const thinX = r.i1 - r.i0 <= r.j1 - r.j0;
      const off = 60;
      const g1 = site.ground(thinX ? { x: c.x - off, y: c.y } : { x: c.x, y: c.y - off }), g2 = site.ground(thinX ? { x: c.x + off, y: c.y } : { x: c.x, y: c.y + off });
      const lo = Math.min(g1, g2), hi = Math.max(g1, g2);
      // A site wall parallel to a ground-storey opening the elevation shows, standing up to CAP_REACH in front of it over its span,
      // stops at that opening's sill: the elevation draws the window clear.
      let top = hi + 1.05;
      { const xa = g.x0 + r.i0 * CELL, xb = g.x0 + (r.i1 + 1) * CELL, ya = g.y0 + r.j0 * CELL, yb = g.y0 + (r.j1 + 1) * CELL;
        for (const o of shownLow) {
          const along0 = o.hz ? xa : ya, along1 = o.hz ? xb : yb, c0 = o.hz ? ya : xa, c1 = o.hz ? yb : xb;
          if ((o.hz ? xb - xa < yb - ya : yb - ya < xb - xa)) continue; // not parallel to the opening
          if (Math.min(along1, o.s1) - Math.max(along0, o.s0) <= 0) continue;
          if (Math.min(Math.abs(c0 - o.cross), Math.abs(c1 - o.cross)) > CAP_REACH) continue;
          if (o.sill < top) { siteWallCapped.push(`${st.id} site wall at ${Math.round(xa)},${Math.round(ya)}: top ${top.toFixed(2)} → ${o.sill.toFixed(2)} (window of ${o.storey} behind it, ${o.s0}-${o.s1})`); top = o.sill; }
        } }
      if (top <= lo - 0.3 + 0.05) { wallPrims++; continue; }
      prims.push({ type: "prism", ring, y0: lo - 0.3, y1: top, material: "stone", tag: `sitewall:${st.id}` }); wallPrims++; continue;
    }
    // the roof parapet: the sections mark its top +26.55 (1.35 over the roof at +25.20)
    if (r.key === 1) { prims.push({ type: "prism", ring, y0: L, y1: L + 1.35, material: "stone", tag: `parapet:${st.id}` }); wallPrims++; continue; }
    const op = openings[r.key - 1000]!;
    const sill = L + op.sill / 100, head = L + op.head / 100;
    if (op.sill > 0) prims.push({ type: "prism", ring, y0: L, y1: sill, material: "stone", tag: `sill:${st.id}` });
    prims.push({ type: "prism", ring, y0: head, y1: L + H, material: "stone", tag: `head:${st.id}` });
    // The pane: a thin sheet along the run, 5 cm in from the outer face.
    const w = r.i1 - r.i0, h = r.j1 - r.j0;
    const [ax0, az0] = toM(r.i0, r.j0), [ax1, az1] = toM(r.i1, r.j1);
    const outLeft = g.outside[r.j0 * g.nx + Math.max(0, r.i0 - 1)] === 1, outBelow = g.outside[Math.max(0, r.j0 - 1) * g.nx + r.i0] === 1;
    let pane: Array<[number, number]>;
    // the pane runs along its opening (a piece of a wide opening cut by the rectangle split can be taller than wide)
    if (op.hz !== undefined ? !op.hz : w <= h) { // runs along z: thin in x
      const xo = outLeft ? ax0 + 0.05 : ax1 - 0.08;
      pane = [[xo, az0], [xo + 0.03, az0], [xo + 0.03, az1], [xo, az1]];
    } else {
      const zo = outBelow ? az0 - 0.05 : az1 + 0.08; // y down = z up
      pane = [[ax0, zo], [ax1, zo], [ax1, zo - 0.03], [ax0, zo - 0.03]];
    }
    prims.push({ type: "prism", ring: pane, y0: sill, y1: head, material: op.layer === "open door" ? "glass" : "glass", tag: `pane:${st.id}:${op.block}` });
    openPrims++;
  }
  // Floor slab of this storey over its whole footprint (below ground the basement's too).
  let slabPrims = 0;
  // inset one cell from the outside: the slab edge is behind the facade, not in its plane (it showed as white bands)
  const nearOut1 = (k: number) => g.outside[k - 1] || g.outside[k + 1] || g.outside[k - g.nx] || g.outside[k + g.nx];
  for (const r of rects(g, (k) => inside(k) && !nearOut1(k))) { prims.push({ type: "prism", ring: ringOf(r), y0: L - 0.25, y1: L, material: "slab", tag: `slab:${st.id}` }); slabPrims++; }
  // Screens ("מסתור כביסה", "מסתור מזגנים"): a recess open to the air, closed at its mouth by a louvre panel the height of the
  // storey (the elevations hatch it in vertical slats). From the label: the open direction is the one that leaves the storey's
  // walls; the mouth is the last step out along it where walls still stand on both sides. Slats 4 cm every 12 cm, 8 cm deep.
  let louvrePanels = 0;
  {
    const wallAt = (x: number, y: number) => { const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL); return i >= 0 && j >= 0 && i < g.nx && j < g.ny && isWall(j * g.nx + i); };
    const done = new Set<string>();
    for (const p of st.pieces) {
      if (!p.text || !p.at || !/מסתור/.test(p.text)) continue;
      const P = local(p.at);
      const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best: { d: [number, number]; step: number; a: number; b: number } | null = null;
      for (const d of dirs) {
        // must leave without meeting a wall within 8 m
        let blocked = false; for (let s = 0; s < 800; s += CELL) if (wallAt(P.x + d[0] * s, P.y + d[1] * s)) { blocked = true; break; }
        if (blocked) continue;
        const lat: [number, number] = [-d[1], d[0]];
        let last: { step: number; a: number; b: number } | null = null;
        for (let s = 0; s < 800; s += CELL) {
          const cx = P.x + d[0] * s, cy = P.y + d[1] * s;
          let a = -1, b = -1;
          for (let t = 0; t < 500; t += CELL) { if (a < 0 && wallAt(cx - lat[0] * t, cy - lat[1] * t)) a = t; if (b < 0 && wallAt(cx + lat[0] * t, cy + lat[1] * t)) b = t; if (a >= 0 && b >= 0) break; }
          if (a < 0 || b < 0) break;
          last = { step: s, a, b };
        }
        if (last && (!best || last.step < best.step)) best = { d, ...last };
      }
      if (!best) { if (!screenR.size) unmatched.push(`screen label with no open mouth and no closed region: ${p.text} @${P.x.toFixed(0)},${P.y.toFixed(0)}`); continue; }
      const { d, step, a, b } = best; const lat: [number, number] = [-d[1], d[0]];
      const mx = P.x + d[0] * step, my = P.y + d[1] * step;
      const key = `${Math.round(mx / 20)},${Math.round(my / 20)},${Math.round(a / 20)},${Math.round(b / 20)}`;
      if (done.has(key)) continue; done.add(key);
      const from = { x: mx - lat[0] * a, y: my - lat[1] * a }, to = { x: mx + lat[0] * b, y: my + lat[1] * b };
      const alongX = Math.abs(lat[0]) > 0.5;
      screenPanels.push({ storey: st.id, L, H, alongX, cross: alongX ? -my / 100 : mx / 100, a0: alongX ? Math.min(from.x, to.x) / 100 : Math.min(-from.y, -to.y) / 100, a1: alongX ? Math.max(from.x, to.x) / 100 : Math.max(-from.y, -to.y) / 100 });
      louvrePanels++;
      void to;
    }
  }
  // Balconies outside the walls, closed by the slab-edge view lines: a "מרפסת" label outside the walls whose region in the
  // walls + edges grid is closed. Its floor is a slab; the edge lines round it (the band drawn as three lines) are the stone
  // band and the rail, as on a balcony closed by walls.
  let edgeBalconies = 0, edgeBand = 0;
  const g2 = sg.g2;
  if (g2.nx === g.nx && g2.ny === g.ny && g2.x0 === g.x0 && g2.y0 === g.y0 && st.level > 0) {
    const B = new Uint8Array(g.nx * g.ny);
    for (const p of st.pieces) {
      if (!p.text || !p.at || !/מרפסת/.test(p.text)) continue;
      const a = local(p.at); const i = Math.floor((a.x - g.x0) / CELL), j = Math.floor((a.y - g.y0) / CELL);
      const k0 = j * g.nx + i;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny || !g.outside[k0]) continue;
      const r = g2.region[k0]!;
      if (!r || g2.regionDepth[r]! <= THIN) { unmatched.push(`balcony label not closed by edge lines: ${p.text} @${a.x.toFixed(0)},${a.y.toFixed(0)}`); continue; }
      let n = 0;
      for (let k = 0; k < g.nx * g.ny; k++) if (g2.region[k] === r && g.outside[k] && !B[k]) { B[k] = 1; n++; }
      if (n) edgeBalconies++;
    }
    if (edgeBalconies) {
      const D = new Uint8Array(g.nx * g.ny);
      for (let k = 0; k < g.nx * g.ny; k++) if (B[k]) { const i = k % g.nx, j = (k - i) / g.nx; for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny) D[jj * g.nx + ii] = 1; } }
      // the band is the whole strip round the balcony floor up to its outer edge line (20 cm), one piece: the three drawn lines are its faces, not three slats
      const band = (k: number) => !!D[k] && !B[k] && !!g.outside[k];
      for (const r of rects(g, (k) => !!B[k])) prims.push({ type: "prism", ring: ringOf(r), y0: L - 0.25, y1: L, material: "slab", tag: `balcony-slab:${st.id}` });
      // the outer of the three drawn lines is the band's face: air beyond it (outside even with the edge lines drawn), band within
      // distance (cells) from the balcony floor, to tell which way is out
      const dist = new Int16Array(g.nx * g.ny).fill(-1); { const q: number[] = []; for (let k = 0; k < B.length; k++) if (B[k]) { dist[k] = 0; q.push(k); }
        for (let h = 0; h < q.length; h++) { const k = q[h]!; if (dist[k]! >= 10) continue; const i = k % g.nx; for (const kk of [i > 0 ? k - 1 : -1, i < g.nx - 1 ? k + 1 : -1, k - g.nx, k + g.nx]) if (kk >= 0 && kk < dist.length && dist[kk] === -1) { dist[kk] = dist[k]! + 1; q.push(kk); } } }
      const cellAt = (p: Pt) => { const i = Math.floor((p.x - g.x0) / CELL), j = Math.floor((p.y - g.y0) / CELL); return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i; };
      const near = sg.edges.filter(([a, b]) => { const k = cellAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); return k >= 0 && dist[k]! > 0 && dist[k]! <= 8; });
      const cross = (p: Pt, d: Pt, [a, b]: [Pt, Pt]) => { const ex = b.x - a.x, ey = b.y - a.y, den = d.x * ey - d.y * ex; if (Math.abs(den) < 1e-9) return false; const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den, u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den; return t > 1 && t < 30 && u >= 0 && u <= 1; };
      const outerLines: Array<[Pt, Pt]> = [];
      for (const sgm of near) {
        const [a, b] = sgm, len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 2) continue;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
        const d1 = dist[cellAt({ x: m.x + nrm.x * 8, y: m.y + nrm.y * 8 })] ?? -1, d2 = dist[cellAt({ x: m.x - nrm.x * 8, y: m.y - nrm.y * 8 })] ?? -1;
        const outDir = (d1 === -1 ? 99 : d1) > (d2 === -1 ? 99 : d2) ? nrm : { x: -nrm.x, y: -nrm.y };
        if (near.some((o) => o !== sgm && cross(m, outDir, o))) continue; // another edge line further out: not the face
        { const ko = cellAt({ x: m.x + outDir.x * 8, y: m.y + outDir.y * 8 }); if (ko < 0 || g.line[ko] || B[ko]) continue; } // the face looks out (air, or a neighbouring balcony's floor), not onto a wall or its own floor
        outerLines.push(sgm);
      }
      const isOutSide = (k: number) => k >= 0 && (dist[k] === -1 || dist[k]! > 0) && !!g.outside[k];
      const eb = bandAlongLines(g, outerLines, () => true, () => true, () => true, (m, inn) => { let d = 20; for (let w = 2; w <= 45; w += 1) { const k = cellAt({ x: m.x + inn.x * w, y: m.y + inn.y * w }); if (k < 0) break; if (B[k]) { d = w + 3; break; } } return d; },
        (m, nrm) => { const k1 = cellAt({ x: m.x + nrm.x * 8, y: m.y + nrm.y * 8 }), k2 = cellAt({ x: m.x - nrm.x * 8, y: m.y - nrm.y * 8 }); const d1 = k1 < 0 || dist[k1] === -1 ? 99 : dist[k1]!, d2 = k2 < 0 || dist[k2] === -1 ? 99 : dist[k2]!; return d1 < d2 ? nrm : { x: -nrm.x, y: -nrm.y }; });
      void isOutSide;
      pushBand(prims, eb.pieces, L, st.id, RAIL_GLASS); edgeBand += eb.pieces.length;
      // band cells the drawn edge does not reach (an edge not drawn): built as before, counted
      let leftover = 0;
      for (const r of rects(g, (k) => band(k) && !eb.covered[k])) { if ((r.i1 - r.i0 + 1) * CELL < 10 && (r.j1 - r.j0 + 1) * CELL < 10) continue; // a 5 cm speck between chords: not a piece
        prims.push({ type: "prism", ring: ringOf(r), y0: L - 0.35, y1: L + 0.45, material: "stone", tag: `balcony-band:${st.id}` }); leftover++; }
      if (leftover) unmatched.push(`${leftover} balcony band boxes with no drawn outer edge: built from the grid`);
    }
  }
  storeyReport.push({ elevChanges, id: st.id, level: L, abs: +(ABS_ZERO + L).toFixed(2), wallSegs: segs.length, wallPrims, openings: openings.length, openingList: openings.map((o) => ({ face: o.face, span: o.span, line: o.line, sill: o.sill, head: o.head, src: o.source })), openPrims, slabPrims, balconies: balconyR.size, parapetPrims, screens: screenR.size, screenPrims, louvrePanels, unmatched });
  say(`${st.id}: ${segs.length} wall segs, ${wallPrims} wall boxes, ${openings.length} openings (${unmatched.length} unmatched), ${slabPrims} slab boxes, ${balconyR.size} walled + ${edgeBalconies} edge-drawn balconies (${parapetPrims}+${edgeBand} band boxes), ${screenR.size} screens (${screenPrims} boxes), ${louvrePanels} louvre panels`);
}
// Louvre strips: the elevations draw each screen as one rectangle over several storeys. Panels on the same line (within 50 cm)
// and overlapping along it are one strip: its width is their union, its height from the lowest to the highest storey that has
// one. A run under 1.5 m is a recess's side wall, not a screen: left out and counted.
{
  const strips: Array<{ alongX: boolean; cross: number[]; a0: number; a1: number; y0: number; y1: number; storeys: Set<string>; members: typeof screenPanels }> = [];
  for (const p of [...screenPanels].sort((u, v) => u.a0 - v.a0)) {
    const s = strips.find((t) => t.alongX === p.alongX && Math.abs(t.cross.reduce((a, b) => a + b, 0) / t.cross.length - p.cross) < 0.5 && p.a0 <= t.a1 + 0.3 && p.a1 >= t.a0 - 0.3);
    if (s) { s.cross.push(p.cross); s.a0 = Math.min(s.a0, p.a0); s.a1 = Math.max(s.a1, p.a1); s.y0 = Math.min(s.y0, p.L); s.y1 = Math.max(s.y1, p.L + p.H); s.storeys.add(p.storey); s.members.push(p); }
    else strips.push({ alongX: p.alongX, cross: [p.cross], a0: p.a0, a1: p.a1, y0: p.L, y1: p.L + p.H, storeys: new Set([p.storey]), members: [p] });
  }
  // A run on fewer than three storeys is a piece of a strip set a little deeper on those floors (merged into the neighbour of
  // about its width, within 1.2 m across) or a recess front that is not a screen strip (left out, counted).
  let merged = 0, few = 0;
  for (const s of [...strips].sort((u, v) => u.storeys.size - v.storeys.size)) {
    if (s.storeys.size >= 3) continue;
    const cs = (t: typeof s) => t.cross.reduce((a, b) => a + b, 0) / t.cross.length;
    const t = strips.filter((u) => u !== s && u.storeys.size >= 3 && u.alongX === s.alongX && Math.abs(cs(u) - cs(s)) < 1.2 && s.a0 <= u.a1 + 0.3 && s.a1 >= u.a0 - 0.3 && s.a1 - s.a0 <= 1.2 * (u.a1 - u.a0))[0];
    strips.splice(strips.indexOf(s), 1);
    if (t) { t.a0 = Math.min(t.a0, s.a0); t.a1 = Math.max(t.a1, s.a1); t.y0 = Math.min(t.y0, s.y0); t.y1 = Math.max(t.y1, s.y1); s.storeys.forEach((x) => t.storeys.add(x)); merged++; } else {
      few++;
      // a closed recess front left out of the strips is still its wall: stone, as drawn
      for (const m of s.members) if (m.ring) prims.push({ type: "prism", ring: m.ring, y0: m.L, y1: m.L + m.H, material: "stone", tag: `screen-wall:${m.storey}` });
    }
  }
  const built: unknown[] = []; let short = 0;
  for (const s of strips) {
    if (s.a1 - s.a0 < 1.5) { short++; for (const m of s.members) if (m.ring) prims.push({ type: "prism", ring: m.ring, y0: m.L, y1: m.L + m.H, material: "stone", tag: `screen-wall:${m.storey}` }); continue; }
    const c = [...s.cross].sort((a, b) => a - b)[Math.floor(s.cross.length / 2)]!;
    // Which sheet draws this strip, and where along it (model metres) the elevation hatches slats on each storey. The strip's
    // own extent bounds it; on a storey the elevation does not hatch, the recess front stays stone.
    const planCross = s.alongX ? -c * 100 : c * 100;
    const sheet = Object.keys(FACE).find((sh) => sideOf(sh, { line: planCross, hz: s.alongX }));
    const cover = (band: { L: number; H: number }): Array<[number, number]> | null => {
      if (!sheet || elevOffset[sheet] === undefined) return null;
      const fc = FACE[sheet]!, mid = band.L + band.H / 2;
      const xs = elevLouvre.filter((l) => l.sheet === sheet && l.z0 <= mid && l.z1 >= mid).map((l) => { const sPlan = fc.sign * l.x + elevOffset[sheet]!; return s.alongX ? sPlan / 100 : -sPlan / 100; }).sort((a, b) => a - b);
      const out: Array<[number, number]> = [];
      for (const x of xs) { const last = out.at(-1); if (last && x - last[1] <= 0.25) last[1] = x; else out.push([x, x]); }
      // the elevation may reach past the recess the plan draws (by up to 0.3 m on the north strips): it decides, within 0.6 m
      return out.map(([a, b]) => [Math.max(s.a0 - 0.6, a - 0.05), Math.min(s.a1 + 0.6, b + 0.05)] as [number, number]).filter(([a, b]) => b - a >= 0.3);
    };
    const bands = storeys.filter((t) => t.id !== "מרתף" && t.id !== "גג").map((t) => ({ id: t.id, L: t.level, H: t.height }));
    const cov = bands.map((b) => ({ b, iv: cover(b) }));
    const byElevation = cov.some((x) => x.iv !== null) && cov.some((x) => (x.iv?.length ?? 0) > 0);
    const inCov = (iv: Array<[number, number]> | null, a: number) => !!iv && iv.some(([u, v]) => a >= u && a <= v);
    const allIv = cov.flatMap((x) => x.iv ?? []);
    const sa0 = byElevation ? Math.min(s.a0, ...allIv.map((v) => v[0])) : s.a0, sa1 = byElevation ? Math.max(s.a1, ...allIv.map((v) => v[1])) : s.a1;
    for (let a = sa0 + 0.02; a + 0.02 <= sa1; a += 0.12) {
      const ring: Array<[number, number]> = s.alongX ? [[a - 0.02, c - 0.04], [a + 0.02, c - 0.04], [a + 0.02, c + 0.04], [a - 0.02, c + 0.04]] : [[c - 0.04, a - 0.02], [c + 0.04, a - 0.02], [c + 0.04, a + 0.02], [c - 0.04, a + 0.02]];
      if (!byElevation) { prims.push({ type: "prism", ring, y0: s.y0, y1: s.y1, material: "louvre", tag: "louvre-strip" }); continue; }
      // one slat per run of consecutive hatched storeys
      let run: [number, number] | null = null;
      for (const { b, iv } of cov) {
        if (inCov(iv, a)) { run = run ? [run[0], b.L + b.H] : [b.L, b.L + b.H]; continue; }
        if (run) { prims.push({ type: "prism", ring, y0: run[0], y1: run[1], material: "louvre", tag: "louvre-strip" }); run = null; }
      }
      if (run) prims.push({ type: "prism", ring, y0: run[0], y1: run[1], material: "louvre", tag: "louvre-strip" });
    }
    // a recess front the elevation shows as wall on its storey (no hatch there): stone over the part not hatched
    let stoneBack = 0;
    if (byElevation) for (const m of s.members) {
      if (!m.ring) continue;
      const iv = cov.find((x) => x.b.id === m.storey)?.iv ?? [];
      const xs = m.ring.map((q) => q[0]), zs = m.ring.map((q) => q[1]);
      const lo = s.alongX ? Math.min(...xs) : Math.min(...zs), hi = s.alongX ? Math.max(...xs) : Math.max(...zs);
      const gaps: Array<[number, number]> = []; let cur = lo;
      for (const [u, v] of [...iv].sort((p, q) => p[0] - q[0])) { if (u > cur) gaps.push([cur, Math.min(u, hi)]); cur = Math.max(cur, v); if (cur >= hi) break; }
      if (cur < hi) gaps.push([cur, hi]);
      for (const [u, v] of gaps) { if (v - u < 0.05) continue; const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
        const ring: Array<[number, number]> = s.alongX ? [[u, z0], [v, z0], [v, z1], [u, z1]] : [[x0, u], [x1, u], [x1, v], [x0, v]];
        prims.push({ type: "prism", ring, y0: m.L, y1: m.L + m.H, material: "stone", tag: `screen-wall:${m.storey}` }); stoneBack++; }
    }
    // Where the elevation hatches slats on a storey, nothing of that storey's floor stands out past the strip: ד's slab stood 1.2 m
    // out in the north recess with two borrowed side fins, a white band at +12.60 the elevation does not draw. Only slabs and thin
    // fins across the strip (≤ 35 cm along it) standing ≥ 30 cm out, over the strip's own span, are cut back to its line: walls,
    // windows and the stone fronts parallel to it stay (r15 first cut those too, and hid a window and a stone front). Counted.
    let cutBack = 0, cutAway = 0; const openingsOut: string[] = [];
    const held: Array<{ k: { tag?: string }; sid: string; lo: number; hi: number; mid: number }> = [], unheld: typeof held = [], movedBack: string[] = [];
    if (byElevation && sheet) {
      const outS = FACE[sheet]!.far ? 1 : -1, out = s.alongX ? -outS : outS;
      // cut back to where the other storeys' slabs end in this recess (a slab edge just behind the slats still reads white
      // through them), or to the slats' own line when no other slab is there
      type Pr = { type: string; ring?: Array<[number, number]>; y0?: number; y1?: number; tag?: string };
      const fronts = (prims as Pr[]).filter((p) => p.type === "prism" && p.ring && /^slab:/.test(p.tag ?? "")).map((p) => {
        const xs = p.ring!.map((q) => q[0]), zs = p.ring!.map((q) => q[1]);
        const lo = s.alongX ? Math.min(...xs) : Math.min(...zs), hi = s.alongX ? Math.max(...xs) : Math.max(...zs);
        if (hi - lo < 1 || lo > sa1 || hi < sa0) return null;
        return out > 0 ? Math.max(...(s.alongX ? zs : xs)) : Math.min(...(s.alongX ? zs : xs));
      }).filter((v): v is number => v !== null && (out > 0 ? v < c : v > c)).sort((a, b) => a - b);
      const slats = c - out * 0.05, deep = fronts.length >= 3 ? fronts[Math.floor(fronts.length / 2)]! : slats;
      for (let k = prims.length - 1; k >= 0; k--) {
        const p = prims[k] as Pr;
        if (p.type !== "prism" || !p.ring || p.ring.length !== 4 || !/^(slab|screen-wall|balcony-slab|sill|head|pane):/.test(p.tag ?? "")) continue;
        const line = /^slab:/.test(p.tag!) ? deep : slats;
        const sid = p.tag!.split(":")[1]!, band = cov.find((x) => x.b.id === sid);
        if (!band?.iv?.length || p.y0! < band.b.L - 0.3 || p.y1! > band.b.L + band.b.H + 0.05) continue;
        const xs = p.ring.map((q) => q[0]), zs = p.ring.map((q) => q[1]);
        if (new Set(xs.map((v) => v.toFixed(3))).size > 2 || new Set(zs.map((v) => v.toFixed(3))).size > 2) continue; // not axis-aligned
        const lo = s.alongX ? Math.min(...xs) : Math.min(...zs), hi = s.alongX ? Math.max(...xs) : Math.max(...zs);
        if (/^screen-wall:/.test(p.tag!) && hi - lo > 0.35) continue; // a front, not a fin
        if (lo < sa0 - 0.1 || hi > sa1 + 0.1) continue;
        const c0 = s.alongX ? Math.min(...zs) : Math.min(...xs), c1 = s.alongX ? Math.max(...zs) : Math.max(...xs);
        const far = out > 0 ? c1 : -c0, lim = out > 0 ? line : -line;
        if (far <= lim + 0.3) continue;
        const n0 = out > 0 ? c0 : Math.max(c0, line), n1 = out > 0 ? Math.min(c1, line) : c1;
        // a window part wholly out in front of the slats (ד's west window stood 1.2 m out with its fins): gone, named in the report —
        // the elevation draws that storey's window behind the slats, where the plan's wall has none (open: cut it there)
        if (n1 - n0 < 0.02) {
          // a window part stays when a wall still holds it (ג's south window stands in a stone box in front of the slats, as the
          // sheet draws it); it goes only when nothing is left round it
          if (/^(sill|head|pane):/.test(p.tag!)) { held.push({ k: p, sid, lo, hi, mid: (c0 + c1) / 2 }); continue; }
          prims.splice(k, 1); cutAway++; continue;
        }
        if (/^(sill|head|pane):/.test(p.tag!)) continue; // a window part is never cut, only kept or (unheld) taken away
        p.ring = s.alongX ? [[lo, n0], [hi, n0], [hi, n1], [lo, n1]] : [[n0, lo], [n1, lo], [n1, hi], [n0, hi]];
        cutBack++;
      }
      for (const h of held) {
        const holds = (prims as Pr[]).some((q) => q.type === "prism" && q.ring && /^(wall|screen-wall):/.test(q.tag ?? "") && q.tag!.split(":")[1] === h.sid && (() => {
          const xs = q.ring!.map((v) => v[0]), zs = q.ring!.map((v) => v[1]);
          const lo = s.alongX ? Math.min(...xs) : Math.min(...zs), hi = s.alongX ? Math.max(...xs) : Math.max(...zs);
          const c0 = s.alongX ? Math.min(...zs) : Math.min(...xs), c1 = s.alongX ? Math.max(...zs) : Math.max(...xs);
          return c0 <= h.mid + 0.2 && c1 >= h.mid - 0.2 && lo <= h.hi + 0.3 && hi >= h.lo - 0.3;
        })());
        if (holds) continue;
        unheld.push(h);
      }
      // An unheld window is the storey's window behind the slats, where the elevation draws it: moved back into the first wall of
      // its storey behind the slats over its span (its outer face to the wall's), and the wall opened between its sill and head.
      // With no such wall it goes, named. (ד's west window: the plan drew it 1.2 m out, in the front the elevation does not have.)
      const span = (q: Pr) => { const xs = q.ring!.map((v) => v[0]), zs = q.ring!.map((v) => v[1]);
        return { lo: s.alongX ? Math.min(...xs) : Math.min(...zs), hi: s.alongX ? Math.max(...xs) : Math.max(...zs), c0: s.alongX ? Math.min(...zs) : Math.min(...xs), c1: s.alongX ? Math.max(...zs) : Math.max(...xs) }; };
      const groups = new Map<string, typeof unheld>();
      for (const h of unheld) { const key = `${h.sid}|${h.lo.toFixed(1)}|${h.hi.toFixed(1)}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(h); }
      for (const g of groups.values()) {
        const { sid, lo, hi } = g[0]!;
        const parts = g.map((h) => h.k as Pr), outer = Math.max(...parts.map((q) => { const sp = span(q); return out > 0 ? sp.c1 : -sp.c0; }));
        const walls = (prims as Pr[]).filter((q) => q.type === "prism" && q.ring?.length === 4 && q.tag === `wall:${sid}`).map((q) => ({ q, ...span(q) }))
          .filter((w) => w.lo <= lo + 0.02 && w.hi >= hi - 0.02 && (out > 0 ? w.c1 < c - 0.05 : w.c0 > c + 0.05))
          .sort((a, b) => (out > 0 ? b.c1 - a.c1 : a.c0 - b.c0));
        const w = walls[0];
        const sill = parts.find((q) => /^sill:/.test(q.tag!)), head = parts.find((q) => /^head:/.test(q.tag!));
        if (!w || !sill || !head) { for (const q of parts) { prims.splice(prims.indexOf(q as never), 1); cutAway++; openingsOut.push(`${q.tag} (no wall behind the slats)`); } continue; }
        const face = out > 0 ? w.c1 : -w.c0, d = (face - outer) * (out > 0 ? 1 : -1); // move inward by the gap
        for (const q of parts) q.ring = q.ring!.map(([x, z]) => (s.alongX ? [x, z - out * Math.abs(d)] : [x - out * Math.abs(d), z]) as [number, number]);
        // open the wall over the window's span between the sill's top and the head's foot
        const y0 = sill.y1!, y1 = head.y0!, W = w.q, i = prims.indexOf(W as never);
        prims.splice(i, 1);
        const piece = (a: number, b: number, ya: number, yb: number) => { if (b - a < 0.01 || yb - ya < 0.01) return;
          prims.push({ ...W, ring: s.alongX ? [[a, w.c0], [b, w.c0], [b, w.c1], [a, w.c1]] : [[w.c0, a], [w.c1, a], [w.c1, b], [w.c0, b]], y0: ya, y1: yb } as never); };
        // (below and above the window the moved sill and head are the wall: a wall piece there too would share their face)
        piece(w.lo, lo, W.y0!, W.y1!); piece(hi, w.hi, W.y0!, W.y1!); void y0; void y1;
        movedBack.push(`${sid} ${lo.toFixed(2)}..${hi.toFixed(2)} moved ${Math.abs(d).toFixed(2)} m back into its wall`);
      }
    }
    if (openingsOut.length) say(`louvre strip ${sheet} ${c.toFixed(2)}: window parts in front of the slats removed — ${openingsOut.join("; ")}`);
    if (movedBack.length) say(`louvre strip ${sheet} ${c.toFixed(2)}: windows behind the slats — ${movedBack.join("; ")}`);
    built.push({ sheet, byElevation, cutBack, cutAway, openingsOut, movedBack, along: s.alongX ? "x" : "z", at: +c.toFixed(2), from: +s.a0.toFixed(2), to: +s.a1.toFixed(2), width: +(s.a1 - s.a0).toFixed(2), y0: s.y0, y1: s.y1, storeys: [...s.storeys], stoneBack,
      perStorey: byElevation ? cov.filter((x) => x.iv?.length).map((x) => `${x.b.id}: ${x.iv!.map(([u, v]) => `${u.toFixed(2)}–${v.toFixed(2)}`).join(", ")}`) : undefined });
  }
  report.louvreStrips = { built, shortLeftOut: short, mergedFewStoreys: merged, fewStoreysLeftOut: few, panels: screenPanels.length };
  say(`louvre strips: ${built.length} built from ${screenPanels.length} panels; ${merged} merged, ${few} on under 3 storeys and ${short} under 1.5 m left out`);
}
report.storeys = storeyReport;

// The stone boxes ("סוכות" block, layer "line up"): one-storey bays of stone projecting 1.3 m from the façade, stepping up a storey
// each across the face (the elevation hatches them as stone, a window in each front). The plans draw them only as "line up"
// outlines, every storey the same set; the plan reader made a floor under some (on the east one storey under the elevation's
// box, on the west on the box's own storey) and no walls. Rule (3.72): a "line up" outline with at most one storey's floor and no
// room's walls over it is a box; its storey and its bottom/top come from the elevation that faces it — the box's front, a stone
// hatch ("h kayam" AR-B816, 3–3.8 m tall) over the outline's span. No hatch there: not a box (checked on the sheet: the one
// such outline is the west louvre recess). The stray floor goes; the box is built: stone floor, three
// walls 20 cm, roof, and in its front the window of its storey's façade behind it, brought out.
// An outline with floors on 3+ storeys is a stack of balconies (the one above, drawn dashed), already built.
{
  const inRing = (x: number, z: number, r: Array<[number, number]>) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i]!, [xj, zj] = r[j]!; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const outlines = new Map<string, Pt[]>();
  for (const st of storeys) for (const p of st.pieces) {
    if (p.layer !== "line up" || p.type !== "LWPOLYLINE" || !(p as { closed?: boolean }).closed || !p.pts) continue;
    const q = p.pts.map((v) => ({ x: Math.round(v.x - st.origin.x), y: Math.round(v.y - st.origin.y) }));
    const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
    if (q.length < 4 || Math.max(...xs) - Math.min(...xs) < 80 || Math.max(...ys) - Math.min(...ys) < 80) continue;
    outlines.set(`${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`, q);
  }
  const ORDER = STOREYS.map((s) => s.id);
  const boxes: unknown[] = [], skipped: string[] = [];
  let removed = 0;
  // Two passes: an outline with no floor under it at all (the plan reader closed none) takes the storey over its highest built
  // neighbour's (the boxes step a storey each), once those are built.
  const built = new Map<string, string>(), deferred: string[] = [];
  const overlaps = (k1: string, k2: string) => { const [a0, b0, a1, b1] = k1.split(",").map(Number) as number[], [c0, d0, c1, d1] = k2.split(",").map(Number) as number[]; return Math.min(a1!, c1!) - Math.max(a0!, c0!) > 10 && Math.min(b1!, d1!) - Math.max(b0!, d0!) > 10; };
  for (const pass of [1, 2]) for (const [key, q] of outlines) {
    if (pass === 2 && !deferred.includes(key)) continue;
    const [x0, y0, x1, y1] = key.split(",").map(Number) as [number, number, number, number];
    const ring = q.map((v) => [v.x / 100, -v.y / 100] as [number, number]);
    // the storeys with a floor / a wall over the outline's inner part (10 cm in, so a façade wall on its edge does not count)
    const probes: Array<[number, number]> = [];
    for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) probes.push([(x0 + ((x1 - x0) * i) / 4) / 100, -(y0 + ((y1 - y0) * j) / 4) / 100]);
    // (only where no other outline overlaps it: the boxes step, each overlapping its neighbours)
    const others = [...outlines.entries()].filter(([k2]) => k2 !== key).map(([, q2]) => q2.map((v) => [v.x / 100, -v.y / 100] as [number, number]));
    const own = probes.filter(([x, z]) => inRing(x, z, ring) && !others.some((r2) => inRing(x, z, r2)));
    const inside = own.length ? own : probes.filter(([x, z]) => inRing(x, z, ring));
    const hits = (re: RegExp) => new Set(prims.filter((p) => p.type === "prism" && re.test(p.tag ?? "") && inside.some(([x, z]) => inRing(x, z, (p as { ring: Array<[number, number]> }).ring))).map((p) => (p.tag ?? "").split(":")[1]!));
    const floors = hits(/^(slab|balcony-slab):/);
    // a wall counts only over a quarter of the outline's own part (10 cm samples): a fin on its edge (the east face's full-height
    // one by the louvres) is not a room
    const fine: Array<[number, number]> = [];
    for (let x = x0 + 5; x < x1; x += 10) for (let y = y0 + 5; y < y1; y += 10) { const px = x / 100, pz = -y / 100; if (inRing(px, pz, ring) && !others.some((r2) => inRing(px, pz, r2))) fine.push([px, pz]); }
    const walls = new Set([...hits(/^wall:/)].filter((sidW) => { const ws = prims.filter((p) => p.type === "prism" && p.tag === `wall:${sidW}`) as Array<{ ring: Array<[number, number]> }>;
      return fine.filter(([x, z]) => ws.some((w) => inRing(x, z, w.ring))).length > 0.25 * Math.max(1, fine.length); }));
    let f0 = [...floors][0] ?? "";
    if (floors.size > 1 || walls.size) { if (pass === 1) skipped.push(`${key}: floors ${[...floors].join("")} walls ${[...walls].join("")}`); continue; }
    // which side stands on the façade: the one with a wall just behind it (any storey's)
    const sides = [
      { n: "x0", at: (t: number) => [x0 - 15, y0 + t * (y1 - y0)] }, { n: "x1", at: (t: number) => [x1 + 15, y0 + t * (y1 - y0)] },
      { n: "y0", at: (t: number) => [x0 + t * (x1 - x0), y0 - 15] }, { n: "y1", at: (t: number) => [x0 + t * (x1 - x0), y1 + 15] },
    ];
    const anyWall = prims.filter((p) => p.type === "prism" && /^(wall|sill|head|pane):/.test(p.tag ?? "")) as Array<{ ring: Array<[number, number]> }>;
    const score = (sd: (typeof sides)[number]) => [0.2, 0.5, 0.8].filter((t) => { const [x, y] = sd.at(t) as [number, number]; return anyWall.some((w) => inRing(x / 100, -y / 100, w.ring)); }).length;
    // the elevation facing a side: its stone box hatch over the outline's span along that side
    type Hit = { sid: string; base: number; top: number; sheet: string; overlap: number };
    const elevFor = (n: string): Hit | null => {
      const ax = n === "y0" || n === "y1";
      const sheet = Object.keys(FACE).find((sh) => sideOf(sh, { line: ax ? (n === "y0" ? y0 : y1) : n === "x0" ? x0 : x1, hz: ax }));
      if (!sheet || elevOffset[sheet] === undefined) return null;
      const span: [number, number] = ax ? [x0, x1] : [y0, y1];
      let best: Hit | null = null;
      for (const h of elevBoxes.filter((b) => b.sheet === sheet && b.z1 - b.z0 >= 3 && b.z1 - b.z0 <= 3.8)) {
        const u = FACE[sheet]!.sign * h.xa + elevOffset[sheet]!, v = FACE[sheet]!.sign * h.xb + elevOffset[sheet]!;
        const ov = Math.min(span[1], Math.max(u, v)) - Math.max(span[0], Math.min(u, v));
        // the hatch and the outline agree in width (within 30%) and overlap over 60% of it
        if (ov < 0.6 * Math.max(span[1] - span[0], Math.abs(v - u)) || (best && ov <= best.overlap)) continue;
        const lv = STOREYS.filter((t) => t.id !== "גג").sort((p1, p2) => Math.abs(p1.level - (h.z0 + 0.35)) - Math.abs(p2.level - (h.z0 + 0.35)))[0]!;
        best = { sid: lv.id, base: h.z0, top: h.z1, sheet, overlap: ov };
      }
      return best;
    };
    const cands = sides.map((sd) => ({ sd, k: score(sd), e: null as Hit | null })).filter((c) => c.k > 0);
    if (!cands.length) { skipped.push(`${key}: no façade behind it`); continue; }
    for (const c of cands) c.e = elevFor(c.sd.n);
    const pick = cands.filter((c) => c.e).sort((p1, p2) => p2.e!.overlap - p1.e!.overlap)[0] ?? cands.sort((p1, p2) => p2.k - p1.k)[0]!;
    const fb = pick.sd.n, alongX = fb === "y0" || fb === "y1";
    const fromElev = pick.e;
    // No stone hatch on the elevation that faces it: not a box (412–607 × 173–586 is the west louvre recess, the louvres run ק–ו
    // through it on "חזית צפונית"; built from its neighbour it hid them at ב). Listed, not built.
    if (!fromElev) { skipped.push(`${key}: no stone box on the elevation facing it — not a box`); continue; }
    if (fromElev) { /* the elevation decides */ }
    else if (pass === 2) { const nb = [...built].filter(([k2]) => overlaps(key, k2)).map(([, v]) => ORDER.indexOf(v as never)); if (!nb.length) { skipped.push(`${key}: no floor and no built neighbour`); continue; } f0 = ORDER[Math.max(...nb)]!; }
    const sid = fromElev ? fromElev.sid : ORDER[ORDER.indexOf(f0 as never) + 1];
    const S = STOREYS.find((s) => s.id === sid); if (!S) { skipped.push(`${key}: no storey over ${f0}`); continue; }
    // the stray floor: slab pieces of that storey wholly inside the outline (5 cm slack)
    for (let i = prims.length - 1; i >= 0; i--) { const p = prims[i]!; if (p.type !== "prism" || !/^(slab|balcony-slab):/.test(p.tag ?? "") || (p.tag ?? "").split(":")[1] !== f0 || !f0) continue;
      const r = (p as { ring: Array<[number, number]> }).ring; if (r.every(([x, z]) => x * 100 >= x0 - 5 && x * 100 <= x1 + 5 && -z * 100 >= y0 - 5 && -z * 100 <= y1 + 5)) { prims.splice(i, 1); removed++; } }
    const wallsOf = prims.filter((p) => p.type === "prism" && /^(wall|sill|head|pane):/.test(p.tag ?? "") && (p.tag ?? "").split(":")[1] === sid) as Array<{ ring: Array<[number, number]>; y0: number; y1: number; tag?: string }>;
    const T = 20, base = fromElev ? Math.min(S.level - 0.1, fromElev.base) : S.level - 0.25, top = fromElev ? fromElev.top : S.level + S.height;
    const R = (a: number, b: number, c: number, d: number) => [[a / 100, -c / 100], [b / 100, -c / 100], [b / 100, -d / 100], [a / 100, -d / 100]] as Array<[number, number]>;
    const tag = `box:${sid}`;
    prims.push({ type: "prism", ring: R(x0, x1, y0, y1), y0: base, y1: S.level, material: "stone", tag });
    prims.push({ type: "prism", ring: R(x0, x1, y0, y1), y0: top - 0.25, y1: top, material: "stone", tag });
    // the two side walls (across the façade) and the front
    const sideWalls = alongX ? [R(x0, x0 + T, y0, y1), R(x1 - T, x1, y0, y1)] : [R(x0, x1, y0, y0 + T), R(x0, x1, y1 - T, y1)];
    for (const r of sideWalls) prims.push({ type: "prism", ring: r, y0: S.level, y1: top - 0.25, material: "stone", tag });
    // the front, with the façade's windows of this storey that stand behind it, brought out
    const a0 = alongX ? x0 + T : y0 + T, a1 = alongX ? x1 - T : y1 - T;
    const front = fb === "x0" ? [x1 - T, x1] : fb === "x1" ? [x0, x0 + T] : fb === "y0" ? [y1 - T, y1] : [y0, y0 + T];
    const panes = wallsOf.filter((w) => /^pane:/.test(w.tag ?? "")).map((w) => { const xs = w.ring.map((v) => v[0] * 100), ys = w.ring.map((v) => -v[1] * 100);
      return { s0: Math.max(a0, alongX ? Math.min(...xs) : Math.min(...ys)), s1: Math.min(a1, alongX ? Math.max(...xs) : Math.max(...ys)), c: alongX ? (Math.min(...ys) + Math.max(...ys)) / 2 : (Math.min(...xs) + Math.max(...xs)) / 2, y0: w.y0, y1: w.y1 }; })
      .filter((w) => w.s1 - w.s0 > 30 && Math.abs(w.c - (fb === "x0" ? x0 : fb === "x1" ? x1 : fb === "y0" ? y0 : y1)) < 60).sort((a, b) => a.s0 - b.s0);
    // the elevation draws the box's own window in its front: those openings, when it draws any, decide
    if (fromElev) {
      const fc = FACE[fromElev.sheet]!, ex0 = ELEVS.find((e) => e.sheet === fromElev.sheet)!.x0, c = elevOffset[fromElev.sheet]!;
      const own = elevAll.filter((o) => o.sheet === fromElev.sheet && o.z0 + LINE_SHIFT >= base - 0.05 && o.z1 + LINE_SHIFT <= top + 0.05)
        .map((o) => { const u = fc.sign * (o.x0 - ex0) + c, v = fc.sign * (o.x1 - ex0) + c; return { s0: Math.max(a0, Math.min(u, v)), s1: Math.min(a1, Math.max(u, v)), c: 0, y0: o.z0 + LINE_SHIFT, y1: o.z1 + LINE_SHIFT }; })
        .filter((w) => w.s1 - w.s0 > 30).sort((p1, p2) => p1.s0 - p2.s0);
      if (own.length) { panes.length = 0; panes.push(...own); }
    }
    const FR = (s0: number, s1: number) => (alongX ? R(s0, s1, front[0]!, front[1]!) : R(front[0]!, front[1]!, s0, s1));
    let s = a0;
    for (const w of panes) {
      if (w.s0 > s) prims.push({ type: "prism", ring: FR(s, w.s0), y0: S.level, y1: top - 0.25, material: "stone", tag });
      prims.push({ type: "prism", ring: FR(w.s0, w.s1), y0: S.level, y1: w.y0, material: "stone", tag });
      prims.push({ type: "prism", ring: FR(w.s0, w.s1), y0: w.y1, y1: top - 0.25, material: "stone", tag });
      const mid = (front[0]! + front[1]!) / 2;
      const pr = alongX ? R(w.s0, w.s1, mid - 1.5, mid + 1.5) : R(mid - 1.5, mid + 1.5, w.s0, w.s1);
      prims.push({ type: "prism", ring: pr, y0: w.y0, y1: w.y1, material: "glass", tag: `pane:${sid}:box` });
      s = w.s1;
    }
    if (s < a1) prims.push({ type: "prism", ring: FR(s, a1), y0: S.level, y1: top - 0.25, material: "stone", tag });
    boxes.push({ outline: key, storey: sid, planFloor: f0 || "none", from: fromElev ? `elevation ${fromElev.sheet} ${base.toFixed(2)}–${top.toFixed(2)}` : pass === 2 ? "its neighbour" : "plan floor + 1", facade: fb, windows: panes.length }); built.set(key, sid!);
  }
  report.stoneBoxes = { boxes, skipped, strayFloorsRemoved: removed, rule: "3.72" };
  say(`stone boxes ("line up"): ${boxes.length} built (${boxes.map((b) => `${(b as { storey: string }).storey}·${(b as { windows: number }).windows}w`).join(" ")}), ${removed} stray floor pieces removed; skipped ${skipped.length}: ${skipped.join("; ")}`);
}

// The ground: a 25 cm grid over the plot and 12 m round it.
{
  const xs0 = site.plot.map((q) => q.x), ys0 = site.plot.map((q) => q.y);
  // (40 m round, not 20: the street views stand across the streets, and their ground must be the survey's, not the void past it)
  // (its size a whole number of the far ground's 1 m cells, so the far ground's vertices meet its edge: 2026-11-10)
  const FAR = 100;
  const gx0 = Math.min(...xs0) - 4000, gy1 = Math.max(...ys0) + 4000;
  const gx1 = gx0 + Math.ceil((Math.max(...xs0) + 4000 - gx0) / FAR) * FAR, gy0 = gy1 - Math.ceil((gy1 - (Math.min(...ys0) - 4000)) / FAR) * FAR;
  const dx = 25, nx = Math.ceil((gx1 - gx0) / dx) + 1, nz = Math.ceil((gy1 - gy0) / dx) + 1;
  // terrain grid: x along +x, z along +z = −y, so row r is y = gy1 − r·dx
  // Ground in front of a slope-storey window the elevation shows stays at that storey's floor up to 2.5 m out: the elevations draw
  // these windows clear over the −3.00 yard. Where the survey/yard reading put higher ground there (a ground-storey walk over the
  // yard), it is built as a 35 cm stone slab at its level instead of a fill. Counted.
  const lowered = new Map<number, { lo: number; hi: number; x0: number; x1: number; y0: number; y1: number; n: number }>();
  const groundAt = (p: Pt) => {
    const h = site.ground(p);
    for (const [i, o] of shownLow.entries()) {
      if (o.storey !== "שיפוע") continue;
      const along = o.hz ? p.x : p.y, out = ((o.hz ? p.y : p.x) - o.cross) * o.out;
      if (along < o.s0 - 30 || along > o.s1 + 30 || out < 0 || out > 250 || h <= o.sill) continue;
      const v = lowered.get(i) ?? { lo: o.floor, hi: -99, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, n: 0 };
      v.hi = Math.max(v.hi, h); v.x0 = Math.min(v.x0, p.x); v.x1 = Math.max(v.x1, p.x); v.y0 = Math.min(v.y0, p.y); v.y1 = Math.max(v.y1, p.y); v.n++; lowered.set(i, v);
      return o.floor;
    }
    return h;
  };
  const heights: number[] = [];
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) heights.push(+groundAt({ x: gx0 + c * dx, y: gy1 - r * dx }).toFixed(3));
  for (const [i, v] of lowered) {
    const o = shownLow[i]!;
    // a walk at the ground storey's level (over the window head) stays as a slab; a lesser rise of the yard is just ground
    const walk = v.hi - v.lo >= 2.5;
    if (walk) prims.push({ type: "prism", ring: [[v.x0 / 100, -v.y0 / 100], [v.x1 / 100, -v.y0 / 100], [v.x1 / 100, -v.y1 / 100], [v.x0 / 100, -v.y1 / 100]], y0: v.hi - 0.35, y1: v.hi, material: "stone", tag: "yard-walk-slab" });
    say(`ground before the ${o.storey} window ${o.s0}-${o.s1}: ${v.n} points lowered from up to ${v.hi.toFixed(2)} to ${v.lo}${walk ? `; a walk slab kept at ${v.hi.toFixed(2)}` : ""}`);
  }
  report.groundLoweredBeforeWindows = [...lowered].map(([i, v]) => ({ window: `${shownLow[i]!.storey} ${shownLow[i]!.s0}-${shownLow[i]!.s1}`, points: v.n, from: v.hi, to: v.lo }));
  prims.push({ type: "terrain", x0: gx0 / 100, z0: -gy1 / 100, dx: dx / 100, nx, nz, heights, material: "soil", tag: "ground" });
  // The far ground (2026-11-10, "complete the road, not cut off"): past the fine grid's 40 m the views showed the renderer's grey
  // disk 3 m down, and the roads ended in it. A 1 m grid out to 300 m round the plot (4 m cells rose over the 13 m street between their vertices and hid the asphalt): the survey's TIN (level with its hull past
  // it), the streets flattened in it as in the fine grid. Inside the fine grid it lies 0.5 m under it (hidden); on the fine grid's
  // edge it takes the fine grid's height, so the two meet. Tagged "far:" — never cut in a section.
  const FM = 30000, fx0 = gx0 - Math.ceil(FM / FAR) * FAR, fy1 = gy1 + Math.ceil(FM / FAR) * FAR;
  const fnx = Math.round((gx1 + Math.ceil(FM / FAR) * FAR - fx0) / FAR) + 1, fnz = Math.round((fy1 - (gy0 - Math.ceil(FM / FAR) * FAR)) / FAR) + 1;
  const farH: number[] = [];
  for (let r = 0; r < fnz; r++) for (let c = 0; c < fnx; c++) farH.push(+site.ground({ x: fx0 + c * FAR, y: fy1 - r * FAR }).toFixed(3));
  for (const t of site.trees) prims.push({ type: "tree", at: { x: t.at.x / 100, y: site.ground(t.at), z: -t.at.y / 100 }, height: 6, crown: 4, tag: `tree:survey:${t.name}` });
  say(`ground ${nx}×${nz}, ${site.trees.length} survey trees`);
  // Survey objects outside the plot that stand on the ground (inside it the survey is the existing building, to go): the manhole
  // "ת.ב." (M4804_E, its lid drawn as hatch lines in a 35 cm square) and the planting "צמחיה" (M2802). The survey's other lines
  // outside the plot (M2417 north-east, M2412 east, layer 55 along the street east of the plot) carry no name and no height: their
  // meaning is not known, so they are listed, not built.
  {
    const SV = storeys.find((s) => s.id === "שיפוע")!;
    const out: string[] = [];
    for (const p of SV.pieces) {
      if (p.type !== "INSERT" || !p.at) continue;
      const at = { x: p.at.x - SV.origin.x, y: p.at.y - SV.origin.y };
      if (site.inPlot(at)) continue;
      const g0 = site.ground(at), sq = (h: number) => [[at.x / 100 - h, -at.y / 100 - h], [at.x / 100 + h, -at.y / 100 - h], [at.x / 100 + h, -at.y / 100 + h], [at.x / 100 - h, -at.y / 100 + h]] as Array<[number, number]>;
      if (p.insert === "M4804_E") { prims.push({ type: "prism", ring: sq(0.3), y0: g0 - 0.1, y1: g0 + 0.03, material: "concrete", tag: "survey:manhole" }); out.push(`manhole ${Math.round(at.x)},${Math.round(at.y)}`); }
      if (p.insert === "M2802") { prims.push({ type: "tree", at: { x: at.x / 100, y: g0, z: -at.y / 100 }, height: 1.2, crown: 1.6, tag: "survey:planting" }); out.push(`planting ${Math.round(at.x)},${Math.round(at.y)}`); }
    }
    report.surveyOutsidePlot = { built: out, notBuilt: ["M2417 (north-east, 5 vertices)", "M2412 (east, 2 lines)", "55 (line along the street east of the plot)"], why: "no name, no height, meaning unknown" };
    say(`survey outside the plot: ${out.join(", ") || "none"}; M2417/M2412/55 listed, not built (no name or height)`);
  }

  // The streets the ground tab names on the plot line ("גבול מגרש-רח' ברויאר", "…רח' תורה ועבודה"): each label is written along
  // its edge (its rotation is the edge's direction). The sheet and the survey draw no kerb or road edge (the survey's lines are the
  // existing building, its windows and wells, a concrete strip and two street fragments), so the section is ASSUMED: a 3 m
  // pavement 15 cm over the road, a 7 m road with a dashed centre line, a 3 m pavement opposite, 15 m past each end of the edge.
  // Each 1 m piece sits on the survey ground there. Reported as assumed.
  const K = storeys.find((s) => s.id === "ק")!;
  const plot = site.plot, cxp = plot.reduce((s, q) => s + q.x, 0) / plot.length, cyp = plot.reduce((s, q) => s + q.y, 0) / plot.length;
  const streets: unknown[] = [];
  // per street: its far-grid flattening (run once the far ground's base is set) and its level at a point (for the town between)
  const farFlatten: Array<() => void> = [], townFrom: Array<(p: Pt) => { h: number; d: number }> = [];
  for (const p of K.pieces) {
    const m = p.text?.match(/גבול מגרש-רח'\s*(.+)$/); if (!m || !p.at) continue;
    const at = { x: p.at.x - K.origin.x, y: p.at.y - K.origin.y }, rot = ((((p as { rotation?: number }).rotation ?? 0) % 180) + 180) % 180;
    let best: { a: Pt; b: Pt; score: number } | null = null;
    for (let i = 0; i < plot.length; i++) { const a = plot[i]!, b = plot[(i + 1) % plot.length]!; if (Math.hypot(b.x - a.x, b.y - a.y) < 100) continue;
      const ang = ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI % 180 + 180) % 180, dAng = Math.min(Math.abs(ang - rot), 180 - Math.abs(ang - rot));
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
      const dist = Math.hypot(at.x - (a.x + t * (b.x - a.x)), at.y - (a.y + t * (b.y - a.y)));
      const score = dAng * 20 + dist; if (dAng < 10 && (!best || score < best.score)) best = { a, b, score }; }
    if (!best) { say(`street "${m[1]}": no plot edge along its label — not built`); continue; }
    const { a, b } = best, L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    let nx2 = -uy, ny2 = ux; if ((cxp - a.x) * nx2 + (cyp - a.y) * ny2 > 0) { nx2 = -nx2; ny2 = -ny2; } // outward
    const P = (s: number, o: number) => ({ x: a.x + ux * s + nx2 * o, y: a.y + uy * s + ny2 * o });
    // The road's level along it: a straight fit of the survey ground over the road's middle (a street is one even slope, not the
    // TIN's bumps), and the ground grid inside the street flattened to it, so the road neither sinks nor floats.
    // fitted over the edge and 15 m past its ends; built 100 m past them (2026-11-10: the road ran out inside the views' frame)
    const S0 = -1500, S1 = L + 1500, B0 = -10000, B1 = L + 10000, samp: Array<[number, number]> = [];
    // (fitted on the near pavement, where the survey and the sheet's street marks stand, the road 15 cm under it)
    for (let s = S0; s <= S1; s += 100) samp.push([s, site.ground(P(s, 150)) - 0.15]);
    // Better than the TIN between them: the survey's own spots and the sheet's street marks that stand in the street (a pavement
    // spot is the road + 0.15). Two spread along it give the slope; one only lifts the TIN's fit to it.
    const inStreet = site.spots.filter((q) => { if (site.inPlot(q.at)) return false; const s = (q.at.x - a.x) * ux + (q.at.y - a.y) * uy, o = (q.at.x - a.x) * nx2 + (q.at.y - a.y) * ny2;
      return s >= S0 && s <= S1 && o >= -50 && o <= 1400; }).map((q) => { const s = (q.at.x - a.x) * ux + (q.at.y - a.y) * uy, o = (q.at.x - a.x) * nx2 + (q.at.y - a.y) * ny2;
      return [s, q.h - (o < 300 || o > 1000 ? 0.15 : 0)] as [number, number]; })
      // (a spot 1.8 m off the others' median is a pit or a ramp's foot, not the street: the Breuer car ramp ends at −4.59)
      .filter((v, _i, all) => { const hs = all.map((w) => w[1]).sort((x, y) => x - y), med = hs[Math.floor(hs.length / 2)]!; return all.length < 3 || Math.abs(v[1] - med) < 1.8; });
    const spread = inStreet.length ? Math.max(...inStreet.map((v) => v[0])) - Math.min(...inStreet.map((v) => v[0])) : 0;
    const fit = (pts: Array<[number, number]>) => { const ms = pts.reduce((t, v) => t + v[0], 0) / pts.length, mh = pts.reduce((t, v) => t + v[1], 0) / pts.length;
      const k = pts.reduce((t, v) => t + (v[0] - ms) * (v[1] - mh), 0) / Math.max(1, pts.reduce((t, v) => t + (v[0] - ms) ** 2, 0)); return { ms, mh, k }; };
    let { ms, mh, k } = fit(inStreet.length >= 2 && spread > 500 ? inStreet : samp);
    if (inStreet.length && !(inStreet.length >= 2 && spread > 500)) mh += inStreet.reduce((t, v) => t + v[1] - (mh + k * (v[0] - ms)), 0) / inStreet.length;
    k = Math.max(-0.08, Math.min(0.08, k)); // (a street, not a ramp)
    // past the fitted stretch the street flattens to at most 2% (Torah ve'Avoda's 6% held 100 m on would climb 6 m into the haze
    // where no spot says so; the built-up town round it is flat)
    const kFar = Math.sign(k) * Math.min(Math.abs(k), 0.02);
    const level = (s: number) => { const c = Math.max(S0, Math.min(S1, s)); return mh + k * (c - ms) + kFar * (s - c); };
    say(`street "${m[1]}": ${inStreet.length} spots in it (${inStreet.map((v) => `${(v[0] / 100).toFixed(1)} m:${v[1].toFixed(2)}`).join(", ")})`);
    let flattened = 0;
    // (the far grid's cells straddle the kerb: under the street it is held 30 cm down, one cell past the far pavement included)
    const flatten = (H: number[], X0: number, Y1: number, D: number, NX: number, NZ: number, dip = 0.05, under = 1300) => { for (let r = 0; r < NZ; r++) for (let c = 0; c < NX; c++) {
      const gp = { x: X0 + c * D, y: Y1 - r * D }, s = (gp.x - a.x) * ux + (gp.y - a.y) * uy, o = (gp.x - a.x) * nx2 + (gp.y - a.y) * ny2;
      if (s < B0 - 1200 || s > B1 + 1200 || o < 20 || o > 4800) continue; // not over the plot line itself
      // under the road and its pavements: the road's level; past the far pavement (where the views stand, and the survey has no
      // spot) the far pavement's level out to 36 m, then back to the survey's ground over 12 m. Past the street's ends likewise.
      const flat = o <= under ? level(s) - dip : level(s) + 0.1;
      const ww = Math.max(Math.max(0, Math.min(1, (o - 3600) / 1200)), Math.max(0, Math.min(1, Math.max((B0 - s) / 1200, (s - B1) / 1200))));
      const sm = ww * ww * (3 - 2 * ww), i = r * NX + c;
      H[i] = +(flat * (1 - sm) + H[i]! * sm).toFixed(3); flattened++;
    } };
    flatten(heights, gx0, gy1, dx, nx, nz); farFlatten.push(() => flatten(farH, fx0, fy1, FAR, fnx, fnz, 0.3, 1300 + FAR));
    townFrom.push((p) => { const s2 = (p.x - a.x) * ux + (p.y - a.y) * uy, o = (p.x - a.x) * nx2 + (p.y - a.y) * ny2; return { h: level(Math.max(B0, Math.min(B1, s2))) + 0.1, d: Math.abs(o - 650) }; });
    const bands: Array<[number, number, string, number]> = [[0, 300, "paving", 0.15], [300, 1000, "asphalt", 0], [1000, 1300, "paving", 0.15]];
    let pieces = 0;
    // 50 cm pieces: on a 6% street a flat piece steps 3 cm, not the 12 cm of a 2 m piece (g9 showed the steps as stripes)
    for (let s = B0; s < B1; s += 50) {
      for (const [o0, o1, mat, up] of bands) {
        const q = [P(s, o0), P(s + 50, o0), P(s + 50, o1), P(s, o1)], lvl = level(s + 25) + up;
        prims.push({ type: "prism", ring: q.map((v) => [v.x / 100, -v.y / 100] as [number, number]), y0: lvl - 0.4, y1: lvl, material: mat, tag: `street:${m[1]}` }); pieces++;
      }
      // a dashed centre line: 1 m of paint every 2 m, 12 cm wide
      if (Math.round(s / 50) % 4 > 1) continue;
      const d = [P(s, 644), P(s + 50, 644), P(s + 50, 656), P(s, 656)], lvl = level(s + 25);
      prims.push({ type: "prism", ring: d.map((v) => [v.x / 100, -v.y / 100] as [number, number]), y0: lvl, y1: lvl + 0.006, material: "parkingLine", tag: `street:${m[1]}:line` });
    }
    // Cars, no people (2026-11-10, the user: "add cars without figures"). Parked along both kerbs every 6.5 m with gaps, and two
    // driving in the lanes; none in front of the plot edge's near kerb (its gate and ramp) and none within 4 m of its ends.
    // Scenery, not the sheet's: tagged "street-car:", and reported as added.
    const COL = [0xb8bec6, 0x2c3036, 0xf1f1ee, 0x22364f, 0x6b6f75, 0x8a1f24, 0xd8d4cc, 0x3c4a3a];
    const dirAt = (sgn: number) => Math.atan2(ux * sgn, -uy * sgn); // three's rotY: local +z → (sin, cos) in model (x, z = −y)
    // right-hand traffic: on the near (plot) side the cars face the way that keeps the kerb on their right
    const sN = -uy * nx2 + ux * ny2 > 0 ? 1 : -1;
    let cars = 0; const seed = m[1]!.length * 7;
    const car = (s: number, o: number, sgn: number) => { const q = P(s, o); prims.push({ type: "car", at: { x: q.x / 100, y: level(s), z: -q.y / 100 }, rotY: dirAt(sgn), colour: COL[(cars + seed) % COL.length]!, tag: `street-car:${m[1]}` }); cars++; };
    for (let s = -6000; s < L + 6000; s += 650) {
      const near = s < -400 || s > L + 400, k2 = Math.round(s / 650);
      if (near && (k2 * 5 + seed) % 7 > 1) car(s, 300 + 105, sN);
      if ((s < -200 || s > L + 200 || (k2 + seed) % 3 === 0) && (k2 * 3 + seed) % 5 > 0) car(s + 200, 1000 - 105, -sN);
    }
    car(-1400, 300 + 175, sN); car(L + 2200, 1000 - 175, -sN);
    say(`street "${m[1]}": ${cars} cars (parked on both kerbs, two driving); no people`);
    say(`street "${m[1]}": road ${level(0).toFixed(2)} at the edge's start, ${(k * 100 * 100).toFixed(1)}% along it; ${flattened} ground points flattened under it`);
    streets.push({ name: m[1], edge: [[a.x, a.y], [b.x, b.y]].map(([x, y]) => [+(x! / 100).toFixed(2), +(-y! / 100).toFixed(2)]), lengthM: +(L / 100).toFixed(1), pieces, section: "ASSUMED 3 m pavement +0.15 / 7 m road / 3 m pavement" });
    say(`street "${m[1]}" along the plot edge of ${(L / 100).toFixed(1)} m: ${pieces} pieces (section assumed: the sheet draws none)`);
  }
  report.streets = streets;
  // The far ground's base past the fine grid (2026-11-10): not the survey's hull height held level to the horizon (it stood
  // 2–3 m over the falling streets, banks between them), but the town between the streets — each street's pavement level,
  // weighted by 1/distance² — reached from the fine grid's edge over 20 m.
  {
    const fx1 = gx1, fy0 = gy0;
    for (let r = 0; r < fnz; r++) for (let c = 0; c < fnx; c++) {
      const p = { x: fx0 + c * FAR, y: fy1 - r * FAR };
      const qx = Math.max(gx0, Math.min(fx1, p.x)), qy = Math.max(fy0, Math.min(gy1, p.y)), out = Math.hypot(p.x - qx, p.y - qy);
      if (out <= 0) continue;
      const edge = heights[Math.round((gy1 - qy) / dx) * nx + Math.round((qx - gx0) / dx)]!;
      let wsum = 0, hsum = 0; for (const t of townFrom) { const v = t(p), w = 1 / (v.d * v.d + 1e4); wsum += w; hsum += w * v.h; }
      const town = wsum ? hsum / wsum : edge, w = Math.min(1, out / 2000), sm = w * w * (3 - 2 * w);
      farH[r * fnx + c] = +(edge * (1 - sm) + town * sm).toFixed(3);
    }
    for (const fl of farFlatten) fl();
  }
  // the far ground: under the fine grid hidden, on its edge its height
  const fi0 = Math.round((gx0 - fx0) / FAR), fi1 = Math.round((gx1 - fx0) / FAR), fj0 = Math.round((fy1 - gy1) / FAR), fj1 = Math.round((fy1 - gy0) / FAR), st = FAR / dx;
  for (let r = fj0; r <= fj1; r++) for (let c = fi0; c <= fi1; c++) {
    const fine = heights[(r - fj0) * st * nx + (c - fi0) * st]!, edge = r === fj0 || r === fj1 || c === fi0 || c === fi1;
    farH[r * fnx + c] = +(edge ? fine : fine - 0.5).toFixed(3);
  }
  prims.push({ type: "terrain", x0: fx0 / 100, z0: -fy1 / 100, dx: FAR / 100, nx: fnx, nz: fnz, heights: farH, material: "soil", tag: "far:ground" });
  say(`far ground ${fnx}×${fnz} at 1 m, 300 m round the plot`);
}

// Extent and output
let xs: number[] = [], zs: number[] = [];
// (the streets stand outside the plot: the views frame the building and its site, not the road)
for (const p of prims) if (p.type === "prism" && !/^street:/.test(p.tag ?? "")) for (const [x, z] of p.ring) { xs.push(x); zs.push(z); }
const ext = { x: Math.min(...xs), z: Math.min(...zs), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), yMin: -6.75, yMax: 29 };
// North: the plan's arrow block is turned −24°, so north is 24° east of the sheet's up; model z = −sheet y.
const a = (24 * Math.PI) / 180;
// shadowReachM: the sun's shadow box 90 m round, not the building's 24 m (the street and its cars past it lit apart, a pale patch)
const model = { name: "ברויאר 21", primitives: prims, extent: ext, shadowReachM: 90, north: { x: Math.sin(a), z: -Math.cos(a) }, palette: { limestone: true, courseM: 0.3 } };
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify(model));
const ring: Array<[number, number]> = [[ext.x, ext.z], [ext.x + ext.width, ext.z], [ext.x + ext.width, ext.z + ext.depth], [ext.x, ext.z + ext.depth]];
const floors = storeys.map((s) => ({ id: `floor-${s.id}`, level: s.level, height: s.height, units: [], shift: { x: 0, y: 0 }, outline: ring, roof: s.id === "גג", registration: 1, sheetWidth: 1, sheetHeight: 1 }));
fs.writeFileSync(path.join(out, "state.json"), JSON.stringify({ floors }));
report.siteWallCapped = siteWallCapped;
say(`site walls capped under ground-storey windows the elevations show: ${siteWallCapped.length}`);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
say(`model: ${prims.length} primitives → ${out}`);
