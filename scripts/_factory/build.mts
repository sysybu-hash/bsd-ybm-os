/**
 * Delicatess factory (Kiryat Arba, Gottlieb office) — exterior + rooms model from the plan DXFs and the survey, free (no paid call).
 *   npx tsx --conditions=react-server scripts/_factory/build.mts <dxf dir> <option 1|2> <out dir>
 * Writes model.json + state.json (for scripts/_breuer/view.mts) and report.json: what was read, built, merged, dropped and why.
 *
 * The plan files hold both options side by side: option 1 at the site's own place, option 2 moved by the second AXES xref insert
 * (11118, 16625 cm). Units: cm, Israeli grid. Model: x = (X − O.x)/100, z = −(Y − O.y)/100, y up, metres from the ground floor (±0.00).
 * Heights are NOT on the sheets: ground storey 5.0 m, first storey 4.0 m (approved by the user 2026-11-10), parapet 1.0 m (assumed, reported).
 */
import fs from "node:fs";
import path from "node:path";
import { flattenDxf, readDxfDrawing, apply, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { makeTin } from "../_breuer/tin.mts";

const [dir, optArg, out] = process.argv.slice(2);
if (!dir || !optArg || !out) throw new Error("usage: build.mts <dxf dir> <1|2> <out dir>");
const OPT = Number(optArg) as 1 | 2;
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);

// ---- storey heights (the sheets give none; 5.0 / 4.0 approved by the user, 2026-11-10) ----
const H0 = 5.0; // ground storey, floor to floor
const H1 = 4.0; // first storey
const SLAB = 0.3;
const PARAPET = 1.0;
const ROOM_WALL = 0.15; // insulated panel
const DOOR_H = 2.4;

// ---- frames ----
const SHIFT = OPT === 2 ? { x: 11118, y: 16625 } : { x: 0, y: 0 }; // option 2's AXES insert: subtract to land on the survey
const O = { x: 21200060, y: 60350860 }; // the plot's middle (cm), shared by both options
const REL_X = 21150000; // plan files' x printed relative to this in the dumps
const inOption = (q: Pt) => { const rx = q.x / 100 - REL_X / 100; return OPT === 1 ? rx > 440 && rx < 560 : rx > 580 && rx < 660; };
const M = (q: Pt): [number, number] => [(q.x - SHIFT.x - O.x) / 100, -(q.y - SHIFT.y - O.y) / 100];
const MS = (q: Pt): [number, number] => [(q.x * 100 - O.x) / 100, -(q.y * 100 - O.y) / 100]; // survey: metres ITM

const report: Record<string, unknown> = { option: OPT, approved: { groundStoreyM: H0, firstStoreyM: H1, by: "the user, 2026-11-10" }, assumed: { parapetM: PARAPET, why: "no section, elevation or level mark gives a parapet height" } };
const tally: Record<string, { read: number; built: number; merged: number; dropped: number; why: string[] }> = {};
const T = (k: string) => (tally[k] ??= { read: 0, built: 0, merged: 0, dropped: 0, why: [] });
const prims: Primitive[] = [];

const read = (f: string) => { const d = readDxfDrawing(new Uint8Array(fs.readFileSync(path.join(dir, f))))!; return { d, all: flattenDxf(d) }; };
const ground = read("komat karka_Delicatess-Kiryat Arba.dxf");
const first = read("koma 1_Delicatess-Kiryat Arba.dxf");
const axes = read("AXES_Delicatess-Kiryat Arba.dxf");
const survey = read("668-mgr12-220726.dxf");
say("read 4 files");

// ---- geometry helpers ----
type P2 = [number, number];
const area = (r: P2[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const inside = (p: P2, r: P2[]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i]!, b = r[j]!; if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const ringOf = (pts: Pt[]) => { const r = pts.map(M); const a = r[0]!, b = r[r.length - 1]!; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) r.pop(); return r; };
const box = (centre: [number, number, number], size: [number, number, number], rotY: number, material: BuildingMaterial, tag: string) =>
  prims.push({ type: "box", centre: { x: centre[0], y: centre[1], z: centre[2] }, size: { x: size[0], y: size[1], z: size[2] }, rotY, material, tag });

/** A wall along a→b (its centre line), thickness t, from y0 to y1, with door gaps: each gap at s metres along, w wide, open to DOOR_H. */
type Gap = { s: number; w: number; leaf?: BuildingMaterial; swing?: 1 | -1; /** opening height (default DOOR_H) */ h?: number; /** a sectional (overhead) door: its panel closed in the opening, not a swinging leaf */ roll?: boolean };
/** `floor`: the level the gaps open from (default y0). A wall split in bands (a concrete base, the cladding over it) passes the same
 *  gaps and floor to each band: each band leaves open what of the opening falls in it, and only the band holding the floor draws
 *  the door's leaf (the base band kept the opening shut below 0.9 m, first try 2026-11-10). */
function wall(a: P2, b: P2, t: number, y0: number, y1: number, mat: BuildingMaterial, tag: string, gaps: Gap[] = [], floor = y0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.05) return;
  const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  const rot = -Math.atan2(uz, ux);
  const piece = (s0: number, s1: number, ya: number, yb: number, m: BuildingMaterial, tg: string, th = t) => {
    if (s1 - s0 < 0.01 || yb - ya < 0.01) return;
    const sm = (s0 + s1) / 2;
    box([a[0] + ux * sm, (ya + yb) / 2, a[1] + uz * sm], [s1 - s0, yb - ya, th], rot, m, tg);
  };
  const gs = [...gaps].sort((g, h) => g.s - h.s).filter((g) => g.s - g.w / 2 > 0.05 && g.s + g.w / 2 < L - 0.05);
  const drawLeaf = y0 <= floor + 1e-3 && y1 > floor;
  let s = 0;
  for (const g of gs) {
    piece(s, g.s - g.w / 2, y0, y1, mat, tag);
    const gh = g.h ?? DOOR_H;
    piece(g.s - g.w / 2, g.s + g.w / 2, y0, Math.min(y1, floor), mat, `${tag}:under-door`);
    piece(g.s - g.w / 2, g.s + g.w / 2, Math.max(y0, floor + gh), y1, mat, `${tag}:lintel`);
    if (!drawLeaf) { s = g.s + g.w / 2; continue; }
    const fy = floor;
    if (g.roll) {
      // a sectional door: the panel in the opening, with its slats as dark bands
      piece(g.s - g.w / 2, g.s + g.w / 2, fy, fy + gh, g.leaf ?? "metal", `${tag}:truck-door`, 0.08);
      for (let k = 1; k < 6; k++) piece(g.s - g.w / 2, g.s + g.w / 2, fy + (gh * k) / 6 - 0.02, fy + (gh * k) / 6 + 0.02, "darkSteel", `${tag}:truck-door`, 0.1);
      s = g.s + g.w / 2;
      continue;
    }
    // the leaf stands open, square to the wall, on the side it swings to (a plan reads a door by its open leaf);
    // a wide door (≥ 1.6 m) is a pair, one leaf on each jamb
    const sw = g.swing ?? 1, nx = -uz * sw, nz = ux * sw;
    const leaves = g.w >= 1.6 ? [{ at: g.s - g.w / 2, L: g.w / 2 }, { at: g.s + g.w / 2, L: g.w / 2 }] : [{ at: g.s - g.w / 2, L: g.w }];
    for (const lf of leaves) {
      const hx = a[0] + ux * lf.at, hz = a[1] + uz * lf.at;
      box([hx + nx * (t / 2 + lf.L / 2), fy + DOOR_H / 2, hz + nz * (t / 2 + lf.L / 2)], [lf.L, DOOR_H - 0.02, 0.05], -Math.atan2(nz, nx), g.leaf ?? "frame", `${tag}:door`);
    }
    s = g.s + g.w / 2;
  }
  piece(s, L, y0, y1, mat, tag);
}
const segs = (r: P2[], closed: boolean) => { const o: Array<[P2, P2]> = []; for (let i = 0; i < r.length - (closed ? 0 : 1); i++) o.push([r[i]!, r[(i + 1) % r.length]!]); return o; };
const projOn = (p: P2, a: P2, b: P2) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1; const s = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2; const q: P2 = [a[0] + s * dx, a[1] + s * dz]; return { s: s * Math.sqrt(L2), d: Math.hypot(p[0] - q[0], p[1] - q[1]), inSeg: s >= 0 && s <= 1 }; };

// block extents (lines of the block), for inserts
const blockRings = new Map<string, Pt[][]>();
function insertRings(d: DxfDrawing, p: DxfPiece): Pt[][] {
  const blk = d.blocks.get(p.insert!);
  if (!blk || !p.m) return [];
  if (!blockRings.has(p.insert!)) blockRings.set(p.insert!, flattenDxf(d, blk.entities).filter((q) => q.pts && q.pts.length >= 4).map((q) => q.pts!.map((v) => ({ x: v.x, y: v.y }))));
  return blockRings.get(p.insert!)!.map((r) => r.map((v) => apply(p.m!, v)));
}

// ---- the survey: ground ----
const spots: Array<{ at: Pt; h: number }> = [];
const notGround: Record<string, number> = {};
const trees: P2[] = [];
for (const p of survey.all) {
  if (p.type !== "INSERT" || !p.at || p.path.length) continue;
  if (p.insert === "M1502_P") {
    const h = Number(p.attribs?.find((a) => a.tag === "HEIGHT")?.text);
    T("survey spot").read++;
    if (p.layer !== "M1502" || !Number.isFinite(h)) { notGround[p.layer] = (notGround[p.layer] ?? 0) + 1; T("survey spot").dropped++; continue; }
    const [x, z] = MS(p.at);
    spots.push({ at: { x, y: z }, h });
    T("survey spot").built++;
  } else if (p.insert === "M2801_E") { trees.push(MS(p.at)); T("survey tree").read++; }
}
T("survey spot").why.push(`spots on layers ${JSON.stringify(notGround)} are not the ground layer M1502: not used for the ground — they are the wall tops (M2651), roof and floor levels (M2221, M2220) the site features below are built to`);
const tin = makeTin(spots);
const absAt = (x: number, z: number) => tin({ x, y: z });
const contours = survey.all.filter((p) => /^C-TOPO/.test(p.layer) && p.pts).length;
T("survey contour").read = contours; T("survey contour").dropped = contours;
T("survey contour").why.push("the polylines carry no height of their own (only nearby labels); the ground is the 136 spot heights, the contours were drawn from them");

// ---- the plan pieces of this option ----
const top = (all: DxfPiece[]) => all.filter((p) => p.path.length === 0);
const anchor = (p: DxfPiece) => p.at ?? p.pts?.[0] ?? p.rings?.[0]?.[0];
const mine = (all: DxfPiece[]) => top(all).filter((p) => { const a = anchor(p); return !!a && inOption(a); });
const G = mine(ground.all), F = mine(first.all);

