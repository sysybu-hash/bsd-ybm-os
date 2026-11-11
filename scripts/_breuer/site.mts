/**
 * Breuer 21 — the site: ground heights (m from ±0.00 = +28.45), the survey's trees, and the yard levels the ground tab marks.
 * Inside the plot a closed yard takes the level mark written in it (ק tab); outside the plot the ground is the survey's spot heights
 * (the existing building's floor points inside the plot are not the new ground). What neither gives is interpolated, and said so.
 */
import type { Pt } from "@/lib/projects/dxf-drawing";
import { ABS_ZERO, type Storey } from "./read.mts";
import { buildGrid, CELL, segmentsOf, type Grid } from "./grid.mts";
import { makeTin } from "./tin.mts";

export type Site = {
  plot: Pt[];
  inPlot: (p: Pt) => boolean;
  /** ground at a storey-local point (cm), metres from ±0.00 */
  ground: (p: Pt) => number;
  yard: (p: Pt) => boolean;
  spots: Array<{ at: Pt; h: number; used: boolean }>;
  trees: Array<{ at: Pt; name: string }>;
  marks: Array<{ at: Pt; v: number; zone: number; area: number }>;
  notes: string[];
};

export function pointInPoly(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export function readSite(storeys: Storey[], tower: { g: Grid; inside: (k: number) => boolean }): Site {
  const notes: string[] = [];
  const K = storeys.find((s) => s.id === "ק")!;
  const S = storeys.find((s) => s.id === "שיפוע")!;
  const loc = (st: Storey, q: Pt): Pt => ({ x: q.x - st.origin.x, y: q.y - st.origin.y });
  const plot = (K.pieces.find((p) => p.path.includes("גבולות מעודכנים") && p.layer === "gvul" && p.pts && p.pts.length > 3)?.pts ?? []).map((q) => loc(K, q));
  const inPlot = (p: Pt) => pointInPoly(p, plot);
  // survey
  const spots: Site["spots"] = [];
  const trees: Site["trees"] = [];
  for (const p of S.pieces) {
    if (p.type !== "INSERT" || !p.path.includes("A$C2edb726f") || !p.at) continue;
    const at = loc(S, p.at);
    const h = p.attribs?.find((a) => a.tag === "HEIGHT")?.text.match(/(\d+\.\d+)/);
    const named = p.attribs?.find((a) => a.tag === "MARK" && a.text.trim());
    // a spot with a name is the top of an object (a pillar, a cabinet), not the ground
    if (p.insert === "M1502_P" && h && named) { notes.push(`spot ${h[1]} named "${named.text}" is an object top, not ground`); continue; }
    if (p.insert === "M1502_P" && h) spots.push({ at, h: Number(h[1]) - ABS_ZERO, used: false });
    if (p.insert === "M2801_E") trees.push({ at, name: p.attribs?.find((a) => a.tag === "NAME")?.text ?? "" });
  }
  // yard zones of the ground tab: closed by walls, the site layer's lines and the plot line
  const segs: Array<[Pt, Pt]> = [];
  for (const p of K.pieces) {
    if (!/^(wall|wall2|mabat|gvul)$/.test(p.layer) || p.text || p.dimension) continue;
    if (p.path.some((n) => /^A\$C2edb|מפלס כולל רחוב|צפון-2|^\*D/.test(n))) continue;
    for (const [a, b] of segmentsOf(p)) segs.push([loc(K, a), loc(K, b)]);
  }
  const bx = { x0: Math.min(...plot.map((q) => q.x)), y0: Math.min(...plot.map((q) => q.y)), x1: Math.max(...plot.map((q) => q.x)), y1: Math.max(...plot.map((q) => q.y)) };
  const zg = buildGrid(segs, bx);
  const zoneLevel = new Map<number, number>();
  const marks: Site["marks"] = [];
  for (const p of K.pieces) {
    if (!p.text || !p.at || p.dimension || p.path.includes("A$C2edb726f")) continue;
    const m = /^([±+\-])\s?(\d+\.\d\d)$/.exec(p.text.trim());
    if (!m) continue;
    const v = m[1] === "-" ? -Number(m[2]) : Number(m[2]);
    if (Math.abs(v) > 8) continue;
    const at = loc(K, p.at);
    const i = Math.floor((at.x - zg.x0) / CELL), j = Math.floor((at.y - zg.y0) / CELL);
    let r = 0;
    for (let d = 0; d < 8 && !r; d++) for (let b = -d; b <= d && !r; b++) for (let a = -d; a <= d && !r; a++) { const k = (j + b) * zg.nx + (i + a); if (zg.region[k]) r = zg.region[k]!; }
    // a zone under the tower is a room of the ground storey, not a yard
    const underTower = (() => { const ti = Math.floor((at.x - tower.g.x0) / CELL), tj = Math.floor((at.y - tower.g.y0) / CELL); return ti >= 0 && tj >= 0 && ti < tower.g.nx && tj < tower.g.ny && tower.inside(tj * tower.g.nx + ti); })();
    if (!inPlot(at)) { spots.push({ at, h: v, used: false }); notes.push(`street mark ${v} at ${at.x.toFixed(0)},${at.y.toFixed(0)} taken as ground`); continue; }
    if (r && !underTower && !zoneLevel.has(r)) zoneLevel.set(r, v);
    marks.push({ at, v, zone: underTower ? -1 : r, area: r ? (zg.regionSize[r]! * CELL * CELL) / 1e4 : 0 });
  }
  // "חצר דירת שיפוע": the yard of the slope flat, whose floor is the slope storey's. The east (sheet) elevation shows the ground
  // at −3.00 along that face with the slope storey's openings in view, so the label's zone is at that level even where a ±0.00
  // mark (the garden strip's top at the plot line) was written into the same zone.
  for (const p of K.pieces) {
    if (!p.text || !p.at || !/חצר דירת שיפוע/.test(p.text)) continue;
    const at = loc(K, p.at);
    const i = Math.floor((at.x - zg.x0) / CELL), j = Math.floor((at.y - zg.y0) / CELL);
    let r = 0;
    for (let d = 0; d < 8 && !r; d++) for (let b = -d; b <= d && !r; b++) for (let a = -d; a <= d && !r; a++) { const k = (j + b) * zg.nx + (i + a); if (zg.region[k]) r = zg.region[k]!; }
    if (!r) continue;
    const was = zoneLevel.get(r);
    zoneLevel.set(r, S.level);
    marks.push({ at, v: S.level, zone: r, area: (zg.regionSize[r]! * CELL * CELL) / 1e4 });
    notes.push(`"${p.text}" zone (${((zg.regionSize[r]! * CELL * CELL) / 1e4).toFixed(0)} m²) set to the slope storey ${S.level}${was !== undefined && was !== S.level ? ` (its mark said ${was})` : ""}`);
  }
  // the ground from spots outside the plot (inside it they are the existing building, to be demolished)
  const outer0 = spots.filter((s) => !inPlot(s.at));
  // A spot far off its neighbours (a manhole, a pit) would make a cone in the TIN: dropped and said so.
  const outer = outer0.filter((s) => {
    const near = outer0.filter((o) => o !== s).map((o) => ({ o, d: Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y) })).sort((a, b) => a.d - b.d).slice(0, 5).map((x) => x.o.h).sort((a, b) => a - b);
    const med = near[2] ?? s.h;
    if (Math.abs(s.h - med) > 1.2) { notes.push(`spot ${s.h.toFixed(2)} at ${s.at.x.toFixed(0)},${s.at.y.toFixed(0)} is ${(s.h - med).toFixed(2)} off its neighbours' median: dropped from the ground`); return false; }
    return true;
  });
  outer.forEach((s) => (s.used = true));
  // Outside the plot: linear over the survey's spots (rule 3.15: a TIN, not IDW).
  const tin = makeTin(outer);
  // Inside the plot every yard is flat at a level (rule 3.40). A zone without its own mark takes the nearest mark's level, so
  // steps fall on the walls that close the zones (rule 3.28), not between them.
  const yardMarks = marks.filter((m) => m.zone !== -1);
  const cx = new Map<number, { x: number; y: number; n: number }>();
  for (let k = 0; k < zg.nx * zg.ny; k++) {
    const r = zg.region[k]!; if (!r) continue;
    const i = k % zg.nx, j = (k - i) / zg.nx;
    const c = cx.get(r) ?? cx.set(r, { x: 0, y: 0, n: 0 }).get(r)!;
    c.x += zg.x0 + (i + 0.5) * CELL; c.y += zg.y0 + (j + 0.5) * CELL; c.n++;
  }
  let inferred = 0;
  for (const [r, c] of cx) {
    if (zoneLevel.has(r)) continue;
    const p = { x: c.x / c.n, y: c.y / c.n };
    let best = yardMarks[0]!, bd = Infinity;
    for (const m of yardMarks) { const d = Math.hypot(m.at.x - p.x, m.at.y - p.y); if (d < bd) { bd = d; best = m; } }
    zoneLevel.set(r, best.v); inferred++;
  }
  // The east strip: the car ramp down from Breuer street at 15% ("%%%51"), open to the sky until the ground storey's walk
  // covers it; north of that the walk to the lobby climbs at 8% ("%%%8") from the street mark −0.94 toward ±0.00.
  const EAST = { x0: 2610, x1: 2915 };
  const yGate = -380, yCover = 960, yNorth = 2210;
  const gate = tin({ x: 2760, y: yGate - 150 });
  const eastStrip = (p: Pt) => {
    if (p.x < EAST.x0 || p.x > EAST.x1 || p.y < yGate || p.y > yNorth || !inPlot(p)) return null;
    if (p.y <= yCover) return Math.max(-6.75, gate - (0.15 * (p.y - yGate)) / 100);
    return Math.min(0, -0.94 + (0.08 * (yNorth - p.y)) / 100);
  };
  notes.push(`east strip: car ramp from the gate at ${gate.toFixed(2)} down 15% to ${(gate - (0.15 * (yCover - yGate)) / 100).toFixed(2)} where the ground storey's walk covers it; walk −0.94→±0.00 at 8%`);
  notes.push(`${inferred} unmarked yard zones took their nearest mark's level`);
  const zoneAt = (p: Pt) => {
    const i = Math.floor((p.x - zg.x0) / CELL), j = Math.floor((p.y - zg.y0) / CELL);
    for (let d = 0; d < 8; d++) for (let bb = -d; bb <= d; bb++) for (let aa = -d; aa <= d; aa++) {
      const ii = i + aa, jj = j + bb; if (ii < 0 || jj < 0 || ii >= zg.nx || jj >= zg.ny) continue;
      const r = zg.region[jj * zg.nx + ii]!; if (r && zoneLevel.has(r)) return zoneLevel.get(r)!;
    }
    return null;
  };
  const ground = (p: Pt) => {
    if (inPlot(p)) {
      const e = eastStrip(p); if (e !== null) return e;
      const ti = Math.floor((p.x - tower.g.x0) / CELL), tj = Math.floor((p.y - tower.g.y0) / CELL);
      if (ti >= 0 && tj >= 0 && ti < tower.g.nx && tj < tower.g.ny && tower.inside(tj * tower.g.nx + ti)) return -3.0;
      const z = zoneAt(p); if (z !== null) return z;
    }
    return tin(p);
  };
  notes.push(`${outer.length} survey spots outside the plot make the ground; ${spots.length - outer.length} inside it (existing building) not used`);
  notes.push(`yard zones with a level mark: ${[...zoneLevel].filter(([r]) => zg.regionSize[r]! * CELL * CELL >= 5e4).map(([r, v]) => `${v} (${((zg.regionSize[r]! * CELL * CELL) / 1e4).toFixed(0)} m²)`).join(", ")}; other yard zones from their nearest mark; outside the plot a TIN of the survey`);
  // open ground of the plot (a yard, the east strip), as against the building: windows of the ground storeys face it
  const yard = (p: Pt) => { if (!inPlot(p)) return false; if (eastStrip(p) !== null) return true; const ti = Math.floor((p.x - tower.g.x0) / CELL), tj = Math.floor((p.y - tower.g.y0) / CELL); const under = ti >= 0 && tj >= 0 && ti < tower.g.nx && tj < tower.g.ny && tower.inside(tj * tower.g.nx + ti); return !under && zoneAt(p) !== null; };
  return { plot, inPlot, ground, yard, spots, trees, marks, notes };
}
