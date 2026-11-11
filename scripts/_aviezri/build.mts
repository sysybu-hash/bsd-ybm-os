/**
 * Aviezri synagogue — the building model from the three DWGs (free: no paid call).
 *   npx tsx --conditions=react-server scripts/_aviezri/build.mts <dxf dir> <out dir>
 * Writes model.json + state.json (for scripts/_breuer/view.mts) and report.json: what was read, built, merged, dropped and why.
 *
 * Frame: read.mts ("rel" cm; model x = X/100, z = −Y/100). Levels from the sheets' marks: ±0.00 the existing kindergarten floor,
 * +3.30 the beit-midrash storey (its terraces +3.25), +7.04 the women's-gallery storey, roof +11.03 (hall) / +10.04 (wings),
 * parapet tops from each face's elevation (+12.13 / +10.73).
 */
import fs from "node:fs";
import path from "node:path";
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { buildGrid, CELL, rects, segmentsOf, type Grid } from "../_breuer/grid.mts";
import { readAviezri, SHEETS, ELEV_Y0, type Sheet } from "./read.mts";
import { heb } from "./heb.mts";
import { buildInterior, inFoot, readStairs } from "./interior.mts";

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error("usage: build.mts <dxf dir> <out dir>");
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const R = readAviezri(dir);
say(`read: ${JSON.stringify(R.counts)}`);

// ---------------- levels ----------------
const L = { ground: 0, f1: 3.3, f2: 7.04, roofHall: 11.03, roofWing: 10.04, terrace: 3.25 };
const SLAB = 0.3;
/** E-W zones along plan X (rel cm): the kitchen/porch bump, the west wing, the hall, the east block */
const ZONE = { bump: [0, 280], wing: [280, 930], hall: [930, 2490], east: [2490, 3146] } as const;
const zoneOf = (X: number) => (X < 280 ? "bump" : X < 930 ? "wing" : X < 2500 ? "hall" : "east");
/**
 * The west wing is hall-high at its north end: the east sheet prints +11.03 / +12.13 over it, the west sheet +10.73 over its
 * south end. Where it steps is not drawn; taken at the porch's north wall (Y 1760), the wing's F2 hall line (assumed).
 */
const WING_TALL_Y = 1760;
const tallAt = (X: number, Y: number) => zoneOf(X) === "hall" || zoneOf(X) === "bump" || (zoneOf(X) === "wing" && Y >= WING_TALL_Y);
const roofOf = (X: number, Y: number) => (tallAt(X, Y) ? L.roofHall : L.roofWing);

const report: Record<string, unknown> = {};
const tally: Record<string, { read: number; built: number; merged: number; dropped: number; why: string[] }> = {};
const T = (k: string) => (tally[k] ??= { read: 0, built: 0, merged: 0, dropped: 0, why: [] });
const prims: Primitive[] = [];
type P2 = [number, number];
const box = (c: [number, number, number], s: [number, number, number], material: BuildingMaterial, tag: string, rotY = 0) =>
  prims.push({ type: "box", centre: { x: c[0], y: c[1], z: c[2] }, size: { x: s[0], y: s[1], z: s[2] }, rotY, material, tag });

// ---------------- plan helpers ----------------
const isOverlay = (p: DxfPiece) => !!(p as { overlay?: boolean }).overlay;
const WALL_L = /^(Rb_)?kir_(hootz|pnim)$/;
const HATCH_L = /^Rb_h_(kayam|block)$/;
const OPEN_L = /^(Rb_)?ptachim$/;
const near = (a: Pt, b: Pt, d: number) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
const bbOf = (pts: Pt[]) => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) });

type Door = { hinge: Pt; dir: Pt; w: number; storey: string; open: Pt };
/** Doors from their drawn swings: the hinge is the arc's centre, the closed leaf runs from it to the arc end no leaf touches. */
function doorsOf(ps: DxfPiece[], storey: string) {
  const arcs = ps.filter((p) => p.arc && !isOverlay(p) && /h_mitar|ptachim/i.test(p.layer) && p.arc.r >= 50 && p.arc.r <= 135);
  const leaves = ps.filter((p) => p.pts && OPEN_L.test(p.layer) && !isOverlay(p));
  const wallSegs = ps.filter((p) => WALL_L.test(p.layer) && !isOverlay(p)).flatMap(segmentsOf);
  const doors: Door[] = [];
  const leafIds = new Set<DxfPiece>();
  for (const a of arcs) {
    const { c, r, start, end } = a.arc!;
    const e1 = { x: c.x + r * Math.cos(start), y: c.y + r * Math.sin(start) }, e2 = { x: c.x + r * Math.cos(end), y: c.y + r * Math.sin(end) };
    const touch = (e: Pt) => leaves.filter((l) => { const b = bbOf(l.pts!); return Math.max(b.x1 - b.x0, b.y1 - b.y0) > 40 && l.pts!.some((q) => near(q, e, 8)); });
    const t1 = touch(e1), t2 = touch(e2);
    for (const l of [...t1, ...t2]) leafIds.add(l);
    // the closed end: the wall's faces run on behind the hinge along it
    const behind = (e: Pt) => {
      const d = { x: (e.x - c.x) / r, y: (e.y - c.y) / r };
      let n = 0;
      for (const [p, q] of wallSegs) {
        const L2 = Math.hypot(q.x - p.x, q.y - p.y); if (L2 < 5) continue;
        const ux = (q.x - p.x) / L2, uy = (q.y - p.y) / L2;
        if (Math.abs(ux * d.y - uy * d.x) > 0.1) continue;
        const off = Math.abs((p.x - c.x) * -d.y + (p.y - c.y) * d.x); if (off > 45) continue;
        const s0 = (p.x - c.x) * d.x + (p.y - c.y) * d.y, s1 = (q.x - c.x) * d.x + (q.y - c.y) * d.y;
        if (Math.min(s0, s1) < -5 && Math.max(s0, s1) > -120) n++;
      }
      return n;
    };
    let closed: Pt, open: Pt;
    if (t1.length && !t2.length) { closed = e2; open = e1; } else if (t2.length && !t1.length) { closed = e1; open = e2; } else if (behind(e1) >= behind(e2)) { closed = e1; open = e2; } else { closed = e2; open = e1; }
    doors.push({ hinge: c, dir: { x: (closed.x - c.x) / r, y: (closed.y - c.y) / r }, w: r, storey, open });
  }
  return { doors, leafIds };
}