// shell: the 00-WL closed polylines, outer + inner face; the biggest pair is the storey's shell
type Shell = { mid: P2[]; outer: P2[]; t: number };
function shellOf(pcs: DxfPiece[], tag: string): { shell: Shell; extra: P2[][] } {
  const rs = pcs.filter((p) => p.layer === "00-WL" && p.pts && p.closed && p.pts.length >= 4).map((p) => ringOf(p.pts!)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  T(`${tag} shell polyline`).read += rs.length;
  const [outer, inner, ...extra] = rs;
  if (!outer || !inner) throw new Error(`${tag}: no shell pair`);
  let mid: P2[] = outer, t = 0.35;
  if (inner.length === outer.length) {
    mid = outer.map((p, i) => [(p[0] + inner[i]![0]) / 2, (p[1] + inner[i]![1]) / 2] as P2);
    // the band between the faces: its area over the centre line's length
    const per = segs(mid, true).reduce((a, [p, q]) => a + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
    t = Math.max(0.2, Math.min(0.6, (Math.abs(area(outer)) - Math.abs(area(inner))) / per));
    T(`${tag} shell polyline`).merged += 2;
  } else { T(`${tag} shell polyline`).why.push("faces differ in vertex count: outer face inset by half the wall"); }
  T(`${tag} shell polyline`).built += 2;
  return { shell: { mid, outer, t }, extra };
}
const gShell = shellOf(G, "ground");
const fShell = shellOf(F, "first");
report.shell = { groundAreaM2: Math.abs(area(gShell.shell.outer)).toFixed(1), firstAreaM2: Math.abs(area(fShell.shell.outer)).toFixed(1), wallT: gShell.shell.t.toFixed(2) };

// ---- the truck route the sheets draw (read 2026-11-10, the user: "check where the entrances, exits, the route are") ----
// The sand hatch (00-hatch, AR-SAND) is the trucks' road. Option 1: the ground sheet hatches only the strip along the south-west
// side, from "כניסת משאיות"; the first-floor sheet hatches that strip AND its run on round the south corner, along the east beside
// the terrace and out to "יציאת משאיות" on the north road; the ground sheet draws that east / north run dashed (00-HIDDEN: over
// the cut). So the strip climbs (a ramp both sheets cut through), the east run is at the first floor, and the north run comes back
// down to the road. Thin triangles along each run (layer 0, 00-HIDDEN) are its direction of travel. Option 2: the ground sheet's
// hatch is the truck yard in front of the north-west wall, at the ground.
const dedupe = (r: P2[]) => { const o = r.filter((p, i) => i === 0 || Math.hypot(p[0] - r[i - 1]![0], p[1] - r[i - 1]![1]) > 0.01); while (o.length > 2 && Math.hypot(o[0]![0] - o[o.length - 1]![0], o[0]![1] - o[o.length - 1]![1]) < 0.01) o.pop(); return o; };
const sandOf = (pcs: DxfPiece[]) => pcs.filter((p) => p.layer === "00-hatch" && p.type === "HATCH" && p.pattern === "AR-SAND" && p.rings?.[0]).map((p) => dedupe(p.rings![0]!.map(M))).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
const sandG = sandOf(G), sandF = sandOf(F);
const hiddenG = G.filter((p) => p.layer === "00-HIDDEN" && p.pts && p.pts.length >= 5).map((p) => dedupe(p.pts!.map(M))).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
const ringDist = (q: P2, r: P2[]) => Math.min(...segs(r, true).map(([a, b]) => { const pr = projOn(q, a, b); return pr.inSeg ? pr.d : Math.min(Math.hypot(q[0] - a[0], q[1] - a[1]), Math.hypot(q[0] - b[0], q[1] - b[1])); }));
/** The route as the sheets hatch it; cut to the plot line once the plot is read (below). */
let routeRings = [...sandG, ...sandF, ...(sandF.length ? hiddenG : [])];
const onRoute = (q: P2, m = 0.3) => routeRings.some((r) => inside(q, r) || ringDist(q, r) < m);
/** The part of ring r on the side of the line through o where (q − o)·n ≥ 0. */
const clipHalf = (r: P2[], o: P2, n: P2) => {
  const out: P2[] = [], f = (q: P2) => (q[0] - o[0]) * n[0] + (q[1] - o[1]) * n[1];
  for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!, fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return out;
};

// ±0.00: the survey ground at the production entrance door (its double door on the ground floor's shell), rounded to 5 cm
const doorsG = G.filter((p) => p.type === "INSERT" && /^00-delet/.test(p.insert ?? ""));
T("ground entrance door leaf").read = doorsG.length;
const doorPairs: P2[] = [];
for (const p of doorsG) {
  const q = M(p.at!);
  const near = doorPairs.findIndex((c) => Math.hypot(c[0] - q[0], c[1] - q[1]) < 2.5);
  if (near >= 0) { doorPairs[near] = [(doorPairs[near]![0] + q[0]) / 2, (doorPairs[near]![1] + q[1]) / 2]; T("ground entrance door leaf").merged++; } else doorPairs.push(q);
}
const prodLabel = G.find((p) => p.text === "כניסה מחלקת ייצור");
const prodAt = prodLabel ? M(prodLabel.at!) : doorPairs[0]!;
const mainDoor = doorPairs.slice().sort((a, b) => Math.hypot(a[0] - prodAt[0], a[1] - prodAt[1]) - Math.hypot(b[0] - prodAt[0], b[1] - prodAt[1]))[0]!;
const A0 = Math.round(absAt(mainDoor[0], mainDoor[1]) * 20) / 20;
report.zero = { absolute: A0, at: "survey ground at the production entrance's double door", assumed: true };
const shellGround = gShell.shell.outer.map((p) => absAt(p[0], p[1]) - A0);
report.groundAtShellCorners = shellGround.map((v) => v.toFixed(2));
say(`±0.00 = ${A0} (ground at the production door); ground at the shell's corners ${shellGround.map((v) => v.toFixed(1)).join(" ")} m`);

// ---- terrain: 1 m grid over the plot + 70 m, the TIN; under the building cut down to the slab's foot ----
const ext0 = gShell.shell.outer;
const gx0 = Math.floor(Math.min(...ext0.map((p) => p[0])) - 70), gx1 = Math.ceil(Math.max(...ext0.map((p) => p[0])) + 70);
const gz0 = Math.floor(Math.min(...ext0.map((p) => p[1])) - 70), gz1 = Math.ceil(Math.max(...ext0.map((p) => p[1])) + 70);
const DX = 1, nx = Math.round((gx1 - gx0) / DX) + 1, nz = Math.round((gz1 - gz0) / DX) + 1;
const heights: number[] = [];
let cut = 0;
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const x = gx0 + i * DX, z = gz0 + j * DX;
  let h = absAt(x, z) - A0;
  if (inside([x, z], ext0) && h > -SLAB) { h = -SLAB; cut++; }
  heights.push(h);
}
prims.push({ type: "terrain", x0: gx0, z0: gz0, dx: DX, nx, nz, heights, material: "soil", tag: "ground" });
report.terrain = { nx, nz, cellsCutUnderBuilding: cut };
const hAt = (x: number, z: number) => absAt(x, z) - A0;

// ---- site surfaces: the approved road (red sand hatch), the open public strip (yellow), the yard inside the plot ----
const axTop = top(axes.all);
const plotP = axTop.find((p) => p.layer === "00-m-cahol" && p.pts && p.closed);
const plot = plotP ? ringOf(plotP.pts!.map((q) => ({ x: q.x + SHIFT.x, y: q.y + SHIFT.y }))) : [];
const roadRings = axTop.filter((p) => p.layer === "00-m-adom" && p.rings).map((p) => ringOf(p.rings![0]!.map((q) => ({ x: q.x + SHIFT.x, y: q.y + SHIFT.y }))));
const openRings = axTop.filter((p) => p.layer === "00-m-tzaov" && p.rings).map((p) => ringOf(p.rings![0]!.map((q) => ({ x: q.x + SHIFT.x, y: q.y + SHIFT.y }))));
// the route stands inside the plot line only: the ramps end inside the fence on a level landing, the trucks go on through the yard
// to the gate (the user, 2026-11-10: "both ramps end inside the fence … the ramp ends, then a level surface, before the fence, not after")
const toPlot = (r: P2[]) => { const sg = Math.sign(area(plot)) || 1; return segs(plot, true).reduce((acc, [a, b]) => clipHalf(acc, a, [-(b[1] - a[1]) * sg, (b[0] - a[0]) * sg]), r); };
const routeRaw = routeRings;
if (plot.length) routeRings = routeRings.map((r) => dedupe(toPlot(r))).filter((r) => r.length >= 3);
T("site: road hatch").read = roadRings.length; T("site: open-space hatch").read = openRings.length; T("site: plot line").read = plot.length ? 1 : 0;
// The surfaces are painted on the ground itself (a photo laid on the terrain), so they follow the slope with no steps:
// 1 m tiles stood out as a staircase of shadows on the 10 m fall (first render, 2026-11-10).
const S_PX = 0.25; // metres a pixel
let driveway: P2[] = [], driveSides: Array<[P2, P2]> = []; const shrubs: P2[] = []; // the proposed entrance drive and planting (below)
const pw = Math.round((gx1 - gx0) / S_PX), ph = Math.round((gz1 - gz0) / S_PX);
const rgb = Buffer.alloc(pw * ph * 3);
let cells = { road: 0, open: 0, yard: 0, soil: 0 };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
  const c: P2 = [gx0 + (u + 0.5) * S_PX, gz0 + (v + 0.5) * S_PX];
  let col: [number, number, number];
  if (roadRings.some((r) => inside(c, r))) { col = [72, 74, 77]; cells.road++; }
  else if (openRings.some((r) => inside(c, r))) { col = [118, 142, 84]; cells.open++; }
  else if (plot.length && inside(c, plot)) { col = [176, 174, 168]; cells.yard++; }
  else { col = [178, 160, 128]; cells.soil++; }
  const n = (rnd() - 0.5) * 14;
  const k = (v * pw + u) * 3;
  rgb[k] = Math.max(0, Math.min(255, col[0] + n)); rgb[k + 1] = Math.max(0, Math.min(255, col[1] + n)); rgb[k + 2] = Math.max(0, Math.min(255, col[2] + n));
}
// ---- the survey's site features (the user, 2026-11-10: "everything in the files goes into the visualization") ----
// Codes by the survey sheet's own legend (its sample lines beside their names, read by scripts/_factory/survey-layers.mts):
// M2200 building / shed outline, M2205 roof edge, M2221 roof level, M2220 floor level, M2602 wall line, M2651 wall-top level,
// M2601 fence ("גדר"), M2612 gate ("שער"), M2404 kerb ("אבן שפה"), M2408 paving / sidewalk ("ריצוף", "מדרכה"), M2401 asphalt edge,
// M2405 paving edge, M2407 concrete ("בטון"), M2812 rocks ("סלעים"), M1510 / M1509 top / foot of slope, M6332 low-voltage pole
// ("ע.ח.מ.נ."), M6351 high-voltage pole and its line ("ע.ח.מ.ג."), M4616 water riser ("זקף מים"). Rule for what exists: kept as
// it stands, unless the new building stands on it (then it is demolished — reported).
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
const heb = (s: string) => { let o = "", hit = false; for (const ch of s) { const c = ch.codePointAt(0)!; let b = c >= 0x80 && c <= 0x9f ? c : -1; if (b < 0) { const i = CP1252.indexOf(ch); if (i >= 0) b = 0x80 + i; } if (b >= 0x80 && b <= 0x9a) { o += String.fromCodePoint(0x5d0 + b - 0x80); hit = true; } else o += ch; } return hit ? [...o].reverse().join("") : s; };
const SV = survey.all.filter((p) => p.path.length === 0);
const onSheet = (q: P2) => q[0] < 55; // the legend column (its sample lines and symbols) stands at x ≈ 57–61
const svLines = (layer: string) => SV.filter((p) => p.layer === layer && p.pts && p.pts.length >= 2 && (p.type === "LINE" || /POLYLINE/.test(p.type))).map((p) => ({ p, l: p.pts!.map(MS) })).filter((x) => onSheet(x.l[0]!));
const svMarks = (layer: string, ins?: RegExp) => SV.filter((p) => p.layer === layer && p.type === "INSERT" && p.at && (!ins || ins.test(p.insert ?? ""))).map((p) => ({ p, at: MS(p.at!), h: Number(p.attribs?.find((a) => a.tag === "HEIGHT")?.text) })).filter((m) => onSheet(m.at));
const dRing = (q: P2, r: P2[]) => Math.min(...segs(r, true).map(([a, b]) => { const pr = projOn(q, a, b); return pr.inSeg ? pr.d : Math.min(Math.hypot(q[0] - a[0], q[1] - a[1]), Math.hypot(q[0] - b[0], q[1] - b[1])); }));
const dLine = (q: P2, l: P2[]) => Math.min(...segs(l, false).map(([a, b]) => { const pr = projOn(q, a, b); return pr.inSeg ? pr.d : Math.min(Math.hypot(q[0] - a[0], q[1] - a[1]), Math.hypot(q[0] - b[0], q[1] - b[1])); }));
const nearOn = (q: P2, l: P2[]) => { let best = { d: Infinity, at: l[0]! }; for (const [a, b] of segs(l, false)) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const s = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)); const f: P2 = [a[0] + s * dx, a[1] + s * dz]; const d = Math.hypot(q[0] - f[0], q[1] - f[1]); if (d < best.d) best = { d, at: f }; } return best; };
const newFoot = gShell.shell.outer;
// the building and a metre of working room round it, and the sheet's truck route (its ramps and raised run stand there)
const underNew = (q: P2) => inside(q, newFoot) || dRing(q, newFoot) < 1.0 || onRoute(q);
// paint on the ground photo: a line of a width, and the band between two near-parallel lines (a sidewalk, a slope)
const paint = (c: P2, col: [number, number, number]) => { const u = Math.floor((c[0] - gx0) / S_PX), v = Math.floor((c[1] - gz0) / S_PX); if (u < 0 || v < 0 || u >= pw || v >= ph) return; const k = (v * pw + u) * 3, n = (rnd() - 0.5) * 10; rgb[k] = Math.max(0, Math.min(255, col[0] + n)); rgb[k + 1] = Math.max(0, Math.min(255, col[1] + n)); rgb[k + 2] = Math.max(0, Math.min(255, col[2] + n)); };
const strokeLine = (l: P2[], w: number, col: [number, number, number], skip: (q: P2) => boolean = () => false) => { for (const [a, b] of segs(l, false)) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s <= L; s += S_PX / 2) for (let t = -w / 2; t <= w / 2; t += S_PX / 2) { const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; { const q: P2 = [a[0] + ux * s - uz * t, a[1] + uz * s + ux * t]; if (!skip(q)) paint(q, col); } } } };
const band = (A: P2[][], B: P2[][], maxSep: number, col: [number, number, number], skip: (q: P2) => boolean) => {
  let n = 0; const all = [...A, ...B].flat(); if (!A.length || !B.length) return 0;
  const bx0 = Math.min(...all.map((p) => p[0])) - 1, bx1 = Math.max(...all.map((p) => p[0])) + 1, bz0 = Math.min(...all.map((p) => p[1])) - 1, bz1 = Math.max(...all.map((p) => p[1])) + 1;
  for (let z = bz0; z < bz1; z += S_PX) for (let x = bx0; x < bx1; x += S_PX) {
    const q: P2 = [x, z]; if (skip(q)) continue;
    const fa = A.map((l) => nearOn(q, l)).sort((u, v) => u.d - v.d)[0]!; if (fa.d > maxSep) continue;
    const db = Math.min(...B.map((l) => dLine(q, l))); if (db > maxSep) continue;
    // between the two lines: its distances to them add up to the lines' spacing there (from its foot on the first line)
    const sep = Math.min(...B.map((l) => dLine(fa.at, l)));
    if (sep < maxSep && fa.d + db <= sep + 0.3) { paint(q, col); n++; }
  }
  return Math.round(n * S_PX * S_PX);
};
// the approved road runs on past the sheet's frame: the hatch is cut square at its two ends (x ≈ −57 and +53), and the ground
// beyond read as a dead end in the corner (the user, 2026-11-10: "fix the road in the bottom-right corner"). Each square-cut end
// is carried on 40 m the way the road's edges run into it, asphalt like the road.
{
  const TRo = T("site: road beyond the sheet's frame"); TRo.read = roadRings.length;
  let n = 0;
  for (const r of roadRings) {
    const xs = r.map((p) => p[0]), lo = Math.min(...xs), hi = Math.max(...xs);
    for (let i = 0; i < r.length; i++) {
      const A = r[i]!, B = r[(i + 1) % r.length]!;
      const atEnd = (q: P2) => Math.abs(q[0] - lo) < 3.5 || Math.abs(q[0] - hi) < 3.5;
      if (!atEnd(A) || !atEnd(B) || Math.hypot(B[0] - A[0], B[1] - A[1]) < 6) continue;
      // the neighbours along the ring that are not themselves on the cut
      let ip = (i - 1 + r.length) % r.length; while (Math.hypot(r[ip]![0] - A[0], r[ip]![1] - A[1]) < 0.5 && ip !== i) ip = (ip - 1 + r.length) % r.length;
      let iq = (i + 2) % r.length; while (Math.hypot(r[iq]![0] - B[0], r[iq]![1] - B[1]) < 0.5 && iq !== i) iq = (iq + 1) % r.length;
      const P = r[ip]!, Q = r[iq]!;
      const u1 = [A[0] - P[0], A[1] - P[1]], u2 = [B[0] - Q[0], B[1] - Q[1]], l1 = Math.hypot(u1[0]!, u1[1]!) || 1, l2 = Math.hypot(u2[0]!, u2[1]!) || 1;
      const d0 = [u1[0]! / l1 + u2[0]! / l2, u1[1]! / l1 + u2[1]! / l2], ld = Math.hypot(d0[0]!, d0[1]!) || 1, d: P2 = [d0[0]! / ld, d0[1]! / ld];
      const quad: P2[] = [A, B, [B[0] + d[0] * 40, B[1] + d[1] * 40], [A[0] + d[0] * 40, A[1] + d[1] * 40]];
      const qx = quad.map((p) => p[0]), qz = quad.map((p) => p[1]);
      for (let z = Math.min(...qz); z < Math.max(...qz); z += S_PX) for (let x = Math.min(...qx); x < Math.max(...qx); x += S_PX) if (inside([x, z], quad) && !(plot.length && inside([x, z], plot))) { paint([x, z], [72, 74, 77]); n++; }
      TRo.built++; TRo.why.push(`the road's end at ${((A[0] + B[0]) / 2).toFixed(0)},${((A[1] + B[1]) / 2).toFixed(0)}, cut square by the sheet's frame: carried on 40 m along its edges`);
    }
  }
  TRo.merged = Math.max(0, TRo.read - TRo.built); TRo.why.push(`${Math.round(n * S_PX * S_PX)} m² of road painted past the frame`);
}
const kerbs = svLines("M2404"), pave = svLines("M2408"), asph = svLines("M2401"), paveEdge = svLines("M2405"), concr = svLines("M2407");
const slopeTop = svLines("M1510"), slopeFoot = svLines("M1509");
{
  const inPlot = (q: P2) => plot.length > 0 && inside(q, plot);
  const sw = band(kerbs.map((x) => x.l), pave.map((x) => x.l), 4.5, [196, 190, 178], inPlot);
  const T1 = T("survey: sidewalk / paving (M2408)"); T1.read = pave.length + svMarks("M2408").length; T1.built = pave.length; T1.merged = svMarks("M2408").length;
  T1.why.push(`painted on the ground between the kerb (M2404) and the paving edge (M2408): ${sw} m²; its "מדרכה" marks name it`);
  // not on the road, the route's crossing or inside the plot (the works there replace the old bank): the bare-earth patch lay across
  // the verge and the truck exit (the user, 2026-11-10: "fix the road in the corner")
  const sl = band(slopeTop.map((x) => x.l), slopeFoot.map((x) => x.l), 9, [150, 128, 96], (q) => roadRings.some((r) => inside(q, r)) || (plot.length > 0 && inside(q, plot)) || onRoute(q, 1.0));
  const T2 = T("survey: slope top / foot (M1510 / M1509)"); T2.read = slopeTop.length + slopeFoot.length; T2.built = slopeTop.length + slopeFoot.length;
  T2.why.push(`the slope's face painted as bare earth between its top and foot lines: ${sl} m²; its fall is in the ground already (the spot heights both sides)`);
  // option 1: the sheets' hatch runs a little past the plot line at the route's two ends; nothing is built there — the ramps end
  // inside the fence on a level landing (the user, 2026-11-10), the fence runs on across
  if (sandF.length && plot.length) {
    let n = 0;
    for (const r of [...sandG, ...hiddenG.slice(0, 1)]) {
      const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
      for (let z = Math.min(...zs); z < Math.max(...zs); z += S_PX) for (let x = Math.min(...xs); x < Math.max(...xs); x += S_PX) if (inside([x, z], r) && !inside([x, z], plot)) n++;
    }
    const TX = T("sheet: route hatch past the plot line"); TX.read = 1; TX.dropped = 1; TX.why.push(`${Math.round(n * S_PX * S_PX)} m² of the hatch outside the plot line: not built — the ramps end inside the fence (the user's word); the fence closes across`);
  }
  // option 2: the sand hatch on the ground sheet is the truck yard in front of the north-west wall — asphalt
  if (!sandF.length) for (const r of sandG) {
    const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
    let n = 0; for (let z = Math.min(...zs); z < Math.max(...zs); z += S_PX) for (let x = Math.min(...xs); x < Math.max(...xs); x += S_PX) if (inside([x, z], r)) { paint([x, z], [96, 98, 101]); n++; }
    const TY = T("sheet: truck yard (AR-SAND hatch)"); TY.read++; TY.built++; TY.why.push(`the yard where "חניית משאיות" stands, painted asphalt: ${Math.round(n * S_PX * S_PX)} m²`);
  }
  // ---- PROPOSAL, outside works (the user, 2026-11-10: "סדר את הכניסה, שיהיה נקי ומסודר; תשלים את הפיתוח"): none on the sheets ----
  // the entrance: an asphalt drive from the main gate (the survey's gate by the drive's paving edges) straight out to the road,
  // flared 2.5 m each side at the road for the turn, kerbed along its sides; it replaces the survey's patch of paving there
  {
    const gSv = svLines("M2612").map((g) => ({ a: g.l[0]!, b: g.l[g.l.length - 1]! })).filter((g) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) > 3);
    const gm = (g: { a: P2; b: P2 }): P2 => [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    const main = paveEdge.length ? gSv.map((g) => ({ g, d: Math.min(...paveEdge.map((e) => dLine(gm(g), e.l))) })).sort((u, v) => u.d - v.d)[0] : undefined;
    const TE = T("proposal: site entrance");
    if (main && main.d < 10) {
      const { a, b } = main.g, L = Math.hypot(b[0] - a[0], b[1] - a[1]), u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], m = gm(main.g);
      let best: { n: P2; t: number } | null = null;
      for (const sg of [1, -1]) { const n: P2 = [-u[1] * sg, u[0] * sg]; for (let t = 0.5; t < 30; t += 0.25) if (roadRings.some((r) => inside([m[0] + n[0] * t, m[1] + n[1] * t], r))) { if (!best || t < best.t) best = { n, t }; break; } }
      if (best) {
        // long enough that BOTH flared corners reach the road's asphalt: the road edge runs askew, and a drive cut square at its
        // middle left the sidewalk across one half of its mouth (a white strip — the user, 2026-11-10)
        const n = best.n, cornersIn = (t: number) => [[b[0] + n[0] * t + u[0] * 2.5, b[1] + n[1] * t + u[1] * 2.5], [a[0] + n[0] * t - u[0] * 2.5, a[1] + n[1] * t - u[1] * 2.5]].every((c) => roadRings.some((r) => inside(c as P2, r)));
        let t = best.t + 1.0; while (t < best.t + 10 && !cornersIn(t)) t += 0.25; t += 0.5;
        driveway = [a, b, [b[0] + n[0] * t + u[0] * 2.5, b[1] + n[1] * t + u[1] * 2.5], [a[0] + n[0] * t - u[0] * 2.5, a[1] + n[1] * t - u[1] * 2.5]];
        driveSides = [[a, driveway[3]!], [b, driveway[2]!]];
        const xs = driveway.map((p) => p[0]), zs = driveway.map((p) => p[1]); let k = 0;
        for (let z = Math.min(...zs); z < Math.max(...zs); z += S_PX) for (let x = Math.min(...xs); x < Math.max(...xs); x += S_PX) if (inside([x, z], driveway)) { paint([x, z], [88, 90, 93]); k++; }
        TE.built++; TE.why.push(`an asphalt drive from the ${L.toFixed(1)} m gate to the road, ${best.t.toFixed(1)} m long, ${Math.round(k * S_PX * S_PX)} m², flared at the road, kerbed along its sides (proposal)`);
      } else TE.why.push("no road within 30 m of the main gate: no drive");
    } else TE.why.push("no gate by the drive's paving edges: no drive");
    // an apron of paving 1.5 m round the building, where no yard / route / drive is
    const TAp = T("proposal: building apron"); let ap = 0;
    const fx = newFoot.map((p) => p[0]), fz = newFoot.map((p) => p[1]);
    for (let z = Math.min(...fz) - 2; z < Math.max(...fz) + 2; z += S_PX) for (let x = Math.min(...fx) - 2; x < Math.max(...fx) + 2; x += S_PX) {
      const q: P2 = [x, z]; if (inside(q, newFoot) || dRing(q, newFoot) > 1.5 || onRoute(q) || (driveway.length && inside(q, driveway))) continue;
      if (!sandF.length && sandG.some((r) => inside(q, r))) continue;
      paint(q, [204, 199, 188]); ap++;
    }
    TAp.built = 1; TAp.why.push(`light paving 1.5 m wide round the building's foot: ${Math.round(ap * S_PX * S_PX)} m² (proposal)`);
    // a planting strip 1.6 m wide inside the plot line, with shrubs, where nothing else is
    const TPl = T("proposal: planting strip"); let pl = 0;
    if (plot.length) {
      const px = plot.map((p) => p[0]), pz = plot.map((p) => p[1]);
      const parkAt = G.filter((p) => p.text && /כניסה מחלקת/.test(p.text) && p.at).map((p) => M(p.at!)); // the workers' parking by each entrance: no planting there
      const free = (q: P2) => !(parkAt.some((e) => Math.hypot(q[0] - e[0], q[1] - e[1]) < 14) || underNew(q) || dRing(q, newFoot) < 2.5 || (driveway.length && (inside(q, driveway) || dRing(q, driveway) < 1.5)) || sandG.some((r) => inside(q, r) || dRing(q, r) < 1.0));
      for (let z = Math.min(...pz); z < Math.max(...pz); z += S_PX) for (let x = Math.min(...px); x < Math.max(...px); x += S_PX) {
        const q: P2 = [x, z]; if (!inside(q, plot) || dRing(q, plot) > 1.6 || !free(q)) continue;
        paint(q, [104, 124, 72]); pl++;
      }
      for (const [a, b] of segs(plot, true)) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 1.5; d < L - 1.5; d += 3.0) {
        const c0: P2 = [a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L], n: P2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
        const c: P2 = inside([c0[0] + n[0] * 0.8, c0[1] + n[1] * 0.8], plot) ? [c0[0] + n[0] * 0.8, c0[1] + n[1] * 0.8] : [c0[0] - n[0] * 0.8, c0[1] - n[1] * 0.8];
        if (!inside(c, plot) || !free(c)) continue;
        shrubs.push(c);
      } }
      TPl.built = 1; TPl.why.push(`planted earth 1.6 m wide inside the plot line: ${Math.round(pl * S_PX * S_PX)} m², ${shrubs.length} shrubs every 3 m (proposal)`);
    }
  }
  const onDrive = (q: P2) => driveway.length > 2 && inside(q, driveway);
  for (const x of kerbs) strokeLine(x.l, 0.3, [214, 213, 208], onDrive);
  for (const x of asph) strokeLine(x.l, 0.35, [62, 64, 67], onDrive);

  for (const x of paveEdge) strokeLine(x.l, 0.3, [205, 198, 186], onDrive);
  const dw = paveEdge.length === 2 && !driveway.length ? band([paveEdge[0]!.l], [paveEdge[1]!.l], 14, [168, 166, 160], () => false) : 0;
  for (const x of concr) strokeLine(x.l, 1.2, [172, 172, 167]);
  const T3 = T("survey: asphalt edge (M2401)"); T3.read = asph.length + svMarks("M2401").length; T3.built = asph.length; T3.merged = svMarks("M2401").length; T3.why.push("painted as the road's edge line; the road surface is the approved road's hatch (AXES)");
  const T4 = T("survey: paving edge (M2405)"); T4.read = T4.built = paveEdge.length; T4.why.push(`the two edges of the drive from the north-west gate out to the road: ${driveway.length ? "the new asphalt entrance drive covers them (merged)" : `the drive between them painted as paving (${dw} m²)`}, the kerb dropped across it`);
  const T5 = T("survey: concrete (M2407)"); T5.read = concr.length + svMarks("M2407").length; T5.built = concr.length; T5.merged = svMarks("M2407").length; T5.why.push("painted as concrete strips (open lines: 1.2 m wide)");
}
const sharp = (await import("sharp")).default;
const png = await sharp(rgb, { raw: { width: pw, height: ph, channels: 3 } }).png().toBuffer();
const terrain = prims.find((p) => p.type === "terrain" && p.tag === "ground");
if (terrain && terrain.type === "terrain") terrain.photo = { src: `data:image/png;base64,${png.toString("base64")}`, pw, ph, s: S_PX, cu: 0, cv: 0, cx: gx0, cz: gz0, rot: 0 };
for (const k of ["road", "open", "yard"] as const) cells[k] = Math.round(cells[k] * S_PX * S_PX);
{
  // the rest of AXES near the site (checked 2026-11-10): what each is and where it went
  const near = axTop.filter((p) => { const a = p.at ?? p.pts?.[0] ?? p.rings?.[0]?.[0]; if (!a) return false; const q = M({ x: a.x + SHIFT.x, y: a.y + SHIFT.y }); return Math.abs(q[0]) < 150 && Math.abs(q[1]) < 150; });
  const rule = (k: string, f: (p: DxfPiece) => boolean, how: "merged" | "dropped", why: string) => { const n = near.filter(f).length; if (!n) return; const t = T(`AXES: ${k}`); t.read = n; t[how] = n; t.why.push(why); };
  rule("existing road edges (00-mabat)", (p) => p.layer === "00-mabat", "merged", "the survey's own kerb / asphalt lines, copied: built from the survey");
  rule("hatch borders (layer 0)", (p) => p.layer === "0" && !!p.pts && !!p.closed, "merged", "the outlines of the road and open-space hatches (same areas 1471 / 166 / 842 m²): built as those hatches");
  rule("building line (00-m-adom outline)", (p) => p.layer === "00-m-adom" && !!p.pts, "dropped", "the red building line (קו בניין): a planning line, nothing on the ground");
  rule("helper outline (00-help)", (p) => p.layer === "00-help", "dropped", "a drafting helper (1288 m²), nothing on the ground");
  rule("place names (layer 0 texts)", (p) => p.layer === "0" && !!p.text, "merged", "\"דרך מאושרת\" names the road, \"שצ\\\"פ\" the open space, \"מגרש שכן\" the neighbour's lot (its building is the survey's)");
}
T("site: road hatch").built = roadRings.length; T("site: open-space hatch").built = openRings.length; T("site: plot line").built = plot.length ? 1 : 0;
report.siteCells = cells;
for (const t of trees) {
  if (driveway.length && inside(t, driveway)) { T("survey tree").dropped++; T("survey tree").why.push(`a tree at ${t[0].toFixed(0)},${t[1].toFixed(0)}: on the new entrance drive — removed`); continue; }
  if (onRoute(t, 1.5)) { T("survey tree").dropped++; T("survey tree").why.push(`a tree at ${t[0].toFixed(0)},${t[1].toFixed(0)}: under the sheet's truck route — removed`); continue; }
  prims.push({ type: "tree", at: { x: t[0], y: hAt(t[0], t[1]), z: t[1] }, height: 5, crown: 2.2, tag: "survey:tree" }); T("survey tree").built++;
}
const builtWalls: Array<[P2, P2]> = []; // the walls, fences and gates as built: the cars keep to the yard's side of them
{
  // a straight run a→b of the existing site, kept only where the new building does not stand and no gate opens: runs of 0.25 m samples
  const runs = (a: P2, b: P2, open: (q: P2) => boolean) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25)), out: Array<[P2, P2]> = [];
    let s0: number | null = null, cut = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n, q: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ok = !open(q);
      if (!ok) cut += L / n;
      if (ok && s0 === null) s0 = t;
      if ((!ok || k === n) && s0 !== null) { const t1 = ok ? t : (k - 1) / n; if ((t1 - s0) * L > 0.2) out.push([[a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]); s0 = null; }
    }
    return { out, cut };
  };
  const gates = svLines("M2612"), gateMarks = svMarks("M2612");
  const atGate = (q: P2) => gates.some((g) => dLine(q, g.l) < 0.6);
  // ---- walls (M2602), their tops from the wall-top marks (M2651) ----
  const tops = svMarks("M2651", /M1502_P/).filter((m) => Number.isFinite(m.h));
  const medTop = (() => { const v = tops.map((m) => m.h - absAt(m.at[0], m.at[1])).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 2.0; })();
  const TW = T("survey: wall (M2602, tops M2651)"); let wallCut = 0;
  for (const { l } of svLines("M2602")) {
    TW.read++;
    let built = 0;
    for (const [a, b] of segs(l, false)) {
      const r = runs(a, b, (q) => underNew(q) || atGate(q)); wallCut += r.cut;
      for (const [p, q] of r.out) {
        builtWalls.push([p, q]);
        const m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], g = hAt(m[0], m[1]);
        const near = tops.map((t) => ({ t, d: Math.hypot(t.at[0] - m[0], t.at[1] - m[1]) })).sort((u, v) => u.d - v.d)[0];
        const hh = Math.max(0.6, Math.min(3.5, near && near.d < 15 ? near.t.h - A0 - g : medTop));
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]), rot = -Math.atan2(q[1] - p[1], q[0] - p[0]);
        box([m[0], g - 0.3 + (hh + 0.3) / 2, m[1]], [L, hh + 0.3, 0.3], rot, "stone", "survey:wall");
        box([m[0], g + hh + 0.04, m[1]], [L + 0.02, 0.08, 0.36], rot, "concrete", "survey:wall-cap");
        built++;
      }
    }
    if (built) TW.built++; else { TW.dropped++; TW.why.push(`a wall line at ${l[0]![0].toFixed(0)},${l[0]![1].toFixed(0)}: wholly under the new building — demolished`); }
  }
  TW.merged = tops.length;
  TW.why.push(`walls of stone with a concrete cap, each as high as its nearest wall-top mark over the ground (median ${medTop.toFixed(1)} m; ${tops.length} marks); ${wallCut.toFixed(0)} m where the new building stands or a gate opens — taken out`);
  // ---- fence (M2601): posts and rails, 2 m ----
  const TF = T("survey: fence (M2601)");
  for (const { l } of svLines("M2601")) {
    TF.read++;
    for (const [a, b] of segs(l, false)) for (const [p, q] of runs(a, b, (x) => underNew(x) || atGate(x)).out) {
      builtWalls.push([p, q]);
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]), rot = -Math.atan2(q[1] - p[1], q[0] - p[0]), m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], g = hAt(m[0], m[1]);
      const n = Math.max(1, Math.round(L / 2.5));
      for (let k = 0; k <= n; k++) { const c: P2 = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]; box([c[0], hAt(c[0], c[1]) + 1.0, c[1]], [0.06, 2.0, 0.06], rot, "darkSteel", "survey:fence-post"); }
      for (const y of [0.15, 1.0, 1.95]) box([m[0], g + y, m[1]], [L, 0.04, 0.04], rot, "darkSteel", "survey:fence-rail");
      box([m[0], g + 1.05, m[1]], [L, 1.8, 0.01], rot, "railGlass", "survey:fence-mesh");
    }
    TF.built++;
  }
  TF.why.push("a 2 m steel fence: posts every ~2.5 m, three rails, the mesh as a faint screen; the survey's own note \"גדר\" names it");
  // ---- the fence closed across the route's ends, on the plot line: the sheets' hatch runs past it there, but the ramps end inside
  // on a level landing and the trucks leave through the yard and the gate (the user, 2026-11-10) — the same 2 m fence ----
  if (sandF.length && plot.length) {
    const TC = T("site: fence across the route's ends (plot line)");
    // only where the hatch crosses the line (the plot line runs inside it), not where its edge runs along the line
    const onRaw = (q: P2) => routeRaw.some((r) => inside(q, r) && ringDist(q, r) > 0.3);
    let len = 0;
    for (const [a, b] of segs(plot, true)) for (const [p0, q0] of runs(a, b, (x) => !onRaw(x)).out) {
      // run on 0.6 m each way, to meet the hatch's edges (kept on the plot edge)
      const AB = Math.hypot(b[0] - a[0], b[1] - a[1]), ua: P2 = [(b[0] - a[0]) / AB, (b[1] - a[1]) / AB];
      const sp = Math.max(0, ((p0[0] - a[0]) * ua[0] + (p0[1] - a[1]) * ua[1]) - 0.6), sq = Math.min(AB, ((q0[0] - a[0]) * ua[0] + (q0[1] - a[1]) * ua[1]) + 0.6);
      const p: P2 = [a[0] + ua[0] * sp, a[1] + ua[1] * sp], q: P2 = [a[0] + ua[0] * sq, a[1] + ua[1] * sq];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue;
      const rot = -Math.atan2(q[1] - p[1], q[0] - p[0]), m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], g = hAt(m[0], m[1]);
      const n = Math.max(1, Math.round(L / 2.5));
      for (let k = 0; k <= n; k++) { const c: P2 = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]; box([c[0], hAt(c[0], c[1]) + 1.0, c[1]], [0.06, 2.0, 0.06], rot, "darkSteel", "site:fence-closing-post"); }
      for (const y of [0.15, 1.0, 1.95]) box([m[0], g + y, m[1]], [L, 0.04, 0.04], rot, "darkSteel", "site:fence-closing-rail");
      box([m[0], g + 1.05, m[1]], [L, 1.8, 0.01], rot, "railGlass", "site:fence-closing-mesh");
      TC.read++; TC.built++; len += L;
    }
    TC.why.push(`${len.toFixed(1)} m of 2 m steel fence on the plot line where the route's hatch crosses it (the survey fence's style)`);
  }
  // ---- gates (M2612): steel leaves of bars, closed ----
  const TG = T("survey: gate (M2612)"); TG.read = gates.length + gateMarks.length; TG.merged = gateMarks.length;
  for (const { l } of gates) {
    const [a, b] = [l[0]!, l[l.length - 1]!], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = -Math.atan2(b[1] - a[1], b[0] - a[0]), m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], g = hAt(m[0], m[1]);
    if (inside(m, newFoot) || dRing(m, newFoot) < 1.0 || (sandF.length > 0 && onRoute(m))) { TG.dropped++; TG.why.push("a gate under the new building / raised route — demolished"); continue; }
    builtWalls.push([a, b]);
    for (const y of [0.12, 1.9]) box([m[0], g + y, m[1]], [L, 0.08, 0.08], rot, "darkSteel", "survey:gate");
    const n = Math.round(L / 0.16);
    for (let k = 0; k <= n; k++) { const c: P2 = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]; box([c[0], g + 1.0, c[1]], [0.025, 1.9, 0.025], rot, "darkSteel", "survey:gate"); }
    TG.built++; TG.why.push(`a ${L.toFixed(1)} m sliding gate of steel bars, closed, in the wall's opening`);
  }
  // ---- existing structures (M2200 outlines; roof M2221, floor M2220, roof edge M2205; the survey's notes "סככה") ----
  const notes = SV.filter((p) => p.layer === "TR_ANOT_L" && p.type === "INSERT" && p.at).map((p) => ({ at: MS(p.at!), text: heb(p.attribs?.find((a) => a.tag === "TEXT")?.text ?? "") })).filter((n) => onSheet(n.at));
  const roofs = svMarks("M2221", /M1502_P/).filter((m) => Number.isFinite(m.h)), floors = svMarks("M2220", /M1502_P/).filter((m) => Number.isFinite(m.h));
  const TB = T("survey: building / shed (M2200)");
  for (const { l } of svLines("M2200")) {
    TB.read++;
    const closed = Math.hypot(l[0]![0] - l[l.length - 1]![0], l[0]![1] - l[l.length - 1]![1]) < 0.1;
    const ring = closed ? l.slice(0, -1) : l; // an open outline runs off the survey's edge: closed along its open side
    const c: P2 = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    const shed = notes.some((n) => n.text.includes("סככה") && (inside(n.at, ring) || dRing(n.at, ring) < 3));
    const roof = roofs.find((m) => inside(m.at, ring) || dRing(m.at, ring) < 1.5), floor = floors.find((m) => inside(m.at, ring));
    const g0 = Math.min(...ring.map((p) => hAt(p[0], p[1]))), base = floor ? floor.h - A0 : g0;
    const top = roof ? roof.h - A0 : base + 3.5;
    const hitNew = ring.filter((p) => underNew(p)).length + (underNew(c) ? 1 : 0);
    if (hitNew > 0) { TB.dropped++; TB.why.push(`existing ${shed ? "shed (\"סככה\")" : "building"} at ${c[0].toFixed(0)},${c[1].toFixed(0)}, ${Math.abs(area(ring)).toFixed(0)} m², roof ${roof ? roof.h : "?"}: the new building stands on it — demolished`); continue; }
    if (shed) {
      for (const p of ring) box([p[0], (hAt(p[0], p[1]) + top - 0.15) / 2, p[1]], [0.18, top - 0.15 - hAt(p[0], p[1]), 0.18], 0, "darkSteel", "survey:shed-post");
      prims.push({ type: "prism", ring, y0: top - 0.15, y1: top, material: "metal", tag: "survey:shed-roof" });
    } else { TB.dropped++; TB.why.push(`existing building at ${c[0].toFixed(0)},${c[1].toFixed(0)} off the plot (a neighbour's): left out at the user's word (2026-11-10: "remove the neighbour's building")`); continue; }
    TB.built++; TB.why.push(`existing ${shed ? "shed: posts at its corners, a sheet roof" : "building (a plain mass)"} at ${c[0].toFixed(0)},${c[1].toFixed(0)}, ${(top - base).toFixed(1)} m to its roof mark ${roof ? roof.h : "(none: 3.5 m assumed)"}${closed ? "" : "; its outline runs off the survey, closed along the open side"}`);
  }
  TB.merged = roofs.length + floors.length + notes.filter((n) => n.text.includes("סככה")).length;
  const TR = T("survey: roof edge (M2205)"); TR.read = svLines("M2205").length; TR.merged = TR.read; TR.why.push("the edge of a shed's roof: the shed's roof is built from its outline and roof mark");
  // ---- kerbs (M2404): a stone kerb 0.15 m over the ground ----
  const TK = T("survey: kerb (M2404)"); TK.read = kerbs.length + svMarks("M2404").length; TK.merged = svMarks("M2404").length;
  // the drive from the north-west gate (between the two M2405 edges): the kerb is dropped across its mouth (within 3 m of it)
  const drive: P2[] = paveEdge.length === 2 ? (() => { const l1 = paveEdge[0]!.l, l2 = paveEdge[1]!.l, e = l1[l1.length - 1]!; return Math.hypot(e[0] - l2[l2.length - 1]![0], e[1] - l2[l2.length - 1]![1]) < Math.hypot(e[0] - l2[0]![0], e[1] - l2[0]![1]) ? [...l1, ...[...l2].reverse()] : [...l1, ...l2]; })() : [];
  const atDrive = (q: P2) => (drive.length > 2 && (inside(q, drive) || ringDist(q, drive) < 3)) || (driveway.length > 2 && (inside(q, driveway) || ringDist(q, driveway) < 0.4));
  for (const [p, q] of driveSides) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; box([m[0], hAt(m[0], m[1]) + 0.05, m[1]], [L, 0.3, 0.2], -Math.atan2(q[1] - p[1], q[0] - p[0]), "concrete", "site:proposal:drive-kerb"); }
  for (const c of shrubs) prims.push({ type: "tree", at: { x: c[0], y: hAt(c[0], c[1]), z: c[1] }, height: 1.3, crown: 0.65, tag: "site:proposal:shrub" });
  for (const { l } of kerbs) { for (const [a, b] of segs(l, false)) for (const [p, q] of runs(a, b, (x) => underNew(x) || atDrive(x)).out) { const m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; box([m[0], hAt(m[0], m[1]) + 0.05, m[1]], [Math.hypot(q[0] - p[0], q[1] - p[1]), 0.3, 0.2], -Math.atan2(q[1] - p[1], q[0] - p[0]), "concrete", "survey:kerb"); } TK.built++; }
  TK.why.push("a kerb stone, 0.15 m proud of the ground, along each line");
  // ---- poles and the overhead line ----
  const TP = T("survey: electricity pole (M6332 / M6351)");
  const lv = svMarks("M6332", /M6332_E/), hv = svMarks("M6351", /M6351_E/);
  TP.read = lv.length + hv.length;
  for (const [ps, hh, r, why] of [[lv, 9, 0.13, "low voltage (\"ע.ח.מ.נ.\"), 9 m"], [hv, 12, 0.2, "high voltage (\"ע.ח.מ.ג.\"), 12 m"]] as const) for (const m of ps) {
    if (underNew(m.at)) { TP.dropped++; TP.why.push(`a pole at ${m.at[0].toFixed(0)},${m.at[1].toFixed(0)} under the new building — moved off (not built)`); continue; }
    const g = hAt(m.at[0], m.at[1]);
    prims.push({ type: "cylinder", centre: { x: m.at[0], y: g + hh / 2, z: m.at[1] }, radius: r, height: hh, material: "concrete", tag: "survey:pole" });
    box([m.at[0], g + hh - 0.5, m.at[1]], [1.6, 0.1, 0.1], 0, "darkSteel", "survey:pole-arm");
    TP.built++; TP.why.push(why);
  }
  TP.merged = SV.filter((p) => /^M63(32|51)$/.test(p.layer) && p.type !== "INSERT" && !/POLYLINE/.test(p.type)).length;
  const TL = T("survey: overhead line (M6351)");
  for (const { l } of svLines("M6351")) {
    TL.read++;
    const closed = Math.hypot(l[0]![0] - l[l.length - 1]![0], l[0]![1] - l[l.length - 1]![1]) < 0.1;
    if (closed) { prims.push({ type: "prism", ring: l.slice(0, -1), y0: hAt(l[0]![0], l[0]![1]) - 0.1, y1: hAt(l[0]![0], l[0]![1]) + 0.3, material: "concrete", tag: "survey:pole-base" }); TL.built++; TL.why.push("the high-voltage pole's concrete base"); continue; }
    for (const [a, b] of segs(l, false)) for (const off of [-0.7, 0, 0.7]) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      const ya = hAt(a[0], a[1]) + 11.5, yb = hAt(b[0], b[1]) + 11.5;
      // three wires, each drawn as two straight halves dipping 0.8 m mid-span
      const mid: [number, number, number] = [(a[0] + b[0]) / 2 - uz * off, (ya + yb) / 2 - 0.8, (a[1] + b[1]) / 2 + ux * off];
      for (const [p, q] of [[[a[0] - uz * off, ya, a[1] + ux * off], mid], [mid, [b[0] - uz * off, yb, b[1] + ux * off]]] as Array<[[number, number, number], [number, number, number]]>) {
        const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], len = Math.hypot(dx, dy, dz);
        prims.push({ type: "box", centre: { x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, z: (p[2] + q[2]) / 2 }, size: { x: Math.hypot(dx, dz), y: 0.025, z: 0.025 }, rotY: -Math.atan2(dz, dx), material: "darkSteel", tag: "survey:wire" });
        void len; void dy;
      }
    }
    TL.built++; TL.why.push("the high-voltage line between its poles: three wires at 11.5 m (the slope of each wire is not drawn: a level wire per half-span)");
  }
  // ---- water riser (M4616), rocks (M2812) ----
  const TWr = T("survey: water riser (M4616)"); const wr = svMarks("M4616", /M4616_E/); TWr.read = wr.length + svLines("M4616").length;
  for (const m of wr) { const g = hAt(m.at[0], m.at[1]); prims.push({ type: "cylinder", centre: { x: m.at[0], y: g + 0.45, z: m.at[1] }, radius: 0.06, height: 0.9, material: "metal", tag: "survey:water-riser" }); TWr.built++; }
  TWr.dropped = svLines("M4616").length; TWr.why.push("a 0.9 m riser; its pipe line runs under the ground — not drawn");
  const TRk = T("survey: rocks (M2812)"); TRk.read = svLines("M2812").length + svMarks("M2812").length; TRk.merged = svMarks("M2812").length;
  for (const { l } of svLines("M2812")) {
    const ring = l.slice(0, -1); const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    let k = 0; for (let x = Math.min(...xs) + 0.4; x < Math.max(...xs); x += 0.9) for (let z = Math.min(...zs) + 0.4; z < Math.max(...zs); z += 0.9) {
      if (!inside([x, z], ring)) continue; const s = 0.5 + rnd() * 0.5, g = hAt(x, z);
      prims.push({ type: "box", centre: { x: x + (rnd() - 0.5) * 0.3, y: g + s * 0.3, z: z + (rnd() - 0.5) * 0.3 }, size: { x: s, y: s * 0.7, z: s * 0.85 }, rotY: rnd() * 3, material: "rock", tag: "survey:rock", round: s * 0.3 }); k++;
    }
    TRk.built++; TRk.why.push(`${k} rocks inside the drawn outline`);
  }
  // ---- the survey's paper: lines and marks that are not things on the ground ----
  const paper: Array<[RegExp, string]> = [[/^M1802$/, "planned plot lines (with their numbers MIG-NUM)"], [/^MIG-NUM$/, "plot numbers"], [/^Mcellno$/, "cell numbers"], [/^Mrozeta$/, "road number / width marks (road 2, 15 m)"], [/^M1280$/, "title block"], [/^TR_GIL/, "sheet frame, grid ticks, scale bar"], [/^declaration$/, "the surveyor's declaration"], [/^TR_ANOT_L$/, "notes (\"סככה\", \"גדר\") — used to name the sheds and the fence"], [/^M15(02|09|10)$|^M10|^C16|^M18|^M6091|^M6241|^M2207|^M2417/, "legend samples / boundary points"], [/^0$/, "title texts, the spot / tree attributes"]];
  for (const [re, why] of paper) { const n = SV.filter((p) => re.test(p.layer) && !(p.type === "INSERT" && /M1502_P|M2801_E|M15/.test(p.insert ?? "")) && p.type !== "ATTRIB").length; if (n) { const t = T(`survey paper: ${why}`); t.read = n; t.dropped = n; t.why.push("not a thing on the ground: nothing to build"); } }
}

// ---- storeys ----
// ---- PROPOSAL: room equipment (the client: "a little equipment in the rooms") — none of it is on the sheet ----
/** Truck doors (built, or the sheet's own): where a truck backs up — the wall face point, the outward normal, the floor (null: the ground there). */
const docks: Array<{ p: P2; n: P2; y: number | null; tag: string }> = [];
type RoomInfo = { r: P2[]; name: string; doorI: number; cx: number; cz: number; ar: number };
/** The oven row (fitted through the ground storey's ovens): the line between the raw side (+1, where "ייצור"/"הפשרה" are) and the finished side (−1). */
let sep: { p: P2; d: P2; rawSign: number } | null = null;
const sideOf = (q: P2) => { if (!sep) return 0; const v = (q[0] - sep.p[0]) * -sep.d[1] + (q[1] - sep.p[1]) * sep.d[0]; return Math.abs(v) < 0.5 ? 0 : Math.sign(v) * sep.rawSign; };
type Kit = "production" | "slicing" | "butchery" | "packing" | "trolleys" | "cold" | "store" | "office" | "dining" | "lockers" | "none";
function kitOf(name: string): Kit {
  if (/פריסה/.test(name)) return "slicing";
  if (/קצביה/.test(name)) return "butchery";
  if (/אריזה/.test(name)) return "packing";
  if (/מהתנור/.test(name)) return "trolleys";
  if (/ייצור/.test(name)) return "production";
  if (/קירור|הקפאה|הפשרה/.test(name)) return "cold";
  if (/מחסן/.test(name)) return "store";
  if (/משרד|הנהלה/.test(name)) return "office";
  if (/קפה|אוכל/.test(name)) return "dining";
  if (/הלבשה/.test(name)) return "lockers";
  return "none"; // lobby, protected room (ממ"ס): left empty
}
function equipRooms(rooms: RoomInfo[], obstacles: P2[][], tag: string, y0: number, h: number) {
  const ET = T(`${tag} proposal: room equipment`);
  const out: Array<{ name: string; kit: Kit; from?: string; items: number }> = [];
  for (const rm of rooms) {
    ET.read++;
    let name = rm.name, from: string | undefined;
    // an unnamed box takes the name of the nearest plural label ("חדרי …", "מחסן …") within 12 m, or within the two boxes' half-sides + 3 m for big halls: the sheet names a row of rooms once
    if (!name) {
      // a twin (same area within 1%, in reach) wins over a nearer label: the sheet draws a pair of equal halls and names one
      // (Gottlieb factory, option 1: the unnamed 136 m² hall beside the 136 m² dry store is a store — the user, 2026-11-10)
      // the architect (2026-11-10): the plant is two sides split by the pass-through oven row — raw material, and finished product —
      // on both storeys ("no mixing, it is sterility"). So a box only inherits from a label on its own side, and on its own side
      // the nearest row label holds at any distance; with no oven row the reach rule stands.
      const mySide = sideOf([rm.cx, rm.cz]);
      const reach = (q: RoomInfo, d: number) => mySide !== 0 ? sideOf([q.cx, q.cz]) === mySide : d < Math.max(12, (Math.sqrt(rm.ar) + Math.sqrt(q.ar)) / 2 + 3);
      const cands = rooms.filter((q) => q.name && /^חדרי|^מחסן/.test(q.name)).map((q) => ({ q, d: Math.hypot(q.cx - rm.cx, q.cz - rm.cz) })).filter((c) => reach(c.q, c.d)).sort((a, b) => a.d - b.d);
      // only a pair: in a grid of equal rooms (the 25 m² rows) the nearest label already decides
      const pair = rooms.filter((q) => Math.abs(q.ar - rm.ar) < 0.01 * rm.ar).length === 2;
      const twin = pair ? cands.find((c) => Math.abs(c.q.ar - rm.ar) < 0.01 * rm.ar) : undefined;
      const near = twin ?? cands[0];
      if (near) { name = near.q.name; from = `${twin ? "twin hall (same area)" : "nearest row label"} ${near.d.toFixed(1)} m${mySide ? `, ${mySide > 0 ? "raw" : "finished"} side` : ""}`; }
    }
    const kit = kitOf(name);
    if (kit === "none") { ET.dropped++; ET.why.push(`"${name || "unnamed"}" ${rm.ar.toFixed(0)} m²: ${name ? "lobby / protected room, left empty" : "no row label near enough"}`); out.push({ name, kit, items: 0 }); continue; }
    if (rm.r.length !== 4) { ET.dropped++; ET.why.push(`"${name}": not a 4-corner box`); out.push({ name, kit, items: 0 }); continue; }
    const n0 = prims.length;
    // the room's own frame: u along its longest side, v across; x ∈ [−A, A], y ∈ [−B, B]
    const sg = segs(rm.r, true);
    const lens = sg.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    const li = lens[0]! >= lens[1]! ? 0 : 1;
    const [la, lb] = sg[li]!;
    const ux = (lb[0] - la[0]) / lens[li]!, uz = (lb[1] - la[1]) / lens[li]!;
    const vx = -uz, vz = ux;
    const A = lens[li]! / 2 - ROOM_WALL / 2, B = lens[1 - li]! / 2 - ROOM_WALL / 2;
    const rot = -Math.atan2(uz, ux);
    const W = (x: number, y: number): P2 => [rm.cx + ux * x + vx * y, rm.cz + uz * x + vz * y];
    // the door's wall, in the frame: "y+", "y-", "x+", "x-"
    let doorSide = "";
    if (rm.doorI >= 0) {
      const [a, b] = sg[rm.doorI]!; const m: P2 = [(a[0] + b[0]) / 2 - rm.cx, (a[1] + b[1]) / 2 - rm.cz];
      const lx = m[0] * ux + m[1] * uz, ly = m[0] * vx + m[1] * vz;
      doorSide = Math.abs(ly) > Math.abs(lx) * (B / A) ? (ly > 0 ? "y+" : "y-") : (lx > 0 ? "x+" : "x-");
    }
    // clear of ovens, stairs and lifts by 0.3 m
    const free = (x: number, y: number, sx: number, sy: number) => {
      for (const fx of [-0.5, 0, 0.5]) for (const fy of [-0.5, 0, 0.5]) {
        const p = W(x + fx * (sx + 0.6), y + fy * (sy + 0.6));
        if (obstacles.some((o) => inside(p, o))) return false;
      }
      return true;
    };
    // a part in the room's frame: centre (x, y) on the floor plan, size sx × sy, from yb up hh; `rd` rounds its edges
    const put = (x: number, y: number, sx: number, sy: number, yb: number, hh: number, mat: BuildingMaterial, what: string, rd = 0.006) => {
      const p = W(x, y);
      prims.push({ type: "box", centre: { x: p[0], y: y0 + yb + hh / 2, z: p[1] }, size: { x: sx, y: hh, z: sy }, rotY: rot, material: mat, tag: `${tag}:proposal:equip:${what}`, ...(rd > 0 ? { round: rd } : {}) });
    };
    const cyl = (x: number, y: number, r: number, yb: number, hh: number, mat: BuildingMaterial, what: string) => {
      const p = W(x, y);
      prims.push({ type: "cylinder", centre: { x: p[0], y: y0 + yb + hh / 2, z: p[1] }, radius: r, height: hh, material: mat, tag: `${tag}:proposal:equip:${what}` });
    };
    /** A disc lying flat (a chair's base, a fan's grille seen from below, a basin): a thin box rounded to its half-width. */
    const disc = (x: number, y: number, r: number, yb: number, hh: number, mat: BuildingMaterial, what: string) => put(x, y, 2 * r, 2 * r, yb, hh, mat, what, r);
    /** A worker in a white coat, facing +y (fy = 1) or −y. */
    const worker = (x: number, y: number, fy: 1 | -1) => {
      const p = W(x, y), f = W(x, y + fy);
      prims.push({ type: "person", style: "worker", at: { x: p[0], y: y0, z: p[1] }, rotY: Math.atan2(f[0] - p[0], f[1] - p[1]), colour: 0xf2f2f0, height: 1.72, tag: `${tag}:proposal:equip:worker` });
    };
    // units of length `unit` along a long wall (y = ±), depth d, ends kept 0.2 m (more on the door's short wall side)
    const alongLong = (side: 1 | -1, d: number, unit: number, gap: number, make: (x: number, y: number) => void) => {
      if (doorSide === (side > 0 ? "y+" : "y-")) return;
      const x0 = -A + (doorSide === "x-" ? 1.4 : 0.2), x1 = A - (doorSide === "x+" ? 1.4 : 0.2);
      const n = Math.floor((x1 - x0 + gap) / (unit + gap));
      const y = side * (B - d / 2 - 0.05);
      for (let k = 0; k < n; k++) { const x = x0 + k * (unit + gap) + unit / 2; if (free(x, y, unit, d)) make(x, y); }
    };
    const island = (wd: number, make: (x: number, len: number) => void) => {
      if (2 * B < wd + 2 * (0.75 + 1.15)) return; // keep 1.15 m aisles between it and the 0.7 m wall rows
      const x0 = -A + (doorSide === "x-" ? 2.0 : 1.2), x1 = A - (doorSide === "x+" ? 2.0 : 1.2);
      if (x1 - x0 < 1.5) return;
      const xc = (x0 + x1) / 2, len = x1 - x0;
      if (free(xc, 0, len, wd)) make(xc, len);
    };
    // ---- the pieces, as they are made: tops on legs, seats on frames, rounded edges ----
    /** A stainless worktable: a top with a turned-down edge, four square legs on rubber feet, a shelf low between them. */
    const table = (x: number, y: number, sx: number, sy: number, hTop = 0.9) => {
      put(x, y, sx, sy, hTop - 0.045, 0.045, "stainless", "table-top", 0.012);
      for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const px = x + lx * (sx / 2 - 0.06), py = y + ly * (sy / 2 - 0.06);
        put(px, py, 0.045, 0.045, 0.03, hTop - 0.075, "stainless", "table-leg", 0.01);
        disc(px, py, 0.03, 0, 0.03, "rubber", "foot");
      }
      put(x, y, sx - 0.12, sy - 0.12, 0.2, 0.025, "stainless", "table-shelf", 0.006);
    };
    /** A chair facing fy: a seat, a back behind it, four slim legs. */
    const chair = (x: number, y: number, fy: 1 | -1, seat: BuildingMaterial = "timber") => {
      put(x, y, 0.44, 0.42, 0.42, 0.045, seat, "chair-seat", 0.018);
      put(x, y - fy * 0.2, 0.42, 0.03, 0.5, 0.38, seat, "chair-back", 0.012);
      for (const lx of [-0.18, 0.18]) for (const ly of [-0.17, 0.17]) put(x + lx, y + ly, 0.025, 0.025, 0, 0.42, "darkSteel", "chair-leg", 0.008);
    };
    /** An office chair facing fy: a five-star base read as a dark disc, a column, an upholstered seat and back. */
    const officeChair = (x: number, y: number, fy: 1 | -1) => {
      disc(x, y, 0.3, 0.04, 0.035, "darkSteel", "chair-base");
      cyl(x, y, 0.028, 0.08, 0.34, "darkSteel", "chair-column");
      put(x, y, 0.5, 0.48, 0.42, 0.08, "upholstery", "chair-seat", 0.035);
      put(x, y - fy * 0.24, 0.46, 0.06, 0.56, 0.5, "upholstery", "chair-back", 0.03);
      for (const lx of [-0.26, 0.26]) put(x + lx, y + fy * 0.02, 0.05, 0.3, 0.6, 0.03, "darkSteel", "chair-arm", 0.012);
    };
    /** A blue stacking crate, open on top: a floor and four walls, product showing inside when `full`. */
    const crate = (x: number, y: number, yb: number, w = 0.6, d = 0.4, hh = 0.28, full = true) => {
      const t = 0.022;
      put(x, y, w, d, yb, 0.03, "crateBlue", "crate", 0.01);
      for (const s of [-1, 1]) {
        put(x + s * (w / 2 - t / 2), y, t, d, yb, hh, "crateBlue", "crate", 0.008);
        put(x, y + s * (d / 2 - t / 2), w - 2 * t, t, yb, hh, "crateBlue", "crate", 0.008);
      }
      if (full) for (let k = 0; k < 5; k++) put(x, y - d / 2 + t + (k + 0.5) * ((d - 2 * t) / 5), w - 2 * t - 0.02, 0.055, yb + 0.03, hh * 0.55, "sausage", "crate-product", 0.026);
    };
    if (kit === "production" || kit === "slicing" || kit === "butchery") {
      // stainless worktables along both long walls, a long table down the middle with the room's machine on it
      for (const s of [1, -1] as const) alongLong(s, 0.7, 1.8, 0.1, (x, y) => {
        table(x, y, 1.8, 0.7);
        crate(x - 0.45, y, 0.9);
        if (kit !== "production") put(x + 0.35, y, 0.5, 0.35, 0.9, 0.015, "ceramic", "cutting-board", 0.01);
      });
      let placed = false;
      island(1.0, (x0, len0) => {
        placed = true;
        // production keeps the island's far 1.6 m for the bowl cutter, which stands on the floor
        const x = kit === "production" ? x0 - 0.8 : x0, len = kit === "production" ? len0 - 1.6 : len0;
        if (len > 1.2) table(x, 0, len, 1.0);
        if (kit === "slicing") for (let k = 0; k < Math.floor(len / 1.6); k++) {
          const sx = x - len / 2 + 0.8 + k * 1.6;
          put(sx, 0, 0.62, 0.5, 0.9, 0.22, "stainless", "slicer-base", 0.05);
          put(sx + 0.05, 0.05, 0.42, 0.06, 1.12, 0.32, "stainless", "slicer-blade-guard", 0.03);
          put(sx - 0.12, -0.1, 0.3, 0.28, 1.12, 0.06, "stainless", "slicer-carriage", 0.02);
          worker(sx, -0.95, 1);
        }
        if (kit === "butchery") for (let k = 0; k < Math.floor(len / 2.0); k++) {
          const bx = x - len / 2 + 1.0 + k * 2.0;
          put(bx, 0, 0.9, 0.6, 0.9, 0.04, "ceramic", "cutting-board", 0.012);
          crate(bx + 0.7, 0.15, 0.9);
          worker(bx, -0.95, 1);
        }
        if (kit === "production") {
          // a bowl cutter on the floor past the table's end: a rounded stainless body on feet, the open bowl with meat in it,
          // the knife hood over its back half, the control box on a post
          const bx = x0 + len0 / 2 - 0.75;
          put(bx, 0, 1.2, 0.95, 0.08, 0.8, "stainless", "cutter-body", 0.07);
          for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) disc(bx + lx * 0.5, ly * 0.38, 0.05, 0, 0.08, "rubber", "cutter-foot");
          cyl(bx, 0, 0.46, 0.88, 0.2, "stainless", "cutter-bowl");
          cyl(bx, 0, 0.4, 1.0, 0.09, "sausage", "cutter-meat");
          cyl(bx, 0, 0.12, 1.0, 0.14, "stainless", "cutter-hub");
          put(bx + 0.2, 0, 0.45, 0.75, 1.0, 0.24, "stainless", "cutter-hood", 0.1);
          put(bx - 0.55, 0.52, 0.06, 0.06, 0.88, 0.5, "stainless", "cutter-post", 0.015);
          put(bx - 0.55, 0.52, 0.32, 0.12, 1.38, 0.24, "whiteboard", "cutter-controls", 0.025);
          crate(bx - 0.1, -0.85, 0, 0.6, 0.4, 0.28);
          crate(bx - 0.1, -0.85, 0.3, 0.6, 0.4, 0.28);
          worker(bx - 0.95, 0.75, -1);
          if (len > 1.2) { crate(x - len / 4, 0.1, 0.9); worker(x - len / 4, -0.95, 1); worker(x + len / 4, 0.95, -1); }
        }
      });
      if (!placed) worker(0, 0, doorSide === "y+" ? -1 : 1);
    } else if (kit === "packing") {
      // a conveyor down the middle with a wrapper at its far end, packing tables on the walls
      for (const s of [1, -1] as const) alongLong(s, 0.7, 1.8, 0.1, (x, y) => { table(x, y, 1.8, 0.7); crate(x - 0.4, y, 0.9); crate(x + 0.3, y, 0.9); });
      island(0.7, (x, len) => {
        for (let k = 0; k <= Math.floor(len / 1.2); k++) { const lx = x - len / 2 + 0.1 + k * Math.min(1.2, len - 0.2); for (const ly of [-0.28, 0.28]) put(lx, ly, 0.05, 0.05, 0, 0.82, "stainless", "conveyor-leg", 0.01); }
        for (const ly of [-0.33, 0.33]) put(x, ly, len, 0.06, 0.74, 0.16, "stainless", "conveyor-side", 0.015);
        put(x, 0, len - 0.04, 0.58, 0.84, 0.03, "rubber", "belt", 0.012);
        for (let k = 0; k < Math.floor(len / 0.9); k++) crate(x - len / 2 + 0.6 + k * 0.9, 0, 0.87, 0.4, 0.3, 0.12);
        const wx = doorSide === "x+" ? x - len / 2 + 0.6 : x + len / 2 - 0.6;
        put(wx, 0, 1.2, 1.1, 0, 1.7, "stainless", "wrapper", 0.07);
        put(wx, 0.56, 0.4, 0.04, 1.2, 0.3, "screen", "wrapper-panel", 0.015);
        worker(x, -0.9, 1); worker(x - 1.6, 0.9, -1);
      });
    } else if (kit === "trolleys") {
      // smoke trolleys out of the oven: a stainless frame on castors, rods across it, sausages hanging from each rod
      for (const s of [1, -1] as const) alongLong(s, 1.0, 1.0, 0.3, (x, y) => {
        for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          put(x + lx * 0.47, y + ly * 0.47, 0.035, 0.035, 0.14, 1.86, "stainless", "trolley-post", 0.008);
          put(x + lx * 0.42, y + ly * 0.42, 0.05, 0.1, 0, 0.12, "rubber", "castor", 0.02);
        }
        for (const yb of [0.12, 1.98]) put(x, y, 0.98, 0.98, yb, 0.03, "stainless", "trolley-frame", 0.008);
        for (const lv of [1.9, 1.45, 1.0, 0.55]) for (const ry of [-0.33, -0.11, 0.11, 0.33]) {
          put(x, y + ry, 0.95, 0.014, lv, 0.014, "stainless", "rod", 0);
          for (const sx of [-0.33, -0.11, 0.11, 0.33]) cyl(x + sx, y + ry, 0.02, lv - 0.34, 0.34, "sausage", "sausage");
        }
      });
      worker(0, 0, doorSide === "y+" ? 1 : -1);
    } else if (kit === "cold") {
      // stainless shelving on both long walls (posts + 4 shelves) stacked with crates, the cooler high on the far short wall
      for (const s of [1, -1] as const) {
        if (doorSide === (s > 0 ? "y+" : "y-")) continue;
        const x0 = -A + (doorSide === "x-" ? 1.6 : 0.2), x1 = A - (doorSide === "x+" ? 1.6 : 0.2), d = 0.6, y = s * (B - d / 2 - 0.05);
        const bays = Math.floor((x1 - x0) / 1.3);
        for (let k = 0; k < bays; k++) {
          const x = x0 + k * 1.3 + 0.65;
          if (!free(x, y, 1.3, d)) continue;
          for (let lv = 0; lv < 4; lv++) {
            const yb = 0.25 + lv * 0.5;
            put(x, y, 1.28, d, yb, 0.03, "stainless", "shelf", 0.006);
            if ((k + lv) % 4 !== 3) for (const cx of [-0.32, 0.32]) crate(x + cx, y, yb + 0.03, 0.58, 0.4, 0.3);
          }
          for (const px of [-0.63, 0.63]) for (const py of [-d / 2 + 0.02, d / 2 - 0.02]) put(x + px, y + py, 0.035, 0.035, 0, 2.05, "stainless", "post", 0.008);
        }
      }
      const fx = doorSide === "x+" ? -A + 0.35 : A - 0.35, fw = Math.min(1.6, 2 * B - 0.6);
      put(fx, 0, 0.55, fw, h - 0.75, 0.55, "stainless", "cooler", 0.04);
      for (const fy of [-fw / 4, fw / 4]) put(fx + (doorSide === "x+" ? 0.28 : -0.28), fy, 0.02, 0.4, h - 0.68, 0.4, "rubber", "cooler-fan", 0.19);
    } else if (kit === "store") {
      // pallet racking in rows along the room, 3 m aisles: blue uprights, orange beams, wrapped loads on timber pallets
      const rackH = Math.min(h - 0.6, 6), lv = rackH > 3.2 ? [0, 1.6, 3.2].filter((l) => l + 1.4 <= rackH) : [0, 1.5];
      const dD = 1.1, rows: number[] = [];
      for (let y = -B + 0.1 + dD / 2; y <= B - 0.1 - dD / 2; y += dD + 3.0) rows.push(y);
      let r0 = 0;
      for (const y of rows) {
        if ((doorSide === "y+" && y > B - 3.5) || (doorSide === "y-" && y < -B + 3.5)) continue;
        const x0 = -A + (doorSide === "x-" ? 3.0 : 0.6), x1 = A - (doorSide === "x+" ? 3.0 : 0.6);
        const bays = Math.floor((x1 - x0) / 2.7);
        for (let k = 0; k < bays; k++) {
          const x = x0 + k * 2.7 + 1.35;
          if (!free(x, y, 2.7, dD)) continue;
          for (const px of [-1.32, 1.32]) for (const py of [-dD / 2 + 0.04, dD / 2 - 0.04]) put(x + px, y + py, 0.08, 0.06, 0, rackH, "crateBlue", "upright", 0.01);
          for (const l of lv) {
            if (l > 0) for (const py of [-dD / 2 + 0.04, dD / 2 - 0.04]) put(x, y + py, 2.6, 0.05, l - 0.12, 0.12, "safetyOrange", "beam", 0.01);
            for (const q of [-0.65, 0.65]) {
              if ((k + r0 + l * 3 + (q > 0 ? 1 : 0)) % 5 === 4) continue; // an empty place here and there
              put(x + q, y, 1.2, 1.0, l, 0.14, "timber", "pallet", 0.004);
              put(x + q, y, 1.12, 0.94, l + 0.14, 1.05, "wrapFilm", "load", 0.05);
            }
          }
        }
        r0++;
      }
      worker(0, rows.length > 1 ? (rows[0]! + rows[1]!) / 2 : 0, 1);
    } else if (kit === "office") {
      // desks on the long walls: an oak top on steel side frames, a drawer unit, a screen on its stand, a keyboard, an office chair
      for (const s of [1, -1] as const) alongLong(s, 0.75, 1.5, 0.3, (x, y) => {
        put(x, y, 1.5, 0.75, 0.72, 0.03, "floorOak", "desk", 0.008);
        for (const lx of [-0.7, 0.7]) put(x + lx, y, 0.05, 0.65, 0, 0.72, "darkSteel", "desk-frame", 0.01);
        put(x - 0.45, y, 0.42, 0.6, 0, 0.6, "cabinet", "desk-drawers", 0.01);
        put(x, y + s * 0.22, 0.6, 0.03, 0.9, 0.36, "screen", "monitor", 0.012);
        cyl(x, y + s * 0.25, 0.02, 0.75, 0.15, "darkSteel", "monitor-stand");
        disc(x, y + s * 0.25, 0.1, 0.75, 0.01, "darkSteel", "monitor-foot");
        put(x, y - s * 0.05, 0.44, 0.14, 0.75, 0.02, "darkSteel", "keyboard", 0.006);
        officeChair(x, y - s * 0.7, s);
      });
    } else if (kit === "dining") {
      // a kitchenette on one long wall (cabinets, worktop, sink, a fridge), tables with chairs round them
      const kl = Math.min(4.0, 2 * A - 1.0);
      alongLong(1, 0.65, kl, 0, (x, y) => {
        put(x - 0.4, y, kl - 0.8, 0.62, 0.1, 0.78, "cabinet", "counter", 0.01);
        put(x - 0.4, y, kl - 0.8, 0.65, 0.88, 0.035, "worktop", "counter-top", 0.008);
        put(x - 0.4, y, 0.55, 0.42, 0.885, 0.035, "stainless", "sink", 0.08);
        put(x + kl / 2 - 0.36, y, 0.68, 0.65, 0, 1.85, "stainless", "fridge", 0.03);
      });
      const tx0 = -A + (doorSide === "x-" ? 2.0 : 1.0), tx1 = A - (doorSide === "x+" ? 2.0 : 1.0);
      for (let x = tx0 + 1.0; x + 1.0 <= tx1; x += 2.6) for (let y = -B + 1.4; y + 1.4 <= B - 1.2; y += 2.2) {
        if ((doorSide === "y+" && y > B - 2.2) || (doorSide === "y-" && y < -B + 2.2) || !free(x, y, 1.8, 2.0)) continue;
        put(x, y, 1.6, 0.8, 0.72, 0.03, "timber", "dining-top", 0.01);
        for (const lx of [-0.72, 0.72]) for (const ly of [-0.33, 0.33]) put(x + lx, y + ly, 0.04, 0.04, 0, 0.72, "darkSteel", "table-leg", 0.01);
        for (const cx of [-0.45, 0.45]) { chair(x + cx, y - 0.62, 1); chair(x + cx, y + 0.62, -1); }
      }
    } else if (kit === "lockers") {
      // a row of lockers (doors with handles and vents) on one long wall, a slatted bench in front
      for (const s of [1, -1] as const) {
        if (doorSide === (s > 0 ? "y+" : "y-")) continue;
        alongLong(s, 0.5, 0.4, 0.0, (x, y) => {
          put(x, y, 0.385, 0.48, 0.1, 1.8, "cabinet", "locker", 0.006);
          put(x + 0.13, y - s * 0.245, 0.025, 0.02, 1.0, 0.12, "darkSteel", "locker-handle", 0.006);
          for (const vy of [1.62, 1.68]) put(x, y - s * 0.243, 0.2, 0.01, vy, 0.015, "darkSteel", "locker-vent", 0);
        });
        alongLong(s, 0.35, 1.6, 0.3, (x, y) => {
          const by = y - s * 0.75;
          put(x, by, 1.6, 0.35, 0.42, 0.04, "timber", "bench-seat", 0.012);
          for (const lx of [-0.7, 0.7]) put(x + lx, by, 0.04, 0.3, 0, 0.42, "darkSteel", "bench-leg", 0.008);
        });
        break;
      }
    }
    const items = prims.length - n0;
    if (items) { ET.built++; ET.why.push(`"${name}"${from ? ` (${from})` : ""}: ${kit}, ${items} parts (proposal, not on the sheet)`); }
    else { ET.dropped++; ET.why.push(`"${name}": ${kit} — no room left clear of the door / ovens`); }
    out.push({ name, kit, ...(from ? { from } : {}), items });
  }
  return out;
}