// ---------------- storey grids ----------------
type Storey = { id: "f1" | "f2"; ps: DxfPiece[]; floor: number; g: Grid; wall: Uint8Array; doors: Door[]; doorCell: Int32Array; voidText: Pt[] };
function storeyOf(id: "f1" | "f2", ps: DxfPiece[], floor: number): Storey {
  const { doors, leafIds } = doorsOf(ps, id);
  const segs: Array<[Pt, Pt]> = [];
  const add = (p: DxfPiece) => segs.push(...segmentsOf(p));
  let nWall = 0, nHatch = 0, nOpen = 0, nTag = 0;
  // a solid hatch inside a sub-block that also carries lettering or a fitting is that block's fill (a level tag's box, a WC's
  // bowl), not a wall: the storey's own drawing sits at its root depth, sub-blocks below it
  const own = ps.filter((p) => !isOverlay(p));
  const depths = new Map<number, number>();
  for (const p of own) if (WALL_L.test(p.layer)) depths.set(p.path.length, (depths.get(p.path.length) ?? 0) + 1);
  const root = Math.min(...[...depths].filter(([, n]) => n >= 20).map(([d]) => d), 9); // the shallowest depth that carries the walls (windows and doors nest theirs deeper)
  const fillBlocks = new Set<string>();
  for (const p of own) {
    if (!/text|sanitary|rihut/i.test(p.layer)) continue;
    if (p.path.length > root) fillBlocks.add(p.path.slice(0, root + 1).join(">"));
    if (p.insert && p.path.length >= root) fillBlocks.add([...p.path, p.insert].slice(0, root + 1).join(">")); // a block inserted on a lettering layer (a tag)
  }
  for (const p of ps) {
    if (isOverlay(p)) continue;
    if (WALL_L.test(p.layer) && (p.pts || p.arc)) { add(p); nWall++; }
    else if (HATCH_L.test(p.layer) && p.rings && p.solid) {
      const fb = bbOf(p.rings!.flat());
      if (p.path.length > root && fillBlocks.has(p.path.slice(0, root + 1).join(">")) && Math.max(fb.x1 - fb.x0, fb.y1 - fb.y0) <= 100) { nTag++; if (process.env.TAGDBG) { const q = p.rings![0]!; console.log("TAG", id, p.path.join(">"), Math.min(...q.map((v) => v.x)).toFixed(0), Math.min(...q.map((v) => v.y)).toFixed(0), (Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x))).toFixed(0), (Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y))).toFixed(0)); } continue; }
      for (const r of p.rings) segs.push(...r.map((q, i) => [q, r[(i + 1) % r.length]!] as [Pt, Pt])); nHatch++;
    }
    else if (OPEN_L.test(p.layer) && p.pts && !leafIds.has(p)) { add(p); nOpen++; }
  }
  // the doorways closed along their closed leaf, so the outside does not flood in through them
  for (const d of doors) segs.push([d.hinge, { x: d.hinge.x + d.dir.x * d.w, y: d.hinge.y + d.dir.y * d.w }]);
  const xs = segs.flatMap(([a, b]) => [a.x, b.x]), ys = segs.flatMap(([a, b]) => [a.y, b.y]);
  const g = buildGrid(segs, { x0: Math.min(...xs) - 100, y0: Math.min(...ys) - 100, x1: Math.max(...xs) + 100, y1: Math.max(...ys) + 100 });
  const wall = new Uint8Array(g.nx * g.ny);
  const THIN = 7; // a region no deeper than 35 cm from a line is a wall's core (walls here are 10–60 cm)
  for (let k = 0; k < wall.length; k++) { const rg = g.region[k]!; if (rg && g.regionDepth[rg]! <= THIN) wall[k] = 1; }
  // a drawn line next to a core is part of that wall
  for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
    const k = j * g.nx + i; if (!g.line[k]) continue;
    for (const kk of [k - 1, k + 1, k - g.nx, k + g.nx, k - g.nx - 1, k - g.nx + 1, k + g.nx - 1, k + g.nx + 1]) if (g.region[kk] && g.regionDepth[g.region[kk]!]! <= THIN) { wall[k] = 1; break; }
  }
  // door cells: the doorway's span along the leaf and 45 cm either side across it (only cells that are wall)
  const doorCell = new Int32Array(g.nx * g.ny).fill(-1);
  doors.forEach((d, di) => {
    const n = { x: -d.dir.y, y: d.dir.x };
    for (let s = 2; s <= d.w - 2; s += CELL / 2) for (let t = -45; t <= 45; t += CELL / 2) {
      const x = d.hinge.x + d.dir.x * s + n.x * t, y = d.hinge.y + d.dir.y * s + n.y * t;
      const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL), k = j * g.nx + i;
      if (wall[k]) doorCell[k] = di;
    }
  });
  const voidText = ps.filter((p) => p.at && /חלל כפול/.test(heb(p.text ?? (p.attribs ?? []).map((a) => a.text).join(" ")))).map((p) => p.at!);
  T(`walls:${id}`).read += nWall + nHatch; T(`walls:${id}`).why.push(`${nWall} wall-layer lines, ${nHatch} wall hatches (${nTag} fills of level tags and fittings left out), ${nOpen} window-frame lines, ${doors.length} doorways closed on their leaf`);
  T(`doors:${id}`).read += doors.length;
  say(`${id}: grid ${g.nx}×${g.ny}, ${doors.length} doors, ${leafIds.size} open leaves left out of the walls`);
  return { id, ps, floor, g, wall, doors, doorCell, voidText };
}
const F1 = storeyOf("f1", R.f1, L.f1);
const F2 = storeyOf("f2", R.f2, L.f2);
// the stairs between the storeys, from their drawn treads: the gallery storey's slab is open over them
const STAIRS = readStairs([F1, F2], say);

// ---------------- the elevations: silhouettes and openings ----------------
type Opening = { sheet: Sheet["id"]; u0: number; u1: number; z0: number; z1: number; arched: boolean; blind: boolean;
  panes: Array<{ u0: number; u1: number; z0: number; z1: number }>; sur: { u0: number; u1: number; z0: number; z1: number } | null; tag: string };
const zOf = (y: number) => (y - ELEV_Y0) / 100;
function readSheet(s: Sheet) {
  const ps = R.elev.get(s.id)!;
  const pts = (p: DxfPiece): Pt[] => p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : []);
  const bbU = (p: DxfPiece) => { const q = pts(p); if (!q.length) return null; const us = q.map((v) => s.along(v.x)); return { u0: Math.min(...us), u1: Math.max(...us), z0: zOf(Math.min(...q.map((v) => v.y))), z1: zOf(Math.max(...q.map((v) => v.y))) }; };
  // silhouette: the top of the wall outline (Rb_kir_hootz) along the face, every 10 cm
  // silhouette: the highest level line (outer wall or its mouldings, ≥ 30 cm long) over each point of the face, snapped to a mark
  const outl: Array<{ u0: number; u1: number; z0: number; z1: number }> = [];
  for (const p of ps.filter((p) => /kir_hootz|mabat_5/i.test(p.layer) && p.pts)) for (let i = 0; i + 1 < p.pts!.length; i++) {
    const a = p.pts![i]!, b = p.pts![i + 1]!;
    if (Math.abs(a.y - b.y) > 0.5 || Math.abs(a.x - b.x) < 30 || zOf(a.y) < 3) continue;
    const u0 = Math.min(s.along(a.x), s.along(b.x)), u1 = Math.max(s.along(a.x), s.along(b.x));
    outl.push({ u0, u1, z0: zOf(a.y), z1: zOf(a.y) });
  }
  const MARKS = [10.73, 11.03, 12.13];
  const sil = (u: number) => { const z = Math.max(0, ...outl.filter((b) => u >= b.u0 - 1 && u <= b.u1 + 1).map((b) => b.z1)); return MARKS.find((m) => Math.abs(m - z) < 0.04) ?? z; };
  // openings: frame-line clusters (ptachim) merged 8 cm apart
  type B = { u0: number; u1: number; z0: number; z1: number; ps: DxfPiece[] };
  const cl: B[] = [];
  for (const p of ps.filter((p) => OPEN_L.test(p.layer))) {
    const b = bbU(p); if (!b) continue;
    const o = cl.find((c) => b.u0 <= c.u1 + 8 && b.u1 >= c.u0 - 8 && b.z0 <= c.z1 + 0.08 && b.z1 >= c.z0 - 0.08);
    if (o) { o.u0 = Math.min(o.u0, b.u0); o.u1 = Math.max(o.u1, b.u1); o.z0 = Math.min(o.z0, b.z0); o.z1 = Math.max(o.z1, b.z1); o.ps.push(p); } else cl.push({ ...b, ps: [p] });
  }
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < cl.length; i++) for (let j = cl.length - 1; j > i; j--) {
    const a = cl[i]!, b = cl[j]!;
    if (b.u0 <= a.u1 + 8 && b.u1 >= a.u0 - 8 && b.z0 <= a.z1 + 0.08 && b.z1 >= a.z0 - 0.08) { a.u0 = Math.min(a.u0, b.u0); a.u1 = Math.max(a.u1, b.u1); a.z0 = Math.min(a.z0, b.z0); a.z1 = Math.max(a.z1, b.z1); a.ps.push(...b.ps); cl.splice(j, 1); }
  }
  const surr = ps.filter((p) => /mabat_5/i.test(p.layer)).map(bbU).filter((b): b is NonNullable<typeof b> => !!b);
  const ops: Opening[] = [];
  for (const c of cl) {
    const w = c.u1 - c.u0, h = c.z1 - c.z0;
    if (w < 40 || h < 0.4) { T(`elev:${s.id}`).dropped++; T(`elev:${s.id}`).why.push(`frame cluster ${w.toFixed(0)}×${(h * 100).toFixed(0)} cm at u ${c.u0.toFixed(0)} too small to be an opening (a railing post or a mark)`); continue; }
    const curved = c.ps.some((p) => p.arc || (p.pts && p.pts.length > 8));
    const arched = curved && w < 400;
    // panes: innermost closed rectangles of the frame
    const rect = c.ps.filter((p) => p.pts && p.closed && p.pts.length >= 4 && p.pts.length <= 5).map(bbU).filter((b): b is NonNullable<typeof b> => !!b && b.u1 - b.u0 > 12 && b.z1 - b.z0 > 0.12);
    const inner = rect.filter((a) => !rect.some((b) => b !== a && b.u0 >= a.u0 - 0.5 && b.u1 <= a.u1 + 0.5 && b.z0 >= a.z0 - 0.005 && b.z1 <= a.z1 + 0.005 && (b.u1 - b.u0) * (b.z1 - b.z0) < (a.u1 - a.u0) * (a.z1 - a.z0) - 1));
    const panes = inner.filter((a) => (a.u1 - a.u0) < w - 4 || (a.z1 - a.z0) < h - 0.04);
    const sb = surr.filter((b) => b.u1 > c.u0 - 30 && b.u0 < c.u1 + 30 && b.z1 > c.z0 - 0.3 && b.z0 < c.z1 + 0.4 && b.u1 - b.u0 < w * 2.2 + 60);
    const sur = sb.length ? { u0: Math.min(...sb.map((b) => b.u0)), u1: Math.max(...sb.map((b) => b.u1)), z0: Math.min(...sb.map((b) => b.z0)), z1: Math.max(...sb.map((b) => b.z1)) } : null;
    ops.push({ sheet: s.id, u0: c.u0, u1: c.u1, z0: c.z0, z1: c.z1, arched, blind: panes.length === 0, panes, sur, tag: `${s.id}@${c.u0.toFixed(0)}` });
  }
  // doors drawn by their stone frame only (the east sheet's toilet-block door: RB_mabat_5 frame, a U of 4 points, on a floor line, its swing
  // on Rb_h_mitar, no ptachim): a closed frame 0.8–2 m wide, 1.9–2.6 m tall, standing on +3.30 or +7.04
  for (const p of ps.filter((p) => /mabat_5/i.test(p.layer) && p.pts && p.pts.length >= 4 && p.pts.length <= 5)) {
    const b = bbU(p)!; const w = b.u1 - b.u0, h = b.z1 - b.z0;
    if (w < 80 || w > 200 || h < 1.9 || h > 2.6 || ![3.3, 7.04].some((f) => Math.abs(b.z0 - f) < 0.06)) continue;
    if (ops.some((o) => o.u0 < b.u1 && o.u1 > b.u0 && o.z0 < b.z1 && o.z1 > b.z0)) continue;
    ops.push({ sheet: s.id, u0: b.u0 + 5, u1: b.u1 - 5, z0: b.z0, z1: b.z1 - 0.05, arched: false, blind: false, panes: [], sur: null, tag: `${s.id}@door${b.u0.toFixed(0)}` });
    T(`elev:${s.id}`).why.push(`door from its stone frame at u ${b.u0.toFixed(0)}–${b.u1.toFixed(0)}, ${b.z0.toFixed(2)}–${b.z1.toFixed(2)}`);
  }
  // blind arches drawn only by their surround (the sign over the porch): mabat arcs with no frame inside
  const arcSurr = ps.filter((p) => /mabat_5|elec/i.test(p.layer) && (p.arc || (p.pts && p.pts.length > 12)));
  for (const a of arcSurr) {
    const b = bbU(a)!; if (b.u1 - b.u0 < 150) continue;
    if (ops.some((o) => o.u0 < b.u1 && o.u1 > b.u0 && o.z1 > b.z0 - 0.5 && o.z0 < b.z1)) continue;
    if (ops.some((o) => o.tag.startsWith(`${s.id}@blind`) && Math.abs(o.u0 - b.u0) < 60)) continue;
    // the blind arch's whole outline: the surround lines round this arc
    const sb = surr.filter((x) => x.u0 >= b.u0 - 30 && x.u1 <= b.u1 + 30 && x.z1 <= b.z1 + 0.3 && x.z0 >= b.z0 - 4);
    const sur = { u0: Math.min(b.u0, ...sb.map((x) => x.u0)), u1: Math.max(b.u1, ...sb.map((x) => x.u1)), z0: Math.min(...sb.map((x) => x.z0), b.z0), z1: Math.max(b.z1, ...sb.map((x) => x.z1)) };
    ops.push({ sheet: s.id, u0: sur.u0 + 15, u1: sur.u1 - 15, z0: sur.z0 + 0.15, z1: sur.z1 - 0.15, arched: true, blind: true, panes: [], sur, tag: `${s.id}@blind${sur.u0.toFixed(0)}` });
  }
  T(`elev:${s.id}`).read += ops.length;
  return { s, sil, ops, outl };
}
const sheets = SHEETS.map(readSheet);
for (const sh of sheets) say(`${sh.s.title}: ${sh.ops.length} openings (${sh.ops.filter((o) => o.arched).length} arched, ${sh.ops.filter((o) => o.blind).length} blind)`);
report.sheets = sheets.map((sh) => ({ id: sh.s.id, title: sh.s.title, openings: sh.ops.map((o) => ({ tag: o.tag, u: [Math.round(o.u0), Math.round(o.u1)], z: [+o.z0.toFixed(2), +o.z1.toFixed(2)], arched: o.arched, blind: o.blind, panes: o.panes.length })) }));