function storey(pcs: DxfPiece[], drawing: DxfDrawing, sh: { shell: Shell; extra: P2[][] }, tag: string, y0: number, h: number, isTop: boolean, under: P2[] | null) {
  const s = sh.shell;
  // floor slab
  prims.push({ type: "prism", ring: s.outer, y0: y0 - SLAB, y1: y0, material: "slab", tag: `${tag}:slab` });
  prims.push({ type: "prism", ring: s.outer, y0: y0, y1: y0 + 0.01, material: "epoxy", tag: `${tag}:floor` });
  // shell with its doors
  const shellSegs = segs(s.mid, true);
  const gapsBySeg = shellSegs.map(() => [] as Gap[]);
  if (tag === "ground") for (const d of doorPairs) {
    let best = -1, bd = 1.5, bs = 0;
    shellSegs.forEach(([a, b], i) => { const q = projOn(d, a, b); if (q.inSeg && q.d < bd) { bd = q.d; best = i; bs = q.s; } });
    if (best >= 0) {
      // swings in: to the side of the wall the building's middle is on
      const [a, b] = shellSegs[best]!; const cx = s.mid.reduce((q, v) => q + v[0], 0) / s.mid.length, cz = s.mid.reduce((q, v) => q + v[1], 0) / s.mid.length;
      const side = ((b[0] - a[0]) * (cz - a[1]) - (b[1] - a[1]) * (cx - a[0])) > 0 ? 1 : -1;
      gapsBySeg[best]!.push({ s: bs, w: 2.0, leaf: "darkSteel", swing: side as 1 | -1 }); T("ground entrance door leaf").built += 2;
    }
    else { T("ground entrance door leaf").dropped += 2; T("ground entrance door leaf").why.push(`double door at ${d[0].toFixed(1)},${d[1].toFixed(1)}: on no shell wall (not on this storey's outline)`); }
  }
  // ---- PROPOSAL (the user's yes, 2026-11-10: "כן, תציע"): truck doors and windows the sheets do not draw ----
  /** the windows put on each shell wall (along-wall intervals), so the high band leaves them be */
  const winBySeg = shellSegs.map(() => [] as Array<[number, number]>);
  const PT = T(`${tag} proposal: truck door`);
  const truckAt = (seg: number, at: number, w: number, hh: number, why: string) => {
    const L = Math.hypot(shellSegs[seg]![1][0] - shellSegs[seg]![0][0], shellSegs[seg]![1][1] - shellSegs[seg]![0][1]);
    const sAt = Math.max(w / 2 + 0.6, Math.min(L - w / 2 - 0.6, at));
    const drawn = gapsBySeg[seg]!.find((g) => Math.abs(g.s - sAt) < Math.max((g.w + w) / 2 + 0.5, 4.5)); // a label stands beside its door, up to ~4 m off (option 2's raw-materials label: 3.6 m)
    if (drawn) {
      // the sheet draws a door where its truck label is: that door is the truck door. A door-sized leaf is no loading door (the user,
      // 2026-11-10: "the trucks have no loading doors — add what is needed"): widened round its middle to a 3.2 m × 3.6 m sectional
      // dock door, with a dock seal and bumpers, a canopy over it
      const w0 = drawn.w;
      drawn.w = Math.max(drawn.w, 3.2); drawn.h = Math.max(drawn.h ?? DOOR_H, Math.min(3.6, hh)); drawn.roll = true; drawn.leaf = "metal"; delete drawn.swing;
      canopy(seg, drawn.s, drawn.w, drawn.h);
      PT.merged++; PT.why.push(`${why}: the sheet's own door there (${w0.toFixed(1)} m) made the loading door — ${drawn.w.toFixed(1)} × ${drawn.h.toFixed(1)} m sectional door, dock seal, bumpers, canopy (proposal)`); return;
    }
    gapsBySeg[seg]!.push({ s: sAt, w, h: hh, roll: true, leaf: "metal" });
    canopy(seg, sAt, w, hh);
    PT.built++; PT.why.push(`${why} (proposal, not on the sheet)`);
  };
  // a steel canopy over a truck door, 1.5 m out
  function canopy(seg: number, sAt: number, w: number, hh: number) {
    const [a, b] = shellSegs[seg]!; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    const cx = s.mid.reduce((q, v) => q + v[0], 0) / s.mid.length, cz = s.mid.reduce((q, v) => q + v[1], 0) / s.mid.length;
    const inSide = ((b[0] - a[0]) * (cz - a[1]) - (b[1] - a[1]) * (cx - a[0])) > 0 ? 1 : -1;
    const nx = uz * inSide, nz = -ux * inSide; // outward
    box([a[0] + ux * sAt + nx * (s.t / 2 + 0.75), y0 + hh + 0.35, a[1] + uz * sAt + nz * (s.t / 2 + 0.75)], [w + 1.0, 0.18, 1.5], -Math.atan2(uz, ux), "darkSteel", `${tag}:proposal:canopy`);
    // the dock seal: black rubber pads round the opening, 0.45 m out (the truck's box backs into them), and two bumpers at bed height
    const at = (along: number, out: number, y: number): [number, number, number] => [a[0] + ux * (sAt + along) + nx * (s.t / 2 + out), y, a[1] + uz * (sAt + along) + nz * (s.t / 2 + out)];
    const rot = -Math.atan2(uz, ux);
    for (const sd of [-1, 1]) box(at(sd * (w / 2 + 0.2), 0.225, y0 + 0.9 + hh / 2), [0.4, hh - 0.6, 0.45], rot, "rubber", `${tag}:proposal:dock-seal`);
    box(at(0, 0.225, y0 + hh + 0.05), [w + 0.8, 0.5, 0.45], rot, "rubber", `${tag}:proposal:dock-seal`);
    for (const sd of [-1, 1]) box(at(sd * 0.9, 0.08, y0 + 1.0), [0.25, 0.45, 0.16], rot, "rubber", `${tag}:proposal:dock-bumper`);
    docks.push({ p: [a[0] + ux * sAt + nx * (s.t / 2), a[1] + uz * sAt + nz * (s.t / 2)], n: [nx, nz], y: tag === "ground" ? null : y0, tag });
  }
  // the sheet's truck labels ("כניסת חומרי גלם", "יציאת תצ"ג", "חניית משאיות"): a 4 m door on the shell wall nearest each
  for (const lb of pcs.filter((p) => p.text && /חומרי גלם|יציאת תצ"ג|חניית משאיות/.test(p.text) && (p.height ?? 0) >= 60 && !/איחסון/.test(p.text))) {
    const q = M(lb.at!);
    PT.read++;
    let best = -1, bd = 14, bs = 0;
    shellSegs.forEach(([a, b], i) => { const pr = projOn(q, a, b); if (pr.inSeg && pr.d < bd) { bd = pr.d; best = i; bs = pr.s; } });
    if (best < 0) { PT.dropped++; PT.why.push(`"${lb.text}": no shell wall within 14 m`); continue; }
    if (/חניית משאיות/.test(lb.text!)) { PT.dropped++; PT.why.push(`"${lb.text}": marks the truck yard, not a door`); continue; }
    { const sd = sideOf(q); truckAt(best, bs, 4.0, Math.min(4.2, h - 0.5), `"${lb.text}", ${sd > 0 ? "raw-material side" : sd < 0 ? "finished-product side" : "on the oven row line"}`); }
  }
  // a storey beside a truck terrace (option 1, first floor): two doors on the longest wall that faces it
  for (const r of sh.extra) {
    PT.read++;
    let best = -1, bl = 0;
    shellSegs.forEach(([a, b], i) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      const outside = [[m[0] + nx * 1.5, m[1] + nz * 1.5], [m[0] - nx * 1.5, m[1] - nz * 1.5]].find((p) => !inside(p as P2, s.mid)) as P2 | undefined;
      if (outside && inside(outside, r) && L > bl) { bl = L; best = i; }
    });
    if (best < 0) { PT.dropped++; PT.why.push("terrace: no shell wall faces it"); continue; }
    // one door per side (the architect: the raw-material truck comes to the raw side, the finished-product truck to the other;
    // no mixing): each in the middle of its side's part of the wall; with no oven row, at the thirds
    const [wa, wb] = shellSegs[best]!; const ux = (wb[0] - wa[0]) / bl, uz = (wb[1] - wa[1]) / bl;
    let cross = -1;
    if (sep) { const den = ux * -sep.d[1] + uz * sep.d[0]; if (Math.abs(den) > 1e-6) cross = -((wa[0] - sep.p[0]) * -sep.d[1] + (wa[1] - sep.p[1]) * sep.d[0]) / den; }
    const at = cross > 4 && cross < bl - 4 ? [cross / 2, (cross + bl) / 2] : [bl / 3, (2 * bl) / 3];
    for (const sA of at) {
      const sd = sideOf([wa[0] + ux * sA, wa[1] + uz * sA]);
      truckAt(best, sA, 4.0, Math.min(3.6, h - 0.4), `terrace truck door, ${sd > 0 ? "raw-material side" : sd < 0 ? "finished-product side" : "no oven row"}`);
    }
  }
  shellSegs.forEach(([a, b], i) => {
    // below the floor: the plinth down to the ground under the wall (the slope falls away from the building); an upper storey's base is its slab
    const lo = tag === "ground" ? Math.min(-SLAB, ...[0, 0.25, 0.5, 0.75, 1].map((k) => hAt(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))) - 0.2 : y0 - SLAB;
    // industrial colours (the client's ask): a concrete base, grey metal cladding, a dark coping on the parapet
    const topY = y0 + h + (isTop ? PARAPET : 0);
    wall(a, b, s.t, lo, y0 + 0.9, "concrete", `${tag}:shell:base`, gapsBySeg[i]!, y0);
    wall(a, b, s.t, y0 + 0.9, topY - (isTop ? 0.15 : 0), "metal", `${tag}:shell`, gapsBySeg[i]!, y0);
    if (isTop) wall(a, b, s.t + 0.06, topY - 0.15, topY, "darkSteel", `${tag}:coping`);
  });
  // a ground storey that the next storey does not cover: the roof there takes a parapet (the shell above the slab)
  // — not on the edge the raised truck run (option 1) rests on: the terrace and the run are one floor there, the trucks drive across
  const byRun = (a: P2, b: P2) => sandF.length > 0 && hiddenG.length > 0 && ringDist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], hiddenG[0]!) < 2.5;
  if (under === null && !isTop) for (const [a, b] of shellSegs) { if (byRun(a, b)) continue; wall(a, b, s.t, y0 + h, y0 + h + PARAPET + SLAB - 0.15, "metal", `${tag}:parapet`); wall(a, b, s.t + 0.06, y0 + h + PARAPET + SLAB - 0.15, y0 + h + PARAPET + SLAB, "darkSteel", `${tag}:coping`); }
  // the extra 00-WL outline (option 1 first floor: the truck terrace): a parapet round it
  // — open along the side the raised truck run (the ground sheet's dashed outline) meets: the trucks drive off the terrace onto it
  // and on down to the exit (closed all round, they had no way out — the user, 2026-11-10)
  for (const r of sh.extra) {
    T(`${tag} shell polyline`).built++;
    for (const [a, b] of segs(r, true)) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1));
      let s0 = -1;
      const flush = (s1: number) => { if (s0 >= 0) { wall([a[0] + ((b[0] - a[0]) * s0) / n, a[1] + ((b[1] - a[1]) * s0) / n], [a[0] + ((b[0] - a[0]) * s1) / n, a[1] + ((b[1] - a[1]) * s1) / n], 0.25, y0, y0 + 1.1, "slab", `${tag}:terrace-parapet`); s0 = -1; } };
      for (let k = 0; k < n; k++) {
        const m: P2 = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n];
        // and none against the storey's own wall (the truck doors open there)
        const open = (sandF.length > 0 && hiddenG.length > 0 && (inside(m, hiddenG[0]!) || ringDist(m, hiddenG[0]!) < 2.5)) || ringDist(m, s.outer) < 0.6;
        if (open) flush(k); else if (s0 < 0) s0 = k;
      }
      flush(n);
    }
  }
  // roof / ceiling slab
  if (isTop) prims.push({ type: "prism", ring: s.outer, y0: y0 + h, y1: y0 + h + SLAB, material: "concrete", tag: `${tag}:roof` });
  else prims.push({ type: "prism", ring: s.outer, y0: y0 + h, y1: y0 + h + 0.001, material: "ceiling", tag: `${tag}:ceiling-under` });

  // rooms: closed 00-WL pnimi rectangles ("each big cube is a room"); open polylines are corridor walls
  const roomP = pcs.filter((p) => p.layer === "00-WL pnimi" && p.pts && p.closed && p.pts.length >= 4);
  const wallP = pcs.filter((p) => p.layer === "00-WL pnimi" && p.pts && !p.closed);
  const RT = T(`${tag} room box`), WT = T(`${tag} corridor wall`);
  RT.read = roomP.length; WT.read = wallP.length;
  const rooms: P2[][] = [];
  for (const p of roomP) {
    const r = ringOf(p.pts!);
    const dup = rooms.find((q) => q.length === r.length && q.every((v, i) => Math.hypot(v[0] - r[i]![0], v[1] - r[i]![1]) < 0.1));
    if (dup) { RT.merged++; continue; }
    rooms.push(r);
  }
  // corridor walls: an open polyline drawn twice, a few cm apart, is one wall
  const cw: P2[][] = [];
  for (const p of wallP) {
    const r = p.pts!.map(M);
    const twin = cw.find((q) => q.length === r.length && q.every((v, i) => Math.hypot(v[0] - r[i]![0], v[1] - r[i]![1]) < 0.35));
    if (twin) { WT.merged++; continue; }
    cw.push(r);
  }
  // (built after the room walls: where one runs along a room's wall it is not built a second time — below)
  // a room's door: on the edge whose outside, 0.6 m out, is in the hall (inside the shell, in no room that does not hold this one)
  const labels = pcs.filter((p) => p.text && p.layer === "0" && (p.height ?? 0) <= 60).map((p) => ({ at: M(p.at!), text: p.text!.replace("q", "/") }));
  const roomsOut: Array<{ name: string; areaM2: number; door: string; doorEdge: number; at: [number, number]; ring: Array<[number, number]> }> = [];
  const roomInfo: RoomInfo[] = [];
  const obstacles: P2[][] = [];
  const roomEdges: Array<{ a: P2; b: P2; ri: number; c: P2; door: { w: number; leaf: BuildingMaterial } | null }> = [];
  for (const r of rooms) {
    const ar = Math.abs(area(r));
    const holders = rooms.filter((q) => q !== r && r.every((v) => inside(v, q) || Math.abs(area(q)) > ar && segs(q, true).some(([a, b]) => { const pr = projOn(v, a, b); return pr.inSeg && pr.d < 0.05; })) && Math.abs(area(q)) > ar);
    const others = rooms.filter((q) => q !== r && !holders.includes(q));
    const cx = r.reduce((a, v) => a + v[0], 0) / r.length, cz = r.reduce((a, v) => a + v[1], 0) / r.length;
    const lab = labels.filter((l) => inside(l.at, r)).sort((a, b) => Math.hypot(a.at[0] - cx, a.at[1] - cz) - Math.hypot(b.at[0] - cx, b.at[1] - cz))[0];
    const name = lab?.text ?? "";
    const cold = /קירור|הקפאה|הפשרה/.test(name);
    const sg = segs(r, true);
    const cand = sg.map(([a, b], i) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const nxv = -(b[1] - a[1]) / L, nzv = (b[0] - a[0]) / L;
      const o1: P2 = [m[0] + nxv * 0.6, m[1] + nzv * 0.6], o2: P2 = [m[0] - nxv * 0.6, m[1] - nzv * 0.6];
      const outP = inside(o1, r) ? o2 : o1;
      const hall = inside(outP, s.mid) && !others.some((q) => inside(outP, q));
      const intoRoom = inside(outP, s.mid) && !hall;
      return { i, L, hall, intoRoom };
    });
    const pick = cand.filter((c) => c.hall).sort((a, b) => b.L - a.L)[0] ?? cand.filter((c) => c.intoRoom).sort((a, b) => b.L - a.L)[0];
    const w = cold ? 1.6 : 1.1;
    // the edges are built after every room is read: a wall two rooms share is one wall (below)
    sg.forEach(([a, b], i) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      roomEdges.push({ a, b, ri: rooms.indexOf(r), c: [cx, cz], door: pick && pick.i === i && L > w + 0.4 ? { w, leaf: cold ? "metal" : "frame" } : null });
    });
    RT.built++;
    // PROPOSAL: windows only where people sit (offices, dining, coffee corner, lobby) and their room meets the shell;
    // the production, cold and storage rooms stay closed, as a food plant keeps them (hygiene, temperature)
    if (/משרד|אוכל|קפה|מבואה|הנהלה/.test(name)) {
      const WT2 = T(`${tag} proposal: window`);
      for (const [a, b] of sg) {
        const si = shellSegs.findIndex(([p, q]) => projOn(a, p, q).d < 0.6 && projOn(b, p, q).d < 0.6);
        if (si < 0) continue;
        const [p, q] = shellSegs[si]!;
        const sa = projOn(a, p, q).s, sb = projOn(b, p, q).s;
        const lo2 = Math.min(sa, sb) + 0.6, hi2 = Math.max(sa, sb) - 0.6;
        if (hi2 - lo2 < 1.0) continue;
        if (gapsBySeg[si]!.some((g) => g.s + g.w / 2 + 0.3 > lo2 && g.s - g.w / 2 - 0.3 < hi2)) { WT2.dropped++; WT2.why.push(`"${name}": a door on that wall`); continue; }
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L;
        // panes of up to 1.8 m with 0.12 m mullions, sill 1.0 m, head 2.4 m
        const n = Math.ceil((hi2 - lo2) / 1.8), pw = (hi2 - lo2 - (n - 1) * 0.12) / n;
        for (let k = 0; k < n; k++) {
          const c = lo2 + k * (pw + 0.12) + pw / 2;
          box([p[0] + ux * c, y0 + 1.7, p[1] + uz * c], [pw, 1.4, s.t + 0.04], -Math.atan2(uz, ux), "glass", `${tag}:proposal:window`);
        }
        box([p[0] + ux * (lo2 + hi2) / 2, y0 + 1.7, p[1] + uz * (lo2 + hi2) / 2], [hi2 - lo2 + 0.12, 1.52, s.t + 0.02], -Math.atan2(uz, ux), "frame", `${tag}:proposal:window-frame`);
        winBySeg[si]!.push([lo2 - 0.3, hi2 + 0.3]);
        WT2.read++; WT2.built++; WT2.why.push(`"${name}" (proposal, not on the sheet)`);
      }
    }
    const door =!pick ? "none: every edge meets the shell" : pick.hall ? `to the hall, ${w} m${cold ? " (cold-store door)" : ""}` : `into the next room, ${w} m`;
    if (!pick) RT.why.push(`room "${name}" ${ar.toFixed(1)} m²: no edge opens inside the building — no door added`);
    roomsOut.push({ name, areaM2: Number(ar.toFixed(1)), door, doorEdge: pick ? pick.i : -1, at: [Number(cx.toFixed(1)), Number(cz.toFixed(1))], ring: r.map((v) => [Number(v[0].toFixed(2)), Number(v[1].toFixed(2))] as [number, number]) });
    roomInfo.push({ r, name, doorI: pick ? pick.i : -1, cx, cz, ar });
  }
  // ---- the room walls: one wall between two rooms (the user, 2026-11-10: "where a wall stands beside a wall — not two walls, one
  // wall between the two rooms"). The sheet draws each room as its own closed box, so two rooms side by side gave two walls with a
  // slot between. Along each edge: where another room's edge runs parallel within 0.8 m, the lower-numbered room builds one wall on
  // the middle line, as thick as both faces apart, and the other builds nothing there; where the edge runs along the shell, the
  // shell's wall serves and nothing is built. Each door is put back in whichever wall now stands in its place.
  {
    const RW = T(`${tag} room wall (shared / along the shell)`);
    const SNAP = 0.8;
    type Piece = { a: P2; b: P2; t: number; gaps: Gap[] };
    const pieces: Piece[] = [];
    let shared = 0;
    roomEdges.forEach((E) => {
      const L = Math.hypot(E.b[0] - E.a[0], E.b[1] - E.a[1]); if (L < 0.05) return;
      const u: P2 = [(E.b[0] - E.a[0]) / L, (E.b[1] - E.a[1]) / L], nv: P2 = [-u[1], u[0]];
      const covers: Array<{ t0: number; t1: number; own: boolean; d: number; shell?: boolean }> = [];
      const consider = (p: P2, q: P2, own: boolean | null) => {
        const LL = Math.hypot(q[0] - p[0], q[1] - p[1]); if (LL < 0.05) return;
        const v: P2 = [(q[0] - p[0]) / LL, (q[1] - p[1]) / LL];
        if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 0.05) return;
        const d = (p[0] - E.a[0]) * nv[0] + (p[1] - E.a[1]) * nv[1], d2 = (q[0] - E.a[0]) * nv[0] + (q[1] - E.a[1]) * nv[1];
        if (Math.abs(d) > SNAP || Math.abs(d2) > SNAP) return;
        const tp = (p[0] - E.a[0]) * u[0] + (p[1] - E.a[1]) * u[1], tq = (q[0] - E.a[0]) * u[0] + (q[1] - E.a[1]) * u[1];
        const t0 = Math.max(0, Math.min(tp, tq)), t1 = Math.min(L, Math.max(tp, tq));
        if (t1 - t0 < 0.3) return;
        covers.push({ t0, t1, own: own ?? false, d: (d + d2) / 2, shell: own === null });
      };
      for (const F of roomEdges) if (F.ri !== E.ri) consider(F.a, F.b, E.ri < F.ri);
      for (const [p, q] of shellSegs) consider(p, q, null);
      const cuts = [...new Set([0, L, ...covers.flatMap((c) => [c.t0, c.t1])].map((x) => +x.toFixed(3)))].sort((x, y) => x - y);
      let cur: { t0: number; t1: number; off: number; th: number } | null = null;
      const flush = () => { if (!cur || cur.t1 - cur.t0 < 0.05) { cur = null; return; } const o = cur.off; pieces.push({ a: [E.a[0] + u[0] * cur.t0 + nv[0] * o, E.a[1] + u[1] * cur.t0 + nv[1] * o], b: [E.a[0] + u[0] * cur.t1 + nv[0] * o, E.a[1] + u[1] * cur.t1 + nv[1] * o], t: cur.th, gaps: [] }); cur = null; };
      for (let k = 0; k + 1 < cuts.length; k++) {
        const t0 = cuts[k]!, t1 = cuts[k + 1]!, tm = (t0 + t1) / 2;
        const here = covers.filter((c) => c.t0 <= tm && c.t1 >= tm);
        if (here.some((c) => !c.own)) {
          flush();
          // along the shell: the room's face of it lined white (the shell's metal skin showed dark from inside); not a wall in the plan
          if (here.some((c) => c.shell) && !here.some((c) => !c.own && !c.shell)) {
            // open over the high window band (h − 1.55 … h − 0.6), except in a cold room, which has none
            const pA: P2 = [E.a[0] + u[0] * t0, E.a[1] + u[1] * t0], pB: P2 = [E.a[0] + u[0] * t1, E.a[1] + u[1] * t1];
            if (/קירור|הקפאה|הפשרה/.test(roomInfo[E.ri]?.name ?? "")) wall(pA, pB, 0.03, y0, y0 + h, "whiteboard", `${tag}:lining`);
            else { wall(pA, pB, 0.03, y0, y0 + h - 1.6, "whiteboard", `${tag}:lining`); wall(pA, pB, 0.03, y0 + h - 0.55, y0 + h, "whiteboard", `${tag}:lining`); }
          }
          continue;
        }
        const mine = here.sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
        const off = mine ? mine.d / 2 : 0, th = mine ? Math.abs(mine.d) + ROOM_WALL : ROOM_WALL;
        if (cur && Math.abs(cur.off - off) < 0.01 && Math.abs(cur.th - th) < 0.01 && Math.abs(cur.t1 - t0) < 0.01) cur.t1 = t1;
        else { flush(); cur = { t0, t1, off, th }; }
        if (mine) shared += t1 - t0;
      }
      flush();
    });
    // the doors, into whatever wall stands in their place
    let doors = 0, lost = 0;
    for (const E of roomEdges) {
      if (!E.door) continue;
      const P: P2 = [(E.a[0] + E.b[0]) / 2, (E.a[1] + E.b[1]) / 2];
      const pc = pieces.map((pc) => { const pr = projOn(P, pc.a, pc.b); const LL = Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1]); return { pc, pr, LL }; })
        .filter(({ pr, LL }) => pr.d < SNAP && pr.s > E.door!.w / 2 + 0.05 && pr.s < LL - E.door!.w / 2 - 0.05).sort((x, y) => x.pr.d - y.pr.d)[0];
      if (!pc) { lost++; continue; }
      const { a, b } = pc.pc;
      const side = ((b[0] - a[0]) * (E.c[1] - a[1]) - (b[1] - a[1]) * (E.c[0] - a[0])) > 0 ? 1 : -1;
      pc.pc.gaps.push({ s: pc.pr.s, w: E.door.w, leaf: E.door.leaf, swing: side as 1 | -1 });
      doors++;
    }
    for (const pc of pieces) wall(pc.a, pc.b, pc.t, y0, y0 + h, "whiteboard", `${tag}:room`, pc.gaps);
    // the corridor walls (open 00-WL pnimi lines): the parts that run along a room's wall (parallel, within 0.8 m) are that wall
    // already — the room's wall stays (it carries the doors); the rest is built
    let cwIn = 0, cwOut = 0;
    for (const r of cw) {
      for (const [a, b] of segs(r, false)) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
        const u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nv: P2 = [-u[1], u[0]];
        const covered: Array<[number, number]> = [];
        for (const pc of pieces) {
          const LL = Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1]); if (LL < 0.05) continue;
          const v: P2 = [(pc.b[0] - pc.a[0]) / LL, (pc.b[1] - pc.a[1]) / LL];
          if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 0.05) continue;
          const d1 = (pc.a[0] - a[0]) * nv[0] + (pc.a[1] - a[1]) * nv[1], d2 = (pc.b[0] - a[0]) * nv[0] + (pc.b[1] - a[1]) * nv[1];
          if (Math.abs(d1) > SNAP || Math.abs(d2) > SNAP) continue;
          const t1 = (pc.a[0] - a[0]) * u[0] + (pc.a[1] - a[1]) * u[1], t2 = (pc.b[0] - a[0]) * u[0] + (pc.b[1] - a[1]) * u[1];
          const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(L, Math.max(t1, t2));
          if (hi - lo > 0.2) covered.push([lo, hi]);
        }
        covered.sort((x, y) => x[0] - y[0]);
        let t = 0;
        const put = (t0: number, t1: number) => { if (t1 - t0 < 0.3) return; wall([a[0] + u[0] * t0, a[1] + u[1] * t0], [a[0] + u[0] * t1, a[1] + u[1] * t1], ROOM_WALL, y0, y0 + h, "whiteboard", `${tag}:corridor-wall`); cwOut += t1 - t0; };
        for (const [lo, hi] of covered) { if (lo > t) put(t, lo); cwIn += Math.max(0, Math.min(hi, L) - Math.max(lo, t)); t = Math.max(t, hi); }
        if (t < L) put(t, L);
      }
      WT.built++;
    }
    if (cwIn > 0.1) WT.why.push(`${cwIn.toFixed(1)} m runs along a room's wall — that wall serves (one wall, not two); ${cwOut.toFixed(1)} m built`);
    const total = roomEdges.reduce((q, E) => q + Math.hypot(E.b[0] - E.a[0], E.b[1] - E.a[1]), 0), built = pieces.reduce((q, pc) => q + Math.hypot(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1]), 0);
    RW.read = roomEdges.length; RW.built = pieces.length; RW.merged = roomEdges.length;
    RW.why.push(`${total.toFixed(0)} m of room-box edges → ${built.toFixed(0)} m of wall: ${shared.toFixed(0)} m is one wall shared by two rooms (on the middle line, as thick as the two faces apart), ${(total - built).toFixed(0)} m left to the neighbour's wall or the shell's; ${doors} doors placed${lost ? `, ${lost} found no wall` : ""}`);
  }
  report[`${tag}Rooms`] = roomsOut;
  // PROPOSAL (the user, 2026-11-10: "the building has no doors and windows"): a high band of fixed glazing along the shell — daylight
  // over the work and the halls, no view in, no sill to keep clean — save where a cold room (קירור / הקפאה / הפשרה) lies behind the
  // wall, where a tall opening (truck door) stands, and where a room's own window already is
  {
    const WT3 = T(`${tag} proposal: high window`);
    const cold = roomInfo.filter((ri) => /קירור|הקפאה|הפשרה/.test(ri.name)).map((ri) => ri.r);
    const sill = h - 1.55, head = h - 0.6, STEP = 0.5;
    shellSegs.forEach(([p, q], si) => {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 2) return;
      const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L;
      const m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], nIn: P2 = inside([m[0] - uz * 0.8, m[1] + ux * 0.8], s.mid) ? [-uz, ux] : [uz, -ux];
      const ok = (t: number) => {
        const c: P2 = [p[0] + ux * t + nIn[0] * 0.8, p[1] + uz * t + nIn[1] * 0.8];
        if (!inside(c, s.mid)) return false;
        if (cold.some((r) => inside(c, r))) return false;
        if (gapsBySeg[si]!.some((g) => (g.h ?? DOOR_H) > sill - 0.4 && Math.abs(g.s - t) < g.w / 2 + 0.6)) return false;
        if (winBySeg[si]!.some(([w0, w1]) => t > w0 - 0.4 && t < w1 + 0.4)) return false;
        return true;
      };
      const runs3: Array<[number, number]> = []; let r0 = -1;
      for (let t = 0.8; t <= L - 0.8 + 1e-6; t += STEP) { if (ok(t)) { if (r0 < 0) r0 = t; } else if (r0 >= 0) { runs3.push([r0, t - STEP]); r0 = -1; } }
      if (r0 >= 0) runs3.push([r0, L - 0.8]);
      for (const [lo2, hi2] of runs3) {
        if (hi2 - lo2 < 1.5) continue;
        const n = Math.ceil((hi2 - lo2) / 2.4), pw = (hi2 - lo2 - (n - 1) * 0.12) / n;
        for (let k = 0; k < n; k++) { const c = lo2 + k * (pw + 0.12) + pw / 2; box([p[0] + ux * c, y0 + (sill + head) / 2, p[1] + uz * c], [pw, head - sill, s.t + 0.16], -Math.atan2(uz, ux), "glass", `${tag}:proposal:window`); }
        box([p[0] + ux * (lo2 + hi2) / 2, y0 + (sill + head) / 2, p[1] + uz * (lo2 + hi2) / 2], [hi2 - lo2 + 0.12, head - sill + 0.12, s.t + 0.12], -Math.atan2(uz, ux), "frame", `${tag}:proposal:window-frame`);
        WT3.read++; WT3.built++; WT3.why.push(`shell wall ${si}: a high band ${(hi2 - lo2).toFixed(1)} m at +${sill.toFixed(2)}…+${head.toFixed(2)} (proposal, not on the sheet)`);
      }
    });
    if (cold.length) WT3.why.push(`none where the ${cold.length} cold rooms lie behind the wall`);
  }
  // stairs, elevators, ovens: from their blocks
  const ST = T(`${tag} stairs/elevator`), OV = T(`${tag} oven`);
  for (const p of pcs.filter((p) => p.type === "INSERT")) {
    const nm = p.insert ?? "";
    if (nm === "stairs" || nm === "elevator") {
      ST.read++;
      const rs = insertRings(drawing, p).map(ringOf);
      if (!rs.length) { ST.dropped++; ST.why.push(`${nm}: block has no outline`); continue; }
      if (nm === "elevator") {
        const big = rs.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0]!;
        prims.push({ type: "prism", ring: big, y0, y1: y0 + h + (isTop ? 1.2 : 0), material: "concrete", tag: `${tag}:elevator` });
        obstacles.push(big);
      } else {
        // treads: the block's rectangles, rising along the run
        const treads = rs.filter((q) => Math.abs(area(q)) < 3);
        const c0 = treads.map((q) => [q.reduce((a, v) => a + v[0], 0) / q.length, q.reduce((a, v) => a + v[1], 0) / q.length] as P2);
        const ax0 = c0[0]!, ax1 = c0[c0.length - 1]!;
        const order = c0.map((c, i) => ({ i, s: (c[0] - ax0[0]) * (ax1[0] - ax0[0]) + (c[1] - ax0[1]) * (ax1[1] - ax0[1]) })).sort((a, b) => a.s - b.s);
        // a U stair (the block: two flights of treads side by side and a landing ring across their ends): the treads grouped into
        // flights by their span along the tread's length; the first flight rises to the landing, the second on from it to the floor
        // above (sorted along one axis, the two flights interleaved and each looked like half a storey — the user, 2026-11-10)
        const cen = (q: P2[]): P2 => [q.reduce((a, v) => a + v[0], 0) / q.length, q.reduce((a, v) => a + v[1], 0) / q.length];
        const longDir = (q: P2[]): P2 => { const e = segs(q, true).sort(([a1, b1], [a2, b2]) => Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) - Math.hypot(b1[0] - a1[0], b1[1] - a1[1]))[0]!; const L = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]) || 1; return [(e[1][0] - e[0][0]) / L, (e[1][1] - e[0][1]) / L]; };
        const flights: number[][] = [];
        const ld = treads.length ? longDir(treads[0]!) : ([1, 0] as P2);
        const span = (q: P2[]) => { const v = q.map((p) => p[0] * ld[0] + p[1] * ld[1]); return [Math.min(...v), Math.max(...v)] as const; };
        treads.forEach((q, i) => { const [lo, hi] = span(q); const f = flights.find((g) => { const [l2, h2] = span(treads[g[0]!]!); return Math.abs(l2 - lo) < 0.15 && Math.abs(h2 - hi) < 0.15; }); if (f) f.push(i); else flights.push([i]); });
        const landing = rs.filter((q) => Math.abs(area(q)) >= 3).sort((p, q) => Math.abs(area(p)) - Math.abs(area(q)))[0];
        if (flights.length === 2 && landing) {
          const lc = cen(landing);
          const byNear = (g: number[]) => g.slice().sort((i, j) => Math.hypot(cen(treads[i]!)[0] - lc[0], cen(treads[i]!)[1] - lc[1]) - Math.hypot(cen(treads[j]!)[0] - lc[0], cen(treads[j]!)[1] - lc[1]));
          const f1 = byNear(flights[0]!).reverse(), f2 = byNear(flights[1]!); // f1: far → landing; f2: landing → far
          const rise = (h + SLAB) / (f1.length + f2.length + 2); // floor to floor: the walls and the slab over them
          // each tread on a 0.35 m waist, the landing a 0.3 m slab — a stair, not a block filled to the floor (the second flight read
          // as a wall over the first)
          const wy = (top: number) => Math.max(y0, top - 0.35);
          f1.forEach((i, k) => prims.push({ type: "prism", ring: treads[i]!, y0: wy(y0 + (k + 1) * rise), y1: y0 + (k + 1) * rise, material: "concrete", tag: `${tag}:stair:${ST.read}` }));
          prims.push({ type: "prism", ring: landing, y0: y0 + (f1.length + 1) * rise - 0.3, y1: y0 + (f1.length + 1) * rise, material: "concrete", tag: `${tag}:stair-landing:${ST.read}` });
          f2.forEach((i, k) => prims.push({ type: "prism", ring: treads[i]!, y0: wy(y0 + (f1.length + 2 + k) * rise), y1: y0 + (f1.length + 2 + k) * rise, material: "concrete", tag: `${tag}:stair:${ST.read}` }));
          ST.why.push(`U stair: ${f1.length} treads up to a landing at +${((f1.length + 1) * rise).toFixed(2)} m, ${f2.length} on to +${(h + SLAB).toFixed(2)} (riser ${(rise * 100).toFixed(1)} cm)`);
        } else {
          const rise = h / Math.max(1, order.length);
          order.forEach((o, k) => prims.push({ type: "prism", ring: treads[o.i]!, y0, y1: y0 + (k + 1) * rise, material: "concrete", tag: `${tag}:stair` }));
          ST.why.push(`straight stair: ${order.length} treads (${flights.length} flight(s), ${landing ? "a" : "no"} landing ring)`);
        }
      }
      for (const q of rs) obstacles.push(q);
      ST.built++;
    } else if (nm === "oven") {
      OV.read++;
      const rs = insertRings(drawing, p).map(ringOf).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
      if (!rs[0]) { OV.dropped++; continue; }
      prims.push({ type: "prism", ring: rs[0], y0, y1: y0 + 2.2, material: "worktop", tag: `${tag}:oven` });
      obstacles.push(rs[0]);
      // pass-through ovens (the architect): a steel door on each face along the row — raw goes in one side, cooked comes out the other
      if (rs[0].length === 4) {
        const e = segs(rs[0], true).map(([a, b]) => ({ a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) })).sort((x, y) => y.L - x.L);
        const oc = rs[0].reduce((q, v) => [q[0] + v[0] / 4, q[1] + v[1] / 4] as P2, [0, 0] as P2);
        for (const { a, b, L } of e.slice(0, 2)) {
          const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const out = Math.sign((m[0] - oc[0]) * -uz + (m[1] - oc[1]) * ux) || 1;
          box([m[0] - uz * out * 0.03, y0 + 1.05, m[1] + ux * out * 0.03], [L - 0.2, 1.9, 0.05], -Math.atan2(uz, ux), "darkSteel", `${tag}:oven-door`);
        }
      }
      OV.built++;
    } else if (/^00-delet|^entrance$/.test(nm)) {
      // the entrance doors are built on the shell above; "entrance" is the sheet's arrow, a symbol
      if (nm === "entrance") { T("entrance arrow").read++; T("entrance arrow").dropped++; }
    } else { T(`${tag} other insert`).read++; T(`${tag} other insert`).dropped++; T(`${tag} other insert`).why.push(`${nm}: no builder`); }
  }
  T("entrance arrow").why = ["a sheet symbol (black arrow), not a building part"];
  report[`${tag}Equipment`] = equipRooms(roomInfo, obstacles, tag, y0, h);
  // what the storey has that is not built: hatches and hidden lines, by count
  const hatch = pcs.filter((p) => p.layer === "00-hatch").length, hidden = pcs.filter((p) => p.layer === "00-HIDDEN").length;
  if (hatch) { const H = T(`${tag} hatch`); H.read = hatch; H.merged = hatch; H.why.push("00-hatch: AR-SAND = the truck route / yard (built as the route, or painted asphalt), ANGLE = the terrace (its slab), ANSI31 = wall poche (the walls)"); }
  if (hidden) { const H = T(`${tag} hidden line`); H.read = hidden; H.merged = hidden; H.why.push("00-HIDDEN: the raised truck route's edges (built with the route) and lines of the storey over"); }
}
// the oven row, fitted before any storey is built (the truck labels and the name inheritance both ask which side a point is on):
// a line through the ground ovens' centres (principal axis); its raw side is the one the production / thawing / butchery labels are on
{
  const oc = G.filter((p) => p.type === "INSERT" && p.insert === "oven").map((p) => insertRings(ground.d, p).map(ringOf).sort((x, y) => Math.abs(area(y)) - Math.abs(area(x)))[0]).filter((r): r is P2[] => !!r).map((r) => [r.reduce((q, v) => q + v[0], 0) / r.length, r.reduce((q, v) => q + v[1], 0) / r.length] as P2);
  if (oc.length >= 3) {
    const mx = oc.reduce((q, v) => q + v[0], 0) / oc.length, mz = oc.reduce((q, v) => q + v[1], 0) / oc.length;
    let sxx = 0, sxz = 0, szz = 0; for (const [x, z] of oc) { sxx += (x - mx) ** 2; sxz += (x - mx) * (z - mz); szz += (z - mz) ** 2; }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    sep = { p: [mx, mz], d: [Math.cos(ang), Math.sin(ang)], rawSign: 1 };
    const raw = G.filter((p) => p.text && p.layer === "0" && /ייצור|הפשרה|קצביה/.test(p.text)).map((p) => sideOf(M(p.at!)));
    const sum = raw.reduce((q, v) => q + v, 0);
    if (sum < 0) sep.rawSign = -1;
    report.ovenRow = { centre: [Number(mx.toFixed(2)), Number(mz.toFixed(2))], dir: sep.d.map((v) => Number(v.toFixed(3))), ovens: oc.length, rawLabelsAgree: raw.filter((v) => v === Math.sign(sum)).length + "/" + raw.length };
    // the first-floor sheet names its two halves ("איחסון חומרי גלם" / "איחסון תצ\"ג"): each must fall on the side the oven row gives it
    report.zoneLabels = F.filter((p) => p.text && /איחסון/.test(p.text)).map((p) => { const sd = sideOf(M(p.at!)); const want = /גלם/.test(p.text!) ? 1 : /תצ/.test(p.text!) ? -1 : 0; return { text: p.text, side: sd > 0 ? "raw" : sd < 0 ? "finished" : "on the line", agrees: sd === want }; });
    const OR = T("oven row (raw | finished split)"); OR.read = oc.length; OR.built = 1;
    OR.why.push("the architect: two sides split by the pass-through ovens; used for name inheritance and the truck doors");
  }
}
storey(G, ground.d, gShell, "ground", 0, H0, false, null);
storey(F, first.d, fShell, "first", H0 + SLAB, H1, true, gShell.shell.outer);
say("storeys built");

// ---- the truck route, built (option 1: ramp up the south-west strip, a raised run by the terrace, a ramp down to the north road) ----
const LV = H0 + SLAB; // the first floor and its terrace
let routeH = (_q: P2): number | null => null; // the built route's surface height at a point (null: not on it)
if (sandG.length && sandF.length && fShell.extra.length && hiddenG.length) {
  const TRt = T("sheet: truck route (AR-SAND hatch + 00-HIDDEN)");
  TRt.read = sandG.length + sandF.length + hiddenG.length;
  const lab = (re: RegExp) => [...G, ...F].find((p) => p.text && re.test(p.text) && p.at);
  const qIn = M(lab(/כניסת משאיות/)!.at!), qOut = M(lab(/יציאת משאיות/)!.at!);
  const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]], mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k], unit = (a: P2): P2 => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; };
  const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
  // a ramp over ring r, rising from h0 at o to h1 at o + u·len and level beyond: ONE sloped surface (the renderer's prism
  // `rise`), not slices — 0.6 m level slices read as a staircase, and white fill faces as part of the building (the user,
  // 2026-11-10: "the ramp is not right"). The fill is faced in stone (retaining walls), the top a sloped asphalt deck.
  const solid = (r: P2[], o: P2, u: P2, len: number, h0: number, h1: number, tag: string) => {
    const s1 = Math.max(...r.map((q) => dot([q[0] - o[0], q[1] - o[1]], u))), sEnd = Math.min(len, s1), g = (h1 - h0) / len;
    const cut = add(o, mul(u, sEnd));
    const sloped = clipHalf(r, cut, mul(u, -1)), level = sEnd < s1 - 0.05 ? clipHalf(r, cut, u) : [];
    const base = Math.min(...r.map((q) => hAt(q[0], q[1]))) - 0.3;
    let n = 0;
    for (const [piece, top, rz] of [[sloped, h0, { o, g: [u[0] * g, u[1] * g] as P2 }], [level, h1, undefined]] as const) {
      if (piece.length < 3 || Math.abs(area(piece)) < 0.05) continue;
      prims.push({ type: "prism", ring: piece, y0: base, y1: top - 0.06, material: "stone", tag: `${tag}:fill`, ...(rz ? { rise: rz } : {}) });
      prims.push({ type: "prism", ring: piece, y0: top - 0.06, y1: top, material: "asphalt", tag: `${tag}:top`, ...(rz ? { rise: { ...rz, all: true } } : {}) });
      n++;
    }
    return n;
  };
  // 1. the ramp: the ground sheet's strip, low at its end by "כניסת משאיות", up to the first floor at its far end
  // the ramps stand inside the plot line: the parts past it are the crossing at the ground (painted above)
  const inward = (r: P2[]) => { const sg = Math.sign(area(plot)) || 1; return segs(plot, true).reduce((acc, [a, b]) => clipHalf(acc, a, [-(b[1] - a[1]) * sg, (b[0] - a[0]) * sg]), r); };
  const R = dedupe(inward(sandG[0]!));
  const lowI = segs(R, true).map(([a, b], i) => ({ i, d: Math.hypot((a[0] + b[0]) / 2 - qIn[0], (a[1] + b[1]) / 2 - qIn[1]) })).sort((x, y) => x.d - y.d)[0]!.i;
  const lowA = R[lowI]!, lowB = R[(lowI + 1) % R.length]!, lowM: P2 = [(lowA[0] + lowB[0]) / 2, (lowA[1] + lowB[1]) / 2];
  const far = R.slice().sort((p, q) => Math.hypot(q[0] - lowM[0], q[1] - lowM[1]) - Math.hypot(p[0] - lowM[0], p[1] - lowM[1]))[0]!;
  const uR = unit([far[0] - lowM[0], far[1] - lowM[1]]), lenR = dot([far[0] - lowM[0], far[1] - lowM[1]], uR);
  const gIn = hAt(lowM[0], lowM[1]);
  const LAND = 6; // the level landing inside the fence at each ramp's foot (the user, 2026-11-10)
  const oR = add(lowM, mul(uR, LAND));
  const landUp = clipHalf(R, oR, mul(uR, -1));
  solid(landUp, lowM, uR, LAND, gIn, gIn, "sheet:truck-landing-in");
  const nR = solid(clipHalf(R, oR, uR), oR, uR, lenR - 4 - LAND, gIn, LV, "sheet:truck-ramp-up") + 1; // level for its last 4 m, where it turns onto the raised run
  // 2. the raised run: the dashed outline, flat at the first floor up to the terrace's far corner (by the exit) …
  const Hd = dedupe(inward(hiddenG[0]!)), terr = fShell.extra[0]!;
  const cNE = terr.slice().sort((p, q) => Math.hypot(p[0] - qOut[0], p[1] - qOut[1]) - Math.hypot(q[0] - qOut[0], q[1] - qOut[1]))[0]!;
  const cS = terr.slice().sort((p, q) => Math.hypot(q[0] - cNE[0], q[1] - cNE[1]) - Math.hypot(p[0] - cNE[0], p[1] - cNE[1]))[0]!;
  const e = unit([cNE[0] - cS[0], cNE[1] - cS[1]]);
  const flat = clipHalf(Hd, cNE, mul(e, -1)), down = clipHalf(Hd, cNE, e);
  prims.push({ type: "prism", ring: flat, y0: LV - 0.45, y1: LV - 0.06, material: "concrete", tag: "sheet:truck-deck:slab" });
  prims.push({ type: "prism", ring: flat, y0: LV - 0.06, y1: LV, material: "asphalt", tag: "sheet:truck-deck:top" });
  // its columns: along its edges that stand off the building (the inner side rests on the ground floor's wall)
  let cols = 0;
  for (const [a, b] of segs(flat, true)) {
    const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (ringDist(m, gShell.shell.outer) < 2 || inside(m, gShell.shell.outer)) continue;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / 7));
    for (let j = 0; j <= k; j++) { const c: P2 = [a[0] + ((b[0] - a[0]) * j) / k - (b[1] - a[1]) / L * 0.3 * 0, a[1] + ((b[1] - a[1]) * j) / k]; if (inside(c, gShell.shell.outer)) continue; const g = hAt(c[0], c[1]); box([c[0], (g + LV - 0.45) / 2, c[1]], [0.5, LV - 0.45 - g, 0.5], 0, "concrete", "sheet:truck-deck:column"); cols++; }
  }
  // 3. … then down to the north road, ending at the road's ground by "יציאת משאיות"
  const farD = down.slice().sort((p, q) => Math.hypot(p[0] - qOut[0], p[1] - qOut[1]) - Math.hypot(q[0] - qOut[0], q[1] - qOut[1]))[0]!;
  const sTop = Math.min(...down.map((q) => dot([q[0] - cNE[0], q[1] - cNE[1]], unit([farD[0] - cNE[0], farD[1] - cNE[1]]))));
  const uD = unit([farD[0] - cNE[0], farD[1] - cNE[1]]), oD = add(cNE, mul(uD, sTop)), lenD = dot([farD[0] - oD[0], farD[1] - oD[1]], uD);
  const gOut = hAt(farD[0], farD[1]);
  const nD = solid(down, oD, uD, lenD - LAND, LV, gOut, "sheet:truck-ramp-down"); // its last 6 m level: the landing inside the fence
  // parapets on the route's open edges: off the building, not where one run meets the next, not at the road ends
  const hOn = (q: P2) => {
    if (inside(q, flat) || ringDist(q, flat) < 0.05) return LV;
    if (inside(q, down) || ringDist(q, down) < 0.05) return LV + (gOut - LV) * Math.max(0, Math.min(1, dot([q[0] - oD[0], q[1] - oD[1]], uD) / (lenD - LAND)));
    return gIn + (LV - gIn) * Math.max(0, Math.min(1, dot([q[0] - oR[0], q[1] - oR[1]], uR) / (lenR - 4 - LAND)));
  };
  routeH = (q: P2) => [R, flat, down].some((r) => inside(q, r) || ringDist(q, r) < 0.3) ? hOn(q) : null;
  let par = 0;
  for (const [ring, others] of [[R, [flat, down]], [flat, [R, down]], [down, [R, flat]]] as const) for (const [a, b] of segs(ring, true)) {
    const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (ringDist(m, gShell.shell.outer) < 1.5 || ringDist(m, terr) < 0.5) continue;
    if (others.some((o) => ringDist(m, o) < 0.6)) continue;
    if (Math.hypot(m[0] - qIn[0], m[1] - qIn[1]) < 6 || Math.hypot(m[0] - qOut[0], m[1] - qOut[1]) < 6) continue;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5));
    for (let j = 0; j < n; j++) {
      const p: P2 = [a[0] + ((b[0] - a[0]) * (j + 0.5)) / n, a[1] + ((b[1] - a[1]) * (j + 0.5)) / n], h = hOn(p);
      if (h - hAt(p[0], p[1]) < 0.4) continue;
      const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]), w = L / n + 0.02;
      box([p[0], h + 0.17, p[1]], [w, 0.34, 0.3], rot, "concrete", "sheet:truck-route:kerb");
      for (const y of [0.72, 1.05]) box([p[0], h + y, p[1]], [w, 0.09, 0.05], rot, "darkSteel", "sheet:truck-route:rail");
      if (j % 4 === 0) box([p[0], h + 0.7, p[1]], [0.08, 0.8, 0.08], rot, "darkSteel", "sheet:truck-route:post");
      par++;
    }
  }
  TRt.built = 3;
  TRt.why.push(`ramp up: a level landing of ${LAND} m inside the fence at "כניסת משאיות" (${gIn.toFixed(2)}), then one sloped deck (${nR} parts) along the south-west strip to the first floor (+${LV.toFixed(2)}) over ${(lenR - 4 - LAND).toFixed(0)} m (${(((LV - gIn) / (lenR - 4 - LAND)) * 100).toFixed(0)}%), level for its last 4 m`);
  TRt.why.push(`raised run: a deck at +${LV.toFixed(2)} along the terrace, ${Math.abs(area(flat)).toFixed(0)} m², on ${cols} columns`);
  TRt.why.push(`ramp down: one sloped deck (${nD} part) over ${(lenD - LAND).toFixed(0)} m (${(((LV - gOut) / (lenD - LAND)) * 100).toFixed(0)}%), then a level landing of ${LAND} m inside the fence by "יציאת משאיות" (${gOut.toFixed(2)}) — ASSUMED: the sheets give no levels; the ground is the survey's`);
  TRt.why.push(`${(par / 2).toFixed(0)} m of guard rail on the open edges: a 0.34 m concrete kerb, steel posts every 2 m, two steel rails at 0.72 and 1.05 m; the ramps' sides faced in stone (retaining walls)`);
  TRt.why.push("the thin triangles along each run (layer 0 / 00-HIDDEN) are its direction of travel: in from the west, round the south, out to the north");
  report.truckRoute = { landingM: LAND, rampUp: { fromM: +gIn.toFixed(2), toM: LV, lengthM: +(lenR - 4 - LAND).toFixed(1) }, deckM2: +Math.abs(area(flat)).toFixed(0), rampDown: { fromM: LV, toM: +gOut.toFixed(2), lengthM: +(lenD - LAND).toFixed(1) }, assumed: "levels: none on the sheets" };
}