// ======================================================================================================================
// The facades: each side's outermost wall, in runs of one outer line and one thickness.
// ======================================================================================================================
type Side = "-y" | "+y" | "-x" | "+x";
const SIDES: Side[] = ["-y", "+y", "-x", "+x"];
const SHEET_OF: Record<Side, Sheet["id"] | null> = { "-y": "west", "+y": "east", "-x": "north", "+x": null };
const OUT_DIR: Record<Side, string> = { "-y": "west", "+y": "east", "-x": "north", "+x": "south" };
type Run = { st: Storey; side: Side; a0: number; a1: number; bo: number; t: number;
  /** plan cm: along range, the outer face line, the inner face line */ p0: number; p1: number; outer: number; inner: number };
const claimed = new Map<Storey, Uint8Array>();
function cellOfSide(st: Storey, side: Side, a: number, b: number) {
  const { nx, ny } = st.g;
  if (side === "-y") return b * nx + a; if (side === "+y") return (ny - 1 - b) * nx + a;
  if (side === "-x") return a * nx + b; return a * nx + (nx - 1 - b);
}
function runsOf(st: Storey): Run[] {
  const { g } = st;
  const cl = new Uint8Array(g.nx * g.ny); claimed.set(st, cl);
  const out: Run[] = [];
  for (const side of SIDES) {
    const A = side[1] === "y" ? g.nx : g.ny, B = side[1] === "y" ? g.ny : g.nx;
    const prof: Array<{ bo: number; t: number } | null> = [];
    for (let a = 0; a < A; a++) {
      let b = 0; while (b < B && g.outside[cellOfSide(st, side, a, b)]) b++;
      if (b >= B || !st.wall[cellOfSide(st, side, a, b)]) { prof.push(null); continue; }
      let t = 0; while (b + t < B && st.wall[cellOfSide(st, side, a, b + t)]) t++;
      prof.push({ bo: b, t });
    }
    let a = 0;
    while (a < A) {
      if (!prof[a]) { a++; continue; }
      const bo = prof[a]!.bo; let e = a + 1;
      while (e < A && prof[e] && Math.abs(prof[e]!.bo - bo) <= 1) e++;
      // thickness pieces: a wall meeting from inside makes a short spike; it stays in the run at the run's own thickness
      const segs: Array<{ a0: number; a1: number; t: number }> = [];
      for (let q = a; q < e; q++) { const t = prof[q]!.t; const s = segs[segs.length - 1]; if (s && Math.abs(s.t - t) <= 1) s.a1 = q + 1; else segs.push({ a0: q, a1: q + 1, t }); }
      for (let pass = 0; pass < 4; pass++) for (let s = 0; s < segs.length; s++) {
        const x = segs[s]!; if (x.a1 - x.a0 >= 16 || segs.length === 1) continue;
        const prev = segs[s - 1], next = segs[s + 1];
        const nb = prev && (!next || prev.a1 - prev.a0 >= next.a1 - next.a0) ? s - 1 : s + 1;
        const n = segs[nb]!; n.a0 = Math.min(n.a0, x.a0); n.a1 = Math.max(n.a1, x.a1); segs.splice(s, 1); s--;
      }
      for (let s = segs.length - 1; s > 0; s--) if (Math.abs(segs[s]!.t - segs[s - 1]!.t) <= 1) { segs[s - 1]!.a1 = segs[s]!.a1; segs.splice(s, 1); }
      for (const s of segs) {
        let { a0, a1 } = s; const t = Math.min(s.t, 14); // no outer wall here is over 70 cm
        if (side[1] === "x") { while (a0 < a1 && cl[cellOfSide(st, side, a0, bo)]) a0++; while (a1 > a0 && cl[cellOfSide(st, side, a1 - 1, bo)]) a1--; }
        if (a1 - a0 < 4) continue;
        for (let q = a0; q < a1; q++) for (let d = 0; d < t; d++) cl[cellOfSide(st, side, q, bo + d)] = 1;
        const along0 = side[1] === "y" ? g.x0 : g.y0;
        const p0 = along0 + a0 * CELL, p1 = along0 + a1 * CELL;
        const outer = side === "-y" ? g.y0 + bo * CELL : side === "+y" ? g.y0 + (g.ny - bo) * CELL : side === "-x" ? g.x0 + bo * CELL : g.x0 + (g.nx - bo) * CELL;
        const sg = side[0] === "-" ? 1 : -1;
        out.push({ st, side, a0, a1, bo, t, p0, p1, outer, inner: outer + sg * t * CELL });
      }
      a = e;
    }
    // one wall broken by its own windows and doors (the plan draws the frames through it): runs on one outer line with a
    // gap of ≤ 6 m where nothing stands out beyond that line and nothing is recessed over 60 cm are one wall
    const mine = out.filter((r) => r.side === side).sort((p, q) => p.a0 - q.a0);
    for (let k = mine.length - 1; k > 0; k--) {
      const r = mine[k - 1]!, s = mine[k]!;
      if (Math.abs(r.bo - s.bo) > 1 || s.a0 - r.a1 > 120 || s.a0 < r.a1) continue;
      let ok = true;
      for (let q = r.a1; q < s.a0 && ok; q++) { const pr = prof[q]; if (pr && (pr.bo < Math.min(r.bo, s.bo) - 1 || pr.bo > r.bo + 12)) ok = false; }
      if (!ok) continue;
      const t = r.a1 - r.a0 >= s.a1 - s.a0 ? r.t : s.t;
      for (let q = r.a1; q < s.a0; q++) for (let d = 0; d < t; d++) cl[cellOfSide(st, side, q, r.bo + d)] = 1;
      r.a1 = s.a1; r.p1 = s.p1; r.t = t; r.inner = r.outer + (side[0] === "-" ? 1 : -1) * t * CELL;
      out.splice(out.indexOf(s), 1); mine.splice(k, 1);
      T(`facade:${st.id}`).merged++;
    }
  }
  return out;
}
const RUNS = { f1: runsOf(F1), f2: runsOf(F2) };
for (const st of [F1, F2]) { T(`facade:${st.id}`).read = RUNS[st.id].length; say(`${st.id}: ${RUNS[st.id].length} outer-wall runs`); }