// ---- PROPOSAL (the user, 2026-11-10: "add trucks and cars, so they can be told apart"): vehicles, none on the sheet ----
// Trucks are big refrigerated boxes (10.8 m, 3.9 m high) and read at once against the cars (4.6 m saloons). The two kinds of truck
// differ too, as the architect's two sides do: raw material — a grey steel box; finished product — a white box with a gold band.
const VT = T("proposal: truck"), VC = T("proposal: car");
const truckBoxes: P2[][] = [];
function truck(rear: P2, fwd: P2, base: number, kind: "raw" | "finished", why: string, open = false) {
  const [fx, fz] = fwd, rx = -fz, rz = fx; // fwd = along the truck, rear → cab; r = across
  const at = (d: number, s: number): P2 => [rear[0] + fx * d + rx * s, rear[1] + fz * d + rz * s];
  const rot = -Math.atan2(fz, fx);
  const part = (d0: number, d1: number, w: number, y0: number, y1: number, mat: BuildingMaterial, nm: string, s = 0) => { const c = at((d0 + d1) / 2, s); prims.push({ type: "box", centre: { x: c[0], y: base + (y0 + y1) / 2, z: c[1] }, size: { x: d1 - d0, y: y1 - y0, z: w }, rotY: rot, material: mat, tag: `site:proposal:truck:${nm}`, round: Math.min(0.12, 0.4 * Math.min(d1 - d0, y1 - y0, w)) }); };
  part(0, 7.4, 2.5, 1.05, 3.9, kind === "raw" ? "metal" : "whiteboard", "box");
  // the box's rear doors (the user, 2026-11-10: "the trucks have no loading doors"): two leaves with locking bars; at a dock they
  // stand open, folded back against the sides, and the box's dark inside shows
  const leafMat: BuildingMaterial = kind === "raw" ? "metal" : "whiteboard";
  if (open) {
    part(-0.02, 0.0, 2.34, 1.12, 3.82, "rubber", "rear-opening");
    for (const sd of [-1, 1]) { part(0.02, 1.2, 0.04, 1.1, 3.85, leafMat, "rear-door", sd * 1.29); for (const d of [0.35, 0.85]) part(d - 0.02, d + 0.02, 0.06, 1.2, 3.75, "darkSteel", "lock-bar", sd * 1.31); }
  } else {
    for (const sd of [-1, 1]) { part(-0.04, 0.0, 1.22, 1.1, 3.85, leafMat, "rear-door", sd * 0.62); for (const o of [0.3, 0.92]) part(-0.07, -0.04, 0.05, 1.2, 3.75, "darkSteel", "lock-bar", sd * o); }
    part(-0.05, -0.01, 0.03, 1.1, 3.85, "darkSteel", "rear-seam");
  }
  if (kind === "finished") for (const s of [-1, 1]) part(0.3, 7.1, 0.02, 2.6, 3.0, "signage", "band", s * 1.26);
  part(0, 10.8, 2.1, 0.6, 1.05, "darkSteel", "chassis");
  part(7.6, 10.8, 2.45, 0.9, 3.25, "darkSteel", "cab");
  part(10.78, 10.84, 2.2, 2.0, 3.0, "screen", "windscreen");
  for (const d of [1.6, 2.8, 9.6]) for (const s of [-1, 1]) part(d - 0.5, d + 0.5, 0.36, 0, 1.0, "rubber", "wheel", s * 1.05);
  truckBoxes.push([at(-0.5, -1.6), at(11.3, -1.6), at(11.3, 1.6), at(-0.5, 1.6)]);
  VT.built++; VT.why.push(why);
}
for (const d of docks) {
  VT.read++;
  const kind = sideOf(d.p) < 0 ? "finished" : "raw";
  if (d.y !== null) {
    // the user, 2026-11-10 (the first-floor plan, two trucks circled): "what is the idea of leaving the trucks in the middle of the
    // factory — it is not practical". The terrace sits over the plant's middle; no truck is parked on it — the door and the route stay
    VT.dropped++; VT.why.push(`${d.tag}-floor terrace door: no truck parked on the terrace over the plant (the user's word); the door and the route stay`);
    continue;
  }
  if (d.y !== null) {
    // a raised terrace (option 1: the sheet's "מרפסת חניית משאיות", 6 m deep over the ground floor's roof): a 10.8 m truck backed
    // to the wall stood with its cab in the air (the user, 2026-11-10: "they stand on the building"). It parks along the wall
    // instead, 0.8 m off it (side loading), only where its whole footprint lies on the drawn terrace; else it is left out, said why
    const terr = fShell.extra.find((r) => inside([d.p[0] + d.n[0] * 2, d.p[1] + d.n[1] * 2], r));
    const u: P2 = [-d.n[1], d.n[0]];
    let placed = false;
    for (const sh of [0, 2, -2, 4, -4, 6, -6]) for (const dir of [1, -1] as const) {
      if (placed || !terr) continue;
      const f: P2 = [u[0] * dir, u[1] * dir];
      const rear: P2 = [d.p[0] + d.n[0] * 2.1 - f[0] * (5.4 - sh), d.p[1] + d.n[1] * 2.1 - f[1] * (5.4 - sh)];
      const rx = -f[1], rz = f[0], at = (a: number, s: number): P2 => [rear[0] + f[0] * a + rx * s, rear[1] + f[1] * a + rz * s];
      const foot = [at(-0.3, -1.4), at(11.1, -1.4), at(11.1, 1.4), at(-0.3, 1.4)];
      if (!foot.every((c) => inside(c, terr))) continue;
      if (truckBoxes.some((b) => foot.some((c) => inside(c, b)) || b.some((c) => inside(c, foot)))) continue;
      truck(rear, f, d.y, kind, `${kind === "raw" ? "raw-material" : "finished-product"} truck parked along the ${d.tag}-floor terrace by its truck door (proposal; side loading — the terrace is 6 m deep)`);
      placed = true;
    }
    if (!placed) { VT.dropped++; VT.why.push(`${d.tag}-floor terrace door: a truck does not fit on the drawn terrace there`); }
    continue;
  }
  const rear: P2 = [d.p[0] + d.n[0] * 0.5, d.p[1] + d.n[1] * 0.5]; // into the dock seal
  const mid: P2 = [d.p[0] + d.n[0] * 6, d.p[1] + d.n[1] * 6];
  truck(rear, d.n, d.y ?? hAt(mid[0], mid[1]), kind, `${kind === "raw" ? "raw-material" : "finished-product"} truck backed to the ${d.tag} truck door, its rear doors open (proposal)`, true);
}
// a truck parked where the sheet writes "חניית משאיות", along the nearest wall, unless a backed-up truck already stands there
for (const [pcs, sh, y] of [[G, gShell, null], [F, fShell, H0 + SLAB]] as const) {
  for (const lb of pcs.filter((p) => p.text && /חניית משאיות/.test(p.text) && !/מרפסת/.test(p.text))) {
    const q = M(lb.at!);
    VT.read++;
    if (y !== null) { VT.dropped++; VT.why.push(`"${lb.text}" (first floor): the terrace over the plant — no truck parked there (the user, 2026-11-10: "not practical")`); continue; }
    if (truckBoxes.some((b) => Math.hypot((b[0]![0] + b[2]![0]) / 2 - q[0], (b[0]![1] + b[2]![1]) / 2 - q[1]) < 12)) { VT.dropped++; VT.why.push(`"${lb.text}" (${y === null ? "ground" : "first"}): a backed-up truck already stands there`); continue; }
    const sg = segs(sh.shell.mid, true).map(([a, b]) => ({ a, b, d: projOn(q, a, b).d })).sort((u, v) => u.d - v.d)[0]!;
    const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]), u: P2 = [(sg.b[0] - sg.a[0]) / L, (sg.b[1] - sg.a[1]) / L];
    const rear: P2 = [q[0] - u[0] * 5.4, q[1] - u[1] * 5.4];
    truck(rear, u, y ?? hAt(q[0], q[1]), sideOf(q) < 0 ? "finished" : "raw", `parked at the sheet's "${lb.text}" label (proposal)`);
  }
}
// cars: a row of five in front of each workers' entrance ("כניסה מחלקת …"), 7.5 m out from the wall, nosed in; kept only inside
// the plot, clear of the trucks and of the building
const COLOURS = [0xc3c7cc, 0xf1f1ee, 0x1f3a5f, 0x8e1f1f, 0x2a2b2d, 0x6b7076];
let ci = 0;
const midG = gShell.shell.mid, mcG: P2 = [midG.reduce((a, v) => a + v[0], 0) / midG.length, midG.reduce((a, v) => a + v[1], 0) / midG.length];
for (const lb of G.filter((p) => p.text && /כניסה מחלקת/.test(p.text))) {
  const q = M(lb.at!);
  const sg = segs(midG, true).map(([a, b]) => ({ a, b, pr: projOn(q, a, b) })).filter((x) => x.pr.inSeg).sort((u, v) => u.pr.d - v.pr.d)[0];
  VC.read += 5;
  if (!sg) { VC.dropped += 5; VC.why.push(`"${lb.text}": no wall faces it`); continue; }
  const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]), u: P2 = [(sg.b[0] - sg.a[0]) / L, (sg.b[1] - sg.a[1]) / L];
  const foot: P2 = [sg.a[0] + u[0] * sg.pr.s, sg.a[1] + u[1] * sg.pr.s];
  let n: P2 = [-u[1], u[0]];
  if (Math.hypot(foot[0] + n[0] - mcG[0], foot[1] + n[1] - mcG[1]) < Math.hypot(foot[0] - mcG[0], foot[1] - mcG[1])) n = [-n[0], -n[1]];
  let got = 0;
  const placed: P2[] = [];
  for (const [k, off] of [7.5, 5.2, 10.5].flatMap((o) => [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6].map((kk) => [kk, o] as const))) {
    if (got >= 5) break;
    const c: P2 = [foot[0] + u[0] * k * 2.8 + n[0] * off, foot[1] + u[1] * k * 2.8 + n[1] * off];
    if (placed.some((p) => Math.abs((p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]) < 2.6 && Math.abs((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1]) < 4.9)) continue;
    if (plot.length && !inside(c, plot)) { VC.why.push(`"${lb.text}" slot ${k}: skipped, outside the plot`); continue; }
    if (inside(c, gShell.shell.outer) || truckBoxes.some((b) => inside(c, b))) { VC.why.push(`"${lb.text}" slot ${k}: skipped, on the building or a truck`); continue; }
    // the user, 2026-11-10: cars stood beyond the site wall, on the verge — a car must be on the entrance's side of every built
    // wall / fence / gate, not within 1.5 m of one, and off the truck route or yard
    const cross = (p: P2, q: P2, a: P2, b: P2) => { const o = (x: P2, y: P2, z: P2) => Math.sign((y[0] - x[0]) * (z[1] - x[1]) - (y[1] - x[1]) * (z[0] - x[0])); return o(p, q, a) * o(p, q, b) < 0 && o(a, b, p) * o(a, b, q) < 0; };
    if (builtWalls.some(([a, b]) => cross(foot, c, a, b) || projOn(c, a, b).d < 1.5 && projOn(c, a, b).inSeg)) { VC.why.push(`"${lb.text}" slot ${k}: skipped, past or against the site wall`); continue; }
    if (plot.length && dRing(c, plot) < 2.6) { VC.why.push(`"${lb.text}" slot ${k}: skipped, in the planting strip`); continue; }
    if (driveway.length && (inside(c, driveway) || dRing(c, driveway) < 3)) { VC.why.push(`"${lb.text}" slot ${k}: skipped, on the entrance drive`); continue; }
    if (onRoute(c, 1.5)) { VC.why.push(`"${lb.text}" slot ${k}: skipped, on the truck route / yard`); continue; }
    prims.push({ type: "car", at: { x: c[0], y: hAt(c[0], c[1]), z: c[1] }, rotY: Math.atan2(-n[0], -n[1]), colour: COLOURS[ci++ % COLOURS.length]!, tag: "site:proposal:car" });
    { const g = hAt(c[0], c[1]), rot = Math.atan2(-n[0], -n[1]); // a bay: two white lines 5 m long, 2.8 m apart, and a wheel stop
      for (const sd of [-1.4, 1.4]) box([c[0] + u[0] * sd, g + 0.02, c[1] + u[1] * sd], [0.12, 0.02, 5.0], rot, "parkingLine", "site:proposal:bay");
      box([c[0] - n[0] * 2.1, g + 0.07, c[1] - n[1] * 2.1], [1.6, 0.14, 0.2], rot, "concrete", "site:proposal:wheel-stop"); }
    placed.push(c); VC.built++; got++; VC.why.push(`"${lb.text}": workers' car (proposal, not on the sheet)`);
  }
  if (got < 5) { VC.dropped += 5 - got; VC.why.push(`"${lb.text}": only ${got} of 5 places found clear of the wall, the route / yard and the plot line`); }
}
say("vehicles placed");
// ---- the sheets' truck-route arrows (layer 0 open lines outside the shell, beside "כניסת משאיות" / "יציאת משאיות"): painted
// white on the ground, or on the terrace's slab where they fall on it (option 1's first floor: from the terrace's south end to its
// north-east end — the trucks' way along it, on the route built above) ----
{
  const TA = T("sheet: truck-route arrow (layer 0 lines)");
  let outM = 0;
  for (const [pcs, sh, y] of [[G, gShell, null], [F, fShell, H0 + SLAB]] as const) {
    for (const p of pcs.filter((q) => q.layer === "0" && q.type !== "INSERT" && q.pts && q.pts.length >= 2 && !q.text)) {
      TA.read++;
      const l = p.pts!.map(M);
      if (l.every((q) => inside(q, sh.shell.outer))) { TA.dropped++; TA.why.push("a layer-0 line inside the building: not an arrow"); continue; }
      const onTerr = y !== null && l.some((q) => sh.extra.some((r) => inside(q, r)));
      for (const [a, b] of segs(l, !!p.closed)) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
        // in 0.5 m pieces, each at its own height: one long box at its middle's height floats over a ramp's low end and sinks
        // into its high end (the white bars standing in the air over the yard)
        const n = Math.max(1, Math.ceil(L / 0.5)), rot = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let k = 0; k < n; k++) {
          const m: P2 = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n];
          // nothing past the plot line: the route ends inside the fence (the user, 2026-11-10)
          if (plot.length && !inside(m, plot)) { outM += L / n; continue; }
          box([m[0], (routeH(m) ?? (onTerr ? y! : hAt(m[0], m[1]))) + 0.03, m[1]], [L / n + 0.04 + (k === 0 || k === n - 1 ? 0.12 : 0), 0.05, 0.25], rot, "parkingLine", "sheet:truck-arrow");
        }
      }
      TA.built++; TA.why.push(`${y === null ? "ground" : "first-floor"} sheet: arrow at ${l[0]![0].toFixed(0)},${l[0]![1].toFixed(0)} painted ${routeH(l[0]!) !== null ? "on the built route's surface" : onTerr ? "on the terrace slab" : "on the ground"}`);
    }
    if (outM > 0) { TA.why.push(`${outM.toFixed(1)} m of arrow line past the plot line: not painted (outside the fence)`); outM = 0; }
    const tx = pcs.filter((q) => q.text && /כניסת משאיות|יציאת משאיות/.test(q.text));
    TA.read += tx.length; TA.merged += tx.length;
  }
  TA.why.push("the texts \"כניסת משאיות\" / \"יציאת משאיות\" name these arrows (merged into them)");
}


// ---- extent, floors, output ----
const xs: number[] = [], zs: number[] = [];
for (const p of prims) if (p.type === "prism" && !/^site:/.test(p.tag ?? "")) for (const [x, z] of p.ring) { xs.push(x); zs.push(z); }
const minY = Math.min(...shellGround, -SLAB);
const top1 = H0 + SLAB + H1 + SLAB + PARAPET;
const ext = { x: Math.min(...xs), z: Math.min(...zs), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), yMin: minY, yMax: top1 };
const model = { name: OPT === 1 ? "מפעל דליקטס — הצעה 1" : "מפעל דליקטס — הצעה 2", primitives: prims, extent: ext, shadowReachM: 80, north: { x: 0, z: -1 } };
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify(model));
// the plan views frame a floor by its "sheet": here the building's extent and 4 m round, in sheet units (pt at 1:100)
const U = (72 / 25.4) * 10;
const sheet = { shift: { x: ext.x - 4, y: ext.z - 4 }, sheetWidth: (ext.width + 8) * U, sheetHeight: (ext.depth + 8) * U };
const floors = [
  { id: "floor-ground", level: 0, height: H0 + SLAB, units: [], ...sheet, outline: gShell.shell.outer, roof: false, registration: 1 },
  { id: "floor-first", level: H0 + SLAB, height: H1 + SLAB, units: [], ...sheet, outline: fShell.shell.outer, roof: false, registration: 1 },
];
fs.writeFileSync(path.join(out, "state.json"), JSON.stringify({ floors }));
report.tally = tally;
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
console.log("\nread | built | merged | dropped | why");
for (const [k, v] of Object.entries(tally)) console.log(`${k.padEnd(28)} ${String(v.read).padStart(4)} ${String(v.built).padStart(5)} ${String(v.merged).padStart(6)} ${String(v.dropped).padStart(7)}  ${[...new Set(v.why)].join(" | ")}`);
say(`model: ${prims.length} primitives → ${out}`);