// ---- the face frame: U along the face (world x or world z), d outward from the outer face (m) ----
const U = (side: Side, p: number) => (side[1] === "y" ? p / 100 : -p / 100);
const Urange = (side: Side, p0: number, p1: number): [number, number] => { const a = U(side, p0), b = U(side, p1); return [Math.min(a, b), Math.max(a, b)]; };
type Face = { side: Side; outer: number };
function sideSpan(r: Face, d0: number, d1: number): { along: "x" | "z"; t0: number; t1: number } {
  const o = r.outer / 100;
  if (r.side === "-y") return { along: "x", t0: -o + d0, t1: -o + d1 };
  if (r.side === "+y") return { along: "x", t0: -o - d1, t1: -o - d0 };
  if (r.side === "-x") return { along: "z", t0: o - d1, t1: o - d0 };
  return { along: "z", t0: o + d0, t1: o + d1 };
}
/** a box in the face frame: U range, height range, d range (outward from the outer face) */
function faceBox(r: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, material: BuildingMaterial, tag: string) {
  const sp = sideSpan(r, d0, d1), um = (u0 + u1) / 2, tm = (sp.t0 + sp.t1) / 2;
  if (sp.along === "x") box([um, (y0 + y1) / 2, tm], [u1 - u0, y1 - y0, sp.t1 - sp.t0], material, tag);
  else box([tm, (y0 + y1) / 2, um], [sp.t1 - sp.t0, y1 - y0, u1 - u0], material, tag);
}
function facePrism(r: Face, ring: P2[], holes: P2[][], d0: number, d1: number, material: BuildingMaterial, tag: string) {
  const ys = ring.map((q) => q[1]);
  prims.push({ type: "prism", ring, holes, y0: Math.min(...ys), y1: Math.max(...ys), material, tag, side: sideSpan(r, d0, d1) });
}
function dedupe(r: P2[]): P2[] {
  const o: P2[] = [];
  for (const q of r) { const l = o[o.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-4) o.push(q); }
  if (o.length > 1 && Math.hypot(o[0]![0] - o[o.length - 1]![0], o[0]![1] - o[o.length - 1]![1]) < 1e-4) o.pop();
  return o;
}

// ---- opening shapes in (U, y) ----
/** [u0,z0], [u1,z0], [u1,zs], the arch right → left, [u0,zs] (or the rectangle) */
function archOutline(u0: number, u1: number, z0: number, z1: number, arched: boolean): P2[] {
  if (!arched) return [[u0, z0], [u1, z0], [u1, z1], [u0, z1]];
  const r = (u1 - u0) / 2, zs = Math.max(z0, z1 - r), c = (u0 + u1) / 2, pts: P2[] = [[u0, z0], [u1, z0], [u1, zs]];
  for (let k = 1; k < 24; k++) { const a = (Math.PI * k) / 24; pts.push([c + r * Math.cos(a), zs + (z1 - zs) * Math.sin(a)]); }
  pts.push([u0, zs]);
  return pts;
}
/** Sutherland–Hodgman against y ≥ lo and y ≤ hi */
function clipY(poly: P2[], lo: number, hi: number): P2[] {
  const cut = (pts: P2[], keep: (p: P2) => boolean, yv: number): P2[] => {
    const o: P2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      const ka = keep(a), kb = keep(b);
      if (ka) o.push(a);
      if (ka !== kb) { const s = (yv - a[1]) / (b[1] - a[1]); o.push([a[0] + s * (b[0] - a[0]), yv]); }
    }
    return o;
  };
  return dedupe(cut(cut(poly, (p) => p[1] >= lo, lo), (p) => p[1] <= hi, hi));
}

// ---- openings placed on runs ----
type Placed = { o: Opening; run: Run; U0: number; U1: number; z0: number; z1: number; notch: boolean; shift: number };
const placed: Placed[] = [];
const bandOf = (st: Storey) => (st.id === "f1" ? [L.f1, L.f2] : [L.f2, 13]) as [number, number];
for (const sh of sheets) {
  const side = (Object.keys(SHEET_OF) as Side[]).find((k) => SHEET_OF[k] === sh.s.id)!;
  for (const o of sh.ops) {
    if (o.blind) continue;
    let usedAny = false;
    for (const st of [F1, F2]) {
      const [b0, b1] = bandOf(st);
      if (Math.min(o.z1, b1) - Math.max(o.z0, b0) < 0.15) continue;
      const runs = RUNS[st.id].filter((r) => r.side === side);
      const better = (a: Run, b: Run) => (side[0] === "-" ? a.outer < b.outer : a.outer > b.outer);
      let best: Run | null = null;
      for (const r of runs) if (o.u0 >= r.p0 - 3 && o.u1 <= r.p1 + 3 && (!best || better(r, best))) best = r;
      let u0 = o.u0, u1 = o.u1, shift = 0;
      if (!best) {
        for (const r of runs) if (Math.min(o.u1, r.p1) - Math.max(o.u0, r.p0) > 10 && r.p1 - r.p0 >= o.u1 - o.u0 + 4 && (!best || better(r, best))) best = r;
        if (best) { const w = u1 - u0; const mg = Math.min(10, (best.p1 - best.p0 - w) / 2); const nu0 = Math.min(Math.max(u0, best.p0 + mg), best.p1 - mg - w); shift = nu0 - u0; u0 = nu0; u1 = nu0 + w; }
      }
      // a move over 1.5 m is not a drafting offset but an opening of some other wall: dropped, with its reason
      if (best && Math.abs(shift) > 150) { T(`elev:${sh.s.id}`).why.push(`${o.tag} (${st.id}): would need a ${shift.toFixed(0)} cm move — not placed`); best = null; }
      if (!best) { T(`elev:${sh.s.id}`).why.push(`${o.tag} (${st.id}): no outer wall of that face under u ${o.u0.toFixed(0)}–${o.u1.toFixed(0)}`); continue; }
      if (Math.abs(shift) > 0.5) T(`elev:${sh.s.id}`).why.push(`${o.tag} (${st.id}): moved ${shift.toFixed(0)} cm into its bay (it crossed the wall's end)`);
      const [U0, U1] = Urange(side, u0, u1);
      placed.push({ o, run: best, U0, U1, z0: o.z0, z1: o.z1, notch: o.z0 <= b0 + 0.05, shift });
      usedAny = true;
    }
    if (usedAny) T(`elev:${sh.s.id}`).built++; else T(`elev:${sh.s.id}`).dropped++;
  }
}

// ---- the south face (plan +X, onto the terrace) has no sheet: its windows from the plan's frames, typed by the north sheet ----
// The plan draws them in the wall (Rb_ptachim inside the +x runs' band); photo IMG_9805 shows this face: tall arched windows
// over the +3.25 walk. A 130 cm window takes the north sheet's tall window (north@713), a 250 cm one north@2907; reported.
{
  const north = sheets.find((s) => s.s.id === "north")!.ops;
  const typeOf = (w: number) => (Math.abs(w - 130) <= 12 ? north.find((o) => o.tag === "north@713") : Math.abs(w - 250) <= 15 ? north.find((o) => o.tag === "north@2907") : undefined);
  const PT = T("elev:south (plan)");
  const runsF1 = RUNS.f1.filter((r) => r.side === "+x");
  const spans: Array<{ u0: number; u1: number }> = [];
  for (const p of F1.ps) {
    if (isOverlay(p) || !OPEN_L.test(p.layer) || !p.pts) continue;
    const b = bbOf(p.pts); const w = b.y1 - b.y0;
    if (w < 80 || w > 320 || b.x1 - b.x0 > 60) continue;
    if (!runsF1.some((r) => b.x0 >= Math.min(r.outer, r.inner) - 15 && b.x1 <= Math.max(r.outer, r.inner) + 15 && b.y0 >= r.p0 - 5 && b.y1 <= r.p1 + 5)) continue;
    const s = spans.find((x) => b.y0 < x.u1 + 3 && b.y1 > x.u0 - 3);
    if (s) { s.u0 = Math.min(s.u0, b.y0); s.u1 = Math.max(s.u1, b.y1); } else spans.push({ u0: b.y0, u1: b.y1 });
  }
  // its doors: a swing whose hinge stands in a +x run's band, in the rhythm of the windows → the north sheet's door-window (north@2382)
  const doorT = north.find((o) => o.tag === "north@2382");
  const doorSpans: Array<{ u0: number; u1: number }> = [];
  for (const d of F1.doors) {
    const e = { x: d.hinge.x + d.dir.x * d.w, y: d.hinge.y + d.dir.y * d.w };
    const y0 = Math.min(d.hinge.y, e.y), y1 = Math.max(d.hinge.y, e.y);
    if (y1 - y0 < 60 || !runsF1.some((r) => d.hinge.x >= Math.min(r.outer, r.inner) - 15 && d.hinge.x <= Math.max(r.outer, r.inner) + 15 && y0 >= r.p0 - 5 && y1 <= r.p1 + 5)) continue;
    if (spans.some((s) => s.u0 < y1 && s.u1 > y0)) continue;
    // a double door's two leaves are one doorway
    const s = doorSpans.find((x) => y0 < x.u1 + 10 && y1 > x.u0 - 10);
    if (s) { s.u0 = Math.min(s.u0, y0); s.u1 = Math.max(s.u1, y1); } else doorSpans.push({ u0: y0, u1: y1 });
  }
  const typed = [...spans.map((s) => ({ ...s, door: false })), ...doorSpans.map((s) => ({ ...s, door: true }))];
  for (const s of typed.sort((a, b) => a.u0 - b.u0)) {
    const t = s.door ? doorT : typeOf(s.u1 - s.u0);
    if (s.door && t) { const c = (s.u0 + s.u1) / 2, w = t.u1 - t.u0; s.u0 = c - w / 2; s.u1 = c + w / 2; }
    PT.read++;
    if (!t) { PT.dropped++; PT.why.push(`plan window ${Math.round(s.u1 - s.u0)} cm at Y ${Math.round(s.u0)}: no sheet type of that width`); continue; }
    const du = s.u0 - t.u0, w = t.u1 - t.u0;
    const o: Opening = { ...t, sheet: "north", u0: s.u0, u1: s.u0 + w, panes: t.panes.map((p) => ({ ...p, u0: p.u0 + du, u1: p.u1 + du })), sur: t.sur ? { ...t.sur, u0: t.sur.u0 + du, u1: t.sur.u1 + du } : null, tag: `south@${Math.round(s.u0)}` };
    let used = false;
    for (const st of [F1, F2]) {
      const [b0, b1] = bandOf(st);
      if (Math.min(o.z1, b1) - Math.max(o.z0, b0) < 0.15) continue;
      const r = RUNS[st.id].filter((x) => x.side === "+x" && o.u0 >= x.p0 - 3 && o.u1 <= x.p1 + 3).sort((a, b) => b.outer - a.outer)[0];
      if (!r) continue;
      const [U0, U1] = Urange("+x", o.u0, o.u1);
      placed.push({ o, run: r, U0, U1, z0: o.z0, z1: o.z1, notch: o.z0 <= b0 + 0.05, shift: 0 });
      used = true;
    }
    if (used) { PT.built++; PT.why.push(`${o.tag}: ${Math.round(s.u1 - s.u0)} cm in the plan → the north sheet's ${t.tag}${s.door ? " (a door in the plan)" : ""} (assumed: this face has no sheet)`); }
    else { PT.dropped++; PT.why.push(`${o.tag}: no outer wall run holds it`); }
  }
  say(`south face from the plan: ${PT.built} windows placed of ${PT.read}`);
}

// ---- the top line of each face from its sheet's silhouette ----
const silOf = new Map(sheets.map((sh) => [sh.s.id, sh.sil]));
const PARAPET = { hall: 12.13, wing: 10.73 };
/**
 * A wall's top. The side sheets (west, east) see the wings and the hall end-on, each with its own cornice: there a wall's
 * top is its zone's (hall and bump +12.13, wings and the east block +10.73) and the silhouette may only lower it. The north
 * sheet is the street front itself: one plane whose cornice runs its whole length at +12.13 with no +10.73 line in it, so
 * the front rises as a screen over the wing's lower roof — there the sheet's own line is the top.
 */
function topAt(side: Side, pAlong: number, midX: number) {
  const X = side[1] === "y" ? pAlong : midX;
  const Y = side[1] === "y" ? midX : pAlong;
  const zoneTop = tallAt(X, Y) ? PARAPET.hall : PARAPET.wing;
  const sid = SHEET_OF[side]; const s = sid ? silOf.get(sid)!(pAlong) : 0;
  if (sid === "north" && s > 8) return Math.round(s * 100) / 100;
  return zoneTop; // a side sheet's lower lines are its windows' surrounds and the wings beside, never this wall's top
}

// ---- build the runs ----
const STONE: BuildingMaterial = "jerusalemStone";
const runSteps = new Map<Run, Array<{ u0: number; u1: number; h: number }>>();
for (const st of [F1, F2]) {
  const [b0] = bandOf(st);
  for (const r of RUNS[st.id]) {
    const [Ua, Ub] = Urange(r.side, r.p0, r.p1);
    const depth = (r.t * CELL) / 100;
    // the top profile (steps, 10 cm samples)
    const steps: Array<{ u0: number; u1: number; h: number }> = [];
    if (st.id === "f1") steps.push({ u0: Ua, u1: Ub, h: L.f2 });
    else for (let p = r.p0; p < r.p1; p += 10) {
      const h = topAt(r.side, p + 5, (r.outer + r.inner) / 2); const [q0, q1] = Urange(r.side, p, Math.min(p + 10, r.p1));
      const s = steps.find((x) => x.h === h && (Math.abs(x.u1 - q0) < 1e-6 || Math.abs(x.u0 - q1) < 1e-6));
      if (s) { s.u0 = Math.min(s.u0, q0); s.u1 = Math.max(s.u1, q1); } else steps.push({ u0: q0, u1: q1, h });
    }
    steps.sort((a, b) => a.u0 - b.u0);
    runSteps.set(r, steps);
    const stepAt = (u: number) => steps.find((s) => s.u0 - 1e-6 <= u && s.u1 + 1e-6 >= u) ?? steps[0]!;
    const mine = placed.filter((pl) => pl.run === r);
    const notches = mine.filter((pl) => pl.notch).sort((a, b) => a.U0 - b.U0);
    const ring: P2[] = [[Ua, b0]];
    for (const n of notches) {
      const h = stepAt((n.U0 + n.U1) / 2).h - (st.id === "f1" ? 0.01 : 0.2), zt = Math.min(n.z1, h);
      const arched = n.o.arched && n.z1 <= h;
      ring.push([n.U0, b0]);
      if (arched) ring.push(...archOutline(n.U0, n.U1, b0, zt, true).slice(2).reverse());
      else ring.push([n.U0, zt], [n.U1, zt]);
      ring.push([n.U1, b0]);
    }
    ring.push([Ub, b0]);
    for (let s = steps.length - 1; s >= 0; s--) ring.push([steps[s]!.u1, steps[s]!.h], [steps[s]!.u0, steps[s]!.h]);
    const holes: P2[][] = [];
    for (const pl of mine.filter((x) => !x.notch)) {
      const top = (st.id === "f1" ? L.f2 - 0.01 : stepAt((pl.U0 + pl.U1) / 2).h - 0.3);
      const hole = clipY(archOutline(pl.U0, pl.U1, pl.z0, pl.z1, pl.o.arched), b0 + 0.01, top);
      if (hole.length >= 3) holes.push(hole);
    }
    facePrism(r, dedupe(ring), holes, -depth, 0, STONE, `wall:${st.id}:${OUT_DIR[r.side]}`);
    T(`facade:${st.id}`).built++;
    // cornices on the top storey: the sheets' lines at −45, −25, −5 cm under the top, and the cap
    if (st.id === "f2") for (const s of steps) {
      faceBox(r, s.u0, s.u1, s.h - 0.45, s.h - 0.25, -0.02, 0.05, STONE, `cornice:${OUT_DIR[r.side]}`);
      faceBox(r, s.u0, s.u1, s.h - 0.25, s.h - 0.05, -0.02, 0.08, STONE, `cornice:${OUT_DIR[r.side]}`);
      faceBox(r, s.u0, s.u1, s.h - 0.05, s.h, -depth, 0.1, STONE, `cornice:${OUT_DIR[r.side]}`);
    }
    // the windows: a frame plate with the panes' holes, the glass behind it
    for (const pl of mine) {
      const lo = pl.notch ? b0 : b0 + 0.01, hi = (st.id === "f1" ? L.f2 - 0.01 : stepAt((pl.U0 + pl.U1) / 2).h - 0.3);
      const zt = pl.notch ? Math.min(pl.z1, stepAt((pl.U0 + pl.U1) / 2).h - (st.id === "f1" ? 0.01 : 0.2)) : pl.z1;
      const shape = clipY(archOutline(pl.U0, pl.U1, pl.z0, zt, pl.o.arched), lo, hi);
      if (shape.length < 3) continue;
      const map = (u: number) => U(r.side, u + pl.shift);
      const panes: P2[][] = [];
      for (const p of pl.o.panes) {
        const a = map(p.u0), b = map(p.u1);
        const q = clipY(archOutline(Math.min(a, b) + 0.005, Math.max(a, b) - 0.005, p.z0 + 0.005, p.z1 - 0.005, false), lo + 0.02, hi - 0.02);
        if (q.length >= 3 && Math.max(...q.map((v) => v[1])) - Math.min(...q.map((v) => v[1])) > 0.05) panes.push(q);
      }
      const paneTop = pl.o.panes.length ? Math.max(...pl.o.panes.map((p) => p.z1)) : pl.z0;
      if (pl.o.arched && pl.z1 <= hi + 1e-6 && pl.z1 - paneTop > 0.25) {
        const q = clipY(archOutline(pl.U0 + 0.05, pl.U1 - 0.05, paneTop + 0.05, pl.z1 - 0.05, true), Math.max(lo + 0.02, paneTop + 0.05), hi - 0.02);
        if (q.length >= 3) panes.push(q);
      }
      if (!panes.length) panes.push(clipY(archOutline(pl.U0 + 0.05, pl.U1 - 0.05, pl.z0 + 0.05, zt - 0.05, pl.o.arched), lo + 0.05, hi - 0.05));
      facePrism(r, shape, panes, -0.16, -0.1, "frame", `window:${pl.o.tag}`);
      facePrism(r, shape, [], -0.19, -0.17, "glass", `glass:${pl.o.tag}`);
      // a window through both storeys meets the +7.04 slab: the frame's transom covers the 2 cm of wall the two storeys' holes leave
      if (st.id === "f1" && pl.z0 < L.f2 - 0.3 && pl.z1 > L.f2 + 0.3) { faceBox(r, pl.U0, pl.U1, L.f2 - 0.05, L.f2 + 0.05, -0.16, -0.005, "frame", `transom:${pl.o.tag}`); T("transoms").built++; }
      // the stone surround the sheet draws (RB_mabat_5), where it stands whole inside this storey
      const su = pl.o.sur;
      if (su && !pl.notch && su.z0 > lo && su.z1 < hi && su.z0 < pl.z0 - 0.02 && su.z1 > pl.z1 + 0.02) {
        const [s0, s1] = Urange(r.side, su.u0 + pl.shift, su.u1 + pl.shift);
        if (s0 < pl.U0 - 0.02 && s1 > pl.U1 + 0.02) {
          facePrism(r, archOutline(s0, s1, su.z0, su.z1, pl.o.arched), [archOutline(pl.U0, pl.U1, pl.z0, pl.z1, pl.o.arched)], -0.02, 0.04, "stoneDeep", `surround:${pl.o.tag}`);
          T("surrounds").built++;
        }
      }
    }
  }
}

// ---- blind arches: the sign over the porch, the ark's arch on the east face ----
for (const sh of sheets) {
  const side = (Object.keys(SHEET_OF) as Side[]).find((k) => SHEET_OF[k] === sh.s.id)!;
  for (const o of sh.ops.filter((x) => x.blind)) {
    const zm = (o.z0 + o.z1) / 2;
    const st = zm < L.f2 ? F1 : F2;
    if (o.z1 < L.f1 + 0.2) { T(`elev:${sh.s.id}`).dropped++; T(`elev:${sh.s.id}`).why.push(`${o.tag}: a blind outline on the existing storey (${o.z0.toFixed(2)}–${o.z1.toFixed(2)}), which the sheets draw blank`); continue; }
    const runs = RUNS[st.id].filter((r) => r.side === side && Math.min(o.u1, r.p1) - Math.max(o.u0, r.p0) > (o.u1 - o.u0) * 0.6);
    const r = runs.sort((a, b) => (side[0] === "-" ? a.outer - b.outer : b.outer - a.outer))[0];
    if (!r) { T(`elev:${sh.s.id}`).dropped++; T(`elev:${sh.s.id}`).why.push(`${o.tag}: blind arch with no wall of that face under it`); continue; }
    // a blind arch that overhangs its wall's end is moved into the wall (the sheet draws the porch's bump 1.1 m off the plan)
    const lo = o.sur ? Math.min(o.u0, o.sur.u0) : o.u0, hi = o.sur ? Math.max(o.u1, o.sur.u1) : o.u1;
    let sh0 = 0;
    if (lo < r.p0 || hi > r.p1) { if (hi - lo <= r.p1 - r.p0) sh0 = (r.p0 + r.p1) / 2 - (lo + hi) / 2; T(`elev:${sh.s.id}`).why.push(`${o.tag}: moved ${sh0.toFixed(0)} cm onto the middle of its wall (it overhung the wall's end)`); }
    const [U0, U1] = Urange(side, o.u0 + sh0, o.u1 + sh0);
    if (o.sur) { const [s0, s1] = Urange(side, o.sur.u0 + sh0, o.sur.u1 + sh0); facePrism(r, archOutline(s0, s1, o.sur.z0, o.sur.z1, true), [archOutline(U0, U1, o.z0, o.z1, true)], -0.02, 0.06, STONE, `blind-frame:${o.tag}`); }
    facePrism(r, archOutline(U0, U1, o.z0, o.z1, true), [], -0.02, 0.01, "stoneDeep", `blind:${o.tag}`);
    // the street front's arched panel carries the name, as the north sheet letters it (two lines, its LED hidden behind)
    if (sh.s.id === "north" && o.z0 > L.f2) {
      const um = (U0 + U1) / 2, n = { "-x": { x: -1, z: 0 }, "+x": { x: 1, z: 0 }, "-y": { x: 0, z: 1 }, "+y": { x: 0, z: -1 } }[side];
      const sp = sideSpan(r, 0.02, 0.03), t = (sp.t0 + sp.t1) / 2;
      const at = (y: number) => (sp.along === "x" ? { x: um, y, z: t } : { x: t, y, z: um });
      const zc = o.z0 + (o.z1 - o.z0) * 0.42;
      prims.push({ type: "text", text: "בית כנסת", at: at(zc + 0.28), facing: n, heightM: 0.42, material: "signage", tag: "sign" });
      prims.push({ type: "text", text: "\"אבי עזרי\"", at: at(zc - 0.4), facing: n, heightM: 0.5, material: "signage", tag: "sign" });
      T("sign").built += 2;
    }
    T(`elev:${sh.s.id}`).built++;
    report[`blind:${o.tag}`] = { run: `${st.id}:${OUT_DIR[side]}`, U: [U0, U1], z: [o.z0, o.z1] };
  }
}

// ======================================================================================================================
// Inside walls, slabs, roofs, the existing storey, terraces.
// ======================================================================================================================
const W = (g: Grid, i: number) => (g.x0 + i * CELL) / 100; // world x of a cell column edge
const Zc = (g: Grid, j: number) => -(g.y0 + j * CELL) / 100; // world z of a cell row edge
function rectBox(g: Grid, q: { i0: number; j0: number; i1: number; j1: number }, y0: number, y1: number, material: BuildingMaterial, tag: string) {
  const xa = W(g, q.i0), xb = W(g, q.i1), za = Zc(g, q.j1), zb = Zc(g, q.j0);
  box([(xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2], [xb - xa, y1 - y0, zb - za], material, tag);
}
/** a cell of one grid read in another (the storeys' grids share the frame but not always the origin) */
const sampleCell = (from: Grid, i: number, j: number, to: Grid) => {
  const x = from.x0 + (i + 0.5) * CELL, y = from.y0 + (j + 0.5) * CELL;
  const ii = Math.floor((x - to.x0) / CELL), jj = Math.floor((y - to.y0) / CELL);
  return ii < 0 || jj < 0 || ii >= to.nx || jj >= to.ny ? -1 : jj * to.nx + ii;
};
const nearZone = (Xa: number, Xb: number) => [ZONE.hall[0], ZONE.hall[1]].some((b) => Math.abs((Xa + Xb) / 2 - b) < 60 && Xb - Xa < 80);

// the double-height void over the hall (read first: the gallery's front is the wall it borders)
const voidRegions = new Set<number>();
for (const p of F2.voidText) {
  const i = Math.floor((p.x - F2.g.x0) / CELL), j = Math.floor((p.y - F2.g.y0) / CELL);
  // the text may stand in its own small frame: the void is the largest room within 3 m of it
  let best = 0;
  for (let dj = -60; dj <= 60; dj++) for (let di = -60; di <= 60; di++) { const rg = F2.g.region[(j + dj) * F2.g.nx + i + di]; if (rg && F2.g.regionDepth[rg]! > 7 && (!best || F2.g.regionSize[rg]! > F2.g.regionSize[best]!)) best = rg; }
  if (best) voidRegions.add(best);
}
report.void = { texts: F2.voidText.length, regions: [...voidRegions].map((r) => ({ id: r, cells: F2.g.regionSize[r], m2: ((F2.g.regionSize[r]! * CELL * CELL) / 1e4).toFixed(1) })) };
say(`double-height void: ${JSON.stringify(report.void)}`);
const RAIL_H = 1.1;
for (const st of [F1, F2]) {
  const g = st.g, cl = claimed.get(st)!;
  const ceil = (X: number, Y: number) => (st.id === "f1" ? L.f2 - SLAB : roofOf(X, Y) - SLAB);
  const rs = rects(g, (k) => !!st.wall[k] && !cl[k], (k) => (st.doorCell[k]! >= 0 ? 1 : 0));
  // a wall rect with the void on one side and the gallery's floor on the other is the gallery's front: a parapet, not a wall
  const bordersVoid = (q: { i0: number; j0: number; i1: number; j1: number }) => {
    if (st.id !== "f2") return false;
    let v = 0, n = 0;
    for (let i = q.i0; i < q.i1; i++) for (const j of [q.j0 - 2, q.j1 + 1]) { n++; if (voidRegions.has(g.region[j * g.nx + i]!)) v++; }
    for (let j = q.j0; j < q.j1; j++) for (const i of [q.i0 - 2, q.i1 + 1]) { n++; if (voidRegions.has(g.region[j * g.nx + i]!)) v++; }
    return v > n * 0.3 && v < n * 0.7; // void all round: a wall standing up through the void (the ark niche), not its edge
  };
  let nW = 0, nL = 0, nP = 0;
  for (const q of rs) {
    if ((q.i1 - q.i0) * (q.j1 - q.j0) < 2) continue;
    const Xa = g.x0 + q.i0 * CELL, Xb = g.x0 + q.i1 * CELL, Xm = (Xa + Xb) / 2;
    let top = ceil(Xm, g.y0 + ((q.j0 + q.j1) / 2) * CELL), mat: BuildingMaterial = "plaster";
    // the hall's side walls stand over the wings' roofs to the hall's parapet
    if (st.id === "f2" && nearZone(Xa, Xb)) { top = PARAPET.hall; mat = STONE; }
    if (q.key !== 1 && !nearZone(Xa, Xb) && bordersVoid(q)) {
      rectBox(g, q, st.floor, st.floor + RAIL_H - 0.05, "plaster", "gallery:parapet");
      rectBox(g, { i0: q.i0 - 1, j0: q.j0 - 1, i1: q.i1 + 1, j1: q.j1 + 1 }, st.floor + RAIL_H - 0.05, st.floor + RAIL_H, "walnut", "gallery:parapet-cap");
      nP++; continue;
    }
    if (q.key === 1) { rectBox(g, q, st.floor + 2.2, top, mat, `lintel:${st.id}`); nL++; }
    else { rectBox(g, q, st.floor, top, mat, `wall:${st.id}:inside`); nW++; }
  }
  T(`walls:${st.id}`).built += nW; T(`doors:${st.id}`).built += nL;
  T(`walls:${st.id}`).why.push(`${nW} inside wall pieces, ${nL} door heads${nP ? `, ${nP} gallery-front pieces as a ${RAIL_H} m parapet (the sheet hatches it as a 20 cm wall over the void; no screen above it is drawn)` : ""}`);
}

// floors and roofs
{
  const g = F1.g, cl = claimed.get(F1)!;
  for (const q of rects(g, (k) => !g.outside[k] && !cl[k])) rectBox(g, q, L.f1 - SLAB, L.f1, "concrete", "slab:f1");
  // the existing storey under it: plaster, to the beit-midrash floor under the outer walls
  for (const q of rects(g, (k) => !g.outside[k], (k) => (cl[k] ? 1 : 0))) rectBox(g, q, 0, q.key ? L.f1 : L.f1 - SLAB, "render", "existing:ground");
  // roof terraces: F1 inside cells the gallery storey does not cover
  for (const q of rects(g, (k) => { if (g.outside[k]) return false; const i = k % g.nx, j = (k - i) / g.nx; const kk = sampleCell(g, i, j, F2.g); return kk < 0 || !!F2.g.outside[kk]; })) rectBox(g, q, L.f2 - SLAB, L.f2, "terraceTile", "roof:f1");
}
{
  const g = F2.g, cl = claimed.get(F2)!;
  for (const q of rects(g, (k) => !g.outside[k] && !cl[k] && !voidRegions.has(g.region[k]!) && !inFoot(STAIRS, g.x0 + ((k % g.nx) + 0.5) * CELL, g.y0 + (Math.floor(k / g.nx) + 0.5) * CELL))) rectBox(g, q, L.f2 - SLAB, L.f2, "concrete", "slab:f2");
  const ZN = ["bump", "wing", "hall", "east"] as const;
  const cX = (k: number) => g.x0 + ((k % g.nx) + 0.5) * CELL, cY = (k: number) => g.y0 + (Math.floor(k / g.nx) + 0.5) * CELL;
  for (const q of rects(g, (k) => !g.outside[k] && !cl[k], (k) => ZN.indexOf(zoneOf(cX(k))) * 2 + (tallAt(cX(k), cY(k)) ? 1 : 0))) {
    const roof = roofOf(g.x0 + (q.i0 + 0.5) * CELL, g.y0 + (q.j0 + 0.5) * CELL);
    rectBox(g, q, roof - SLAB, roof, "renderGray", `roof:${ZN[q.key >> 1]}`);
  }
}

// terraces at +3.25: the existing storey's roof, hatched (Rb_h_kayam, not solid) outside the beit-midrash walls
{
  const g = F1.g; let n = 0;
  for (const p of F1.ps.filter((p) => !isOverlay(p) && /^Rb_h_kayam$/.test(p.layer) && p.rings && !p.solid)) {
    for (const ring of p.rings!) {
      let a = 0; for (let i = 0; i < ring.length; i++) { const P = ring[i]!, Q = ring[(i + 1) % ring.length]!; a += P.x * Q.y - Q.x * P.y; }
      const m2 = Math.abs(a) / 2 / 1e4;
      const c = { x: ring.reduce((s, q) => s + q.x, 0) / ring.length, y: ring.reduce((s, q) => s + q.y, 0) / ring.length };
      const k = Math.floor((c.y - g.y0) / CELL) * g.nx + Math.floor((c.x - g.x0) / CELL);
      if (m2 < 3) { T("terraces").dropped++; T("terraces").why.push(`hatch ring ${m2.toFixed(1)} m² too small for a terrace`); continue; }
      if (!g.outside[k]) { T("terraces").merged++; T("terraces").why.push(`hatch ring ${m2.toFixed(1)} m² inside the walls (existing wall/floor hatch)`); continue; }
      const pr: P2[] = ring.map((q) => [q.x / 100, -q.y / 100]);
      prims.push({ type: "prism", ring: pr, y0: L.terrace - 0.2, y1: L.terrace, material: "terraceTile", tag: "terrace" });
      prims.push({ type: "prism", ring: pr, y0: 0, y1: L.terrace - 0.2, material: "render", tag: "existing:terrace" });
      n++;
    }
  }
  T("terraces").read += n; T("terraces").built += n;
  say(`terraces: ${n}`);
}

// the ground round it (the site comes in its own stage)
box([15.7, -0.05, -15.3], [400, 0.1, 400], "paving", "site:ground");
// the streets round the plot (the 2018 aerial: roads on every side); their levels away from the north front are not printed
box([15.7, 0.01, 14.5], [400, 0.02, 9], "asphalt", "site:street-south");
box([47, 0.01, -15.3], [9, 0.02, 400], "asphalt", "site:street-east");


// ======================================================================================================================
// The site, from the beit-midrash sheet's own lines (layer 0 and RB_mabat_5 outside the walls), its marks and the photos:
// the north side is a sunken court at ±0.00 (the kindergartens' yard, "דשא סינטטי") under a +3.25 walk along the facade
// (photo IMG_9805), bridged to the street; on the east a C stair of 2 × 20 risers from the +4.40 landing to the yard.
// ======================================================================================================================
const Wp = (x: number, y: number): P2 => [x / 100, -y / 100];
const prismPlan = (ring: Array<[number, number]>, y0: number, y1: number, material: BuildingMaterial, tag: string) =>
  prims.push({ type: "prism", ring: ring.map(([x, y]) => Wp(x, y)), y0, y1, material, tag });
const boxPlan = (X0: number, X1: number, Y0: number, Y1: number, y0: number, y1: number, material: BuildingMaterial, tag: string) =>
  box([(X0 + X1) / 200, (y0 + y1) / 2, -(Y0 + Y1) / 200], [(X1 - X0) / 100, y1 - y0, (Y1 - Y0) / 100], material, tag);
const SITE = T("site");
const WALK = 3.25, LANDING = 4.4, RAIL = 1.05;
{
  // the walk along the north face (X 0 → the wing's face at 2.75 m), the porch's floor, and the walk's stone parapet
  const bridges: Array<[number, number]> = [[641, 850], [1290, 1640], [2642, 2792]];
  boxPlan(0, 275, 320, 2925, 0, WALK - 0.2, "render", "site:walk-base");
  boxPlan(0, 275, 320, 2925, WALK - 0.2, WALK, "paving", "site:walk");
  boxPlan(0, 275, 1355, 1755, WALK, L.f1, "floorStone", "site:porch-floor");
  let y = 320;
  for (const [b0, b1] of [...bridges, [2925, 2925] as [number, number]]) { if (b0 - y > 20) boxPlan(-20, 0, y, b0, WALK - 0.2, WALK + RAIL, STONE, "site:walk-parapet"); y = b1; }
  SITE.built += 3; SITE.why.push("walk at +3.25 along the north face with its parapet, porch floor at +3.30");
  // the bridges to the street over the sunken court: their side walls are the sheet's 30 cm strips
  const decks: Array<Array<[number, number]>> = [
    [[-401, 610], [263, 671], [264, 850], [-410, 819]],
    [[-351, 1283], [0, 1320], [0, 1630], [-312, 1636]],
    [[-185, 2642], [0, 2642], [0, 2792], [-152, 2792]],
  ];
  for (const d of decks) prismPlan(d, WALK - 0.4, WALK, "paving", "site:bridge");
  const strips: Array<Array<[number, number]>> = [
    [[263, 641], [-401, 580], [-398, 610], [260, 671]], [[264, 850], [-410, 783], [-410, 819], [264, 880]],
    [[-347, 1253], [-351, 1283], [0, 1320], [0, 1290]], [[-317, 1614], [0, 1625], [0, 1645], [-312, 1636]],
    [[-185, 2637], [0, 2637], [0, 2642], [-185, 2642]], [[-152, 2792], [0, 2792], [0, 2797], [-151, 2797]],
  ];
  for (const s of strips) prismPlan(s, WALK - 0.4, WALK + RAIL, STONE, "site:bridge-wall");
  SITE.built += decks.length; SITE.why.push(`${decks.length} bridges at +3.25 with their side walls (3 risers on the first and 4 by the porch not stepped: their levels are not printed)`);
  // the sunken court's synthetic grass
  prismPlan([[-440, -300], [0, -300], [0, 1290], [-350, 1250]], 0, 0.02, "grass", "site:court-grass");
  // the plot's edges: the band round the west and south (retaining the street on the west), the north-east bands
  const plotBand: Array<[number, number]> = [[-470, -774], [-455, -482], [-439, -166], [-416, 290], [-401, 580], [-375, 786], [-370, 822], [-360, 899], [-345, 900], [-314, 1242], [-369, 1247], [-400, 903], [-437, 599], [-460, 143], [-509, -816], [388, -709], [1912, -517], [2367, -459], [2362, -422], [1653, -512], [483, -659]];
  prismPlan(plotBand, 0, 1.6, STONE, "site:plot-wall");
  // the street west of the plot, at the bridges' level
  boxPlan(-2000, -480, -2600, 6000, 0, WALK + 0.05, "asphalt", "site:street-west");
  boxPlan(-480, -460, -2600, 6000, 0, WALK + 0.05, STONE, "site:retaining-west");
  SITE.built += 4; SITE.why.push("plot band 1.6 m (its height is not printed), street west at +3.30 retained by a stone wall");
}
{
  // the C stair: two arms round a C-shaped core, each 20 risers of 22 cm from the +4.40 landing to the yard
  const R_IN = 1.92, R_OUT = 3.61, WALL = 0.2;
  const arms = [{ c: [34.97, -13.38] as P2, a0: Math.PI, a1: Math.PI * 2 - 0.157, sg: 1 }, { c: [34.97, -16.57] as P2, a0: Math.PI, a1: 0.157, sg: -1 }];
  const sector = (c: P2, r0: number, r1: number, a: number, b: number): P2[] => {
    const n = Math.max(2, Math.ceil(Math.abs(b - a) / 0.08)), pts: P2[] = [];
    for (let k = 0; k <= n; k++) { const t = a + ((b - a) * k) / n; pts.push([c[0] + r1 * Math.cos(t), c[1] - r1 * Math.sin(t)]); }
    for (let k = n; k >= 0; k--) { const t = a + ((b - a) * k) / n; pts.push([c[0] + r0 * Math.cos(t), c[1] - r0 * Math.sin(t)]); }
    return pts;
  };
  for (const arm of arms) {
    // plan angle: model x = cx + r cos, model z = cz − r sin (plan Y up = model −z); the lower arm sweeps through plan −Y
    const span = arm.sg > 0 ? arm.a1 - arm.a0 : arm.a1 - arm.a0;
    for (let k = 0; k < 20; k++) {
      const a = arm.a0 + (span * k) / 20, b = arm.a0 + (span * (k + 1)) / 20;
      const h = LANDING - 0.22 * (k + 1);
      const ang = (t: number) => t; // plan angle = the sector angle (model z = −plan Y)
      if (h > 0.01) prims.push({ type: "prism", ring: sector(arm.c, R_IN, R_OUT, ang(a), ang(b)), y0: 0, y1: h, material: "paving", tag: "stair:c" });
      prims.push({ type: "prism", ring: sector(arm.c, R_OUT, R_OUT + WALL, ang(a), ang(b)), y0: 0, y1: Math.max(h, 0) + RAIL, material: STONE, tag: "stair:c-wall" });
      prims.push({ type: "prism", ring: sector(arm.c, R_IN - 0.1, R_IN, ang(a), ang(b)), y0: 0, y1: Math.max(h, 0) + RAIL, material: STONE, tag: "stair:c-core" });
    }
  }
  // the landing between the arms and its spine, and the +4.40 strip on the terrace with five steps down to +3.25
  boxPlan(3145, 3294, 1348, 1647, 0, LANDING, "paving", "stair:c-landing");
  boxPlan(3294, 3304, 1336, 1651, 0, LANDING + RAIL, STONE, "stair:c-spine");
  boxPlan(2990, 3145, 1348, 1647, WALK, LANDING, "paving", "terrace:upper");
  for (let k = 1; k <= 5; k++) boxPlan(2990 - k * 30, 2990 - (k - 1) * 30, 1348, 1647, WALK, LANDING - 0.23 * k, "paving", "terrace:steps");
  // the terrace's parapet on the sheet (RB_mabat_5, 20 cm)
  prismPlan([[2495, 2813], [3145, 2813], [3145, 1647], [3125, 1647], [3125, 2793], [2495, 2793]], WALK, WALK + RAIL, STONE, "terrace:parapet");
  SITE.built += 4; SITE.why.push("C stair 2 × 20 risers (22 cm) on the sheet's rings, landing +4.40, the terrace's parapet; the +4.40 strip's steps down to +3.25 assumed (5 × 23 cm)");
}
// ======================================================================================================================
// The inside: every block on the two plans built as what it draws (interior.mts)
// ======================================================================================================================
report.interior = buildInterior({ storeys: [F1, F2], stairs: STAIRS, voidRegions, claimed, levels: { f1: L.f1, f2: L.f2 }, slab: SLAB, roofOf, prims, T, say });

// ======================================================================================================================
// Output
// ======================================================================================================================
const ext = { x: -3, z: -33.6, width: 37.5, depth: 36.6, yMin: 0, yMax: PARAPET.hall };
const model = { name: "בית כנסת אבי עזרי", primitives: prims, extent: ext, shadowReachM: 60, north: { x: -1, z: 0 } };
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify(model));
const PT = (72 / 25.4) * 10;
const sheet = { shift: { x: ext.x - 4, y: ext.z - 4 }, sheetWidth: (ext.width + 8) * PT, sheetHeight: (ext.depth + 8) * PT };
const outline: P2[] = [[0, 0], [31.45, 0], [31.45, -30.63], [0, -30.63]];
const floors = [
  { id: "floor-ground", level: 0, height: L.f1, units: [], ...sheet, outline, roof: false, registration: 1 },
  { id: "floor-first", level: L.f1, height: L.f2 - L.f1, units: [], ...sheet, outline, roof: false, registration: 1 },
  { id: "floor-second", level: L.f2, height: L.roofHall - L.f2, units: [], ...sheet, outline, roof: false, registration: 1 },
];
fs.writeFileSync(path.join(out, "state.json"), JSON.stringify({ floors }));
report.placed = placed.map((p) => ({ tag: p.o.tag, storey: p.run.st.id, face: OUT_DIR[p.run.side], U: [+p.U0.toFixed(2), +p.U1.toFixed(2)], z: [p.z0, p.z1], notch: p.notch, shift: Math.round(p.shift) }));
report.runs = Object.fromEntries((["f1", "f2"] as const).map((id) => [id, RUNS[id].map((r) => ({ face: OUT_DIR[r.side], p: [r.p0, r.p1], outer: r.outer, t: r.t * CELL, top: runSteps.get(r)?.map((s) => s.h) }))]));
report.tally = tally;
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
console.log("\nread | built | merged | dropped | why");
for (const [k, v] of Object.entries(tally)) console.log(`${k.padEnd(16)} ${String(v.read).padStart(4)} ${String(v.built).padStart(5)} ${String(v.merged).padStart(6)} ${String(v.dropped).padStart(7)}  ${[...new Set(v.why)].slice(0, 12).join(" | ")}`);
say(`model: ${prims.length} primitives → ${out}`);
