// Scratch (Damesek Eliezer dedicated builder): the synagogue from its Revit plans and elevations, every wall ring, opening and
// furniture block placed where the DXF puts it; heights from the elevations. Delete when done.
// npx tsx --conditions=react-server scripts/_damesek/build.mts <house-in dir> <out dir>
import fs from "node:fs";
import path from "node:path";
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
const G = await import("./plan-grid.mts");
const SW = await import("./sweep.mts");
const PR = await import("./partitions.mts");
const FU = await import("./furnish.mts");
type SWPiece = import("./sweep.mts").Piece;

const [dir, out] = [process.argv[2]!, process.argv[3]!];
const LEVELS = [0, 408, 816, 1224];
const ROOF = 1632;
const PLANS = ["M-ground", "M-floor1", "M-floor2", "M-floor3"];
const ELEVS = ["חזית מזרחית", "חזית מערבית", "חזית צפונית", "חזית דרומית"];
const prims: Primitive[] = [];
const report: Record<string, unknown> = {};
const M = (x: number, y: number): [number, number] => [x / 100, -y / 100];

// ---------- instances and families
type Box = { x0: number; y0: number; x1: number; y1: number };
type Inst = { name: string; family: string; layer: string; pieces: DxfPiece[]; box: Box; m?: DxfPiece["m"] };
const famOf = (n: string) => n.replace(/-(\d{4,}|V\d+)-.*$/, "").trim();
function famWH(f: string): [number, number] | null {
  const a = /(\d{2,3})\s*_\s*(\d{2,4})(?:\s|$|_)/.exec(f);
  if (a) return [+a[1]!, +a[2]!];
  const b = /(\d{4})\s*x\s*(\d{4})\s*mm/i.exec(f);
  return b ? [+b[1]! / 10, +b[2]! / 10] : null;
}
function piecePts(p: DxfPiece): Pt[] {
  if (p.circle) return [{ x: p.circle.c.x - p.circle.r, y: p.circle.c.y - p.circle.r }, { x: p.circle.c.x + p.circle.r, y: p.circle.c.y + p.circle.r }];
  return p.pts ?? p.rings?.flat() ?? [];
}
function instances(ps: DxfPiece[]): Inst[] {
  const res: Inst[] = [];
  let cur: Inst | null = null;
  for (const p of ps) {
    if (p.insert && p.path.length === 0) {
      cur = { name: p.insert, family: famOf(p.insert), layer: p.layer, pieces: [], box: { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }, m: p.m };
      res.push(cur);
      continue;
    }
    if (cur && p.path[0] === cur.name) {
      cur.pieces.push(p);
      if (p.type === "TEXT" || p.type === "MTEXT" || p.type === "ATTRIB") continue;
      for (const q of piecePts(p)) {
        cur.box.x0 = Math.min(cur.box.x0, q.x); cur.box.y0 = Math.min(cur.box.y0, q.y);
        cur.box.x1 = Math.max(cur.box.x1, q.x); cur.box.y1 = Math.max(cur.box.y1, q.y);
      }
    } else if (p.path.length === 0) cur = null;
  }
  return res.filter((i) => i.box.x1 > i.box.x0 || i.box.y1 > i.box.y0);
}
const isOpening = (f: string) => /חלון|Window|^BW |Door|Flush|IntSgl|mamad win|Curtain/i.test(f) && !/Mullion|Panel|Service Cabinet/i.test(f);
const isDoor = (i: Inst) => i.layer === "A_DOOR" || /Door|IntSgl|Flush|דלת/i.test(i.family);

// ---------- elevations: openings' true shapes, the silhouette, thin bands
type Shape = { family: string; kind: "arch" | "round" | "rect"; cx: number; cy: number; w: number; bottom: number; top: number; spring: number; r: number; rOuter: number; ew: number; hs?: number[]; vs?: number[]; sp?: Array<[number, number]> };
type Elev = { cw: Array<{ a: Pt; b: Pt }>; name: string; marks: Array<{ e: number; y: number }>; wallBoxes: Box[]; ringBoxes: Box[]; shapes: Shape[]; top: Map<number, number>; otln: Array<{ y: number; e0: number; e1: number }>; bands: Array<{ e0: number; e1: number; y0: number; y1: number; prot?: number }>; map?: { axis: "X" | "Y"; s: 1 | -1; b: number; score: number } };
const NOT_BUILDING = /Level|Grid|Section|Elevation -|Lexus|RPC|Tree|עץ|Spot|צובר|קולטן|Callout|View|Planting|Entourage|people|אדם/i;
/** The frame the block draws inside its opening: transoms (absolute heights) and mullions (offsets from the centre), each a
 * line across most of the glass; the double lines of one bar's two faces count once. */
function barsOf(i: Inst, sh: Shape): Shape {
  if (sh.kind === "round") return sh;
  const segs: Array<[Pt, Pt]> = [];
  for (const p of i.pieces) if (p.pts && !p.arc && !/ANNO|DIMS/.test(p.layer)) for (let j = 0; j + 1 < p.pts.length; j++) segs.push([p.pts[j]!, p.pts[j + 1]!]);
  const lo = sh.bottom, hiY = sh.kind === "arch" ? sh.spring : sh.top, x0 = sh.cx - sh.w / 2, x1 = sh.cx + sh.w / 2;
  const cluster = (vs: number[]) => {
    const out: number[] = [];
    for (const v of vs.sort((a, b) => a - b)) { const l = out[out.length - 1]; if (l != null && v - l < 12) continue; out.push(v); }
    return out;
  };
  const hs = cluster(segs.filter(([a, b]) => Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5 * sh.w && a.y > lo + 25 && a.y < hiY - 25 && Math.min(a.x, b.x) > x0 - 15 && Math.max(a.x, b.x) < x1 + 15).map(([a]) => a.y));
  const vs = cluster(segs.filter(([a, b]) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.3 * (hiY - lo) && a.x > x0 + 15 && a.x < x1 - 15).map(([a]) => a.x - sh.cx));
  return { ...sh, hs, vs };
}
function shapeOf(i: Inst): Shape { return barsOf(i, shapeOf0(i)); }
function shapeOf0(i: Inst): Shape {
  const arcs = i.pieces.filter((p) => p.arc && Math.abs(p.arc.end - p.arc.start) > 2.5).map((p) => p.arc!);
  const circles = i.pieces.filter((p) => p.circle).map((p) => p.circle!);
  const b = i.box, ew = b.x1 - b.x0;
  const rs = [...new Set([...arcs.map((a) => Math.round(a.r)), ...circles.map((c) => Math.round(c.r))])].sort((p, q) => q - p);
  if (/עגול/.test(i.family) && rs.length) {
    const c = circles[0]?.c ?? arcs[0]!.c;
    const r = rs[1] ?? rs[0]!;
    return { family: i.family, kind: "round", cx: c.x, cy: c.y, w: 2 * r, bottom: c.y - r, top: c.y + r, spring: c.y, r, rOuter: rs[0]!, ew };
  }
  if (arcs.length && rs.length) {
    const a = arcs.find((x) => Math.round(x.r) === (rs[1] ?? rs[0]))!;
    const r = a.r, rOuter = rs[0]!;
    return { family: i.family, kind: "arch", cx: a.c.x, cy: a.c.y, w: 2 * r, bottom: b.y0, top: a.c.y + r, spring: a.c.y, r, rOuter, ew };
  }
  const glaz = i.pieces.filter((p) => /GLAZ/.test(p.layer)).flatMap(piecePts);
  const bx = glaz.length
    ? { x0: Math.min(...glaz.map((q) => q.x)), x1: Math.max(...glaz.map((q) => q.x)), y0: Math.min(...glaz.map((q) => q.y)), y1: Math.max(...glaz.map((q) => q.y)) }
    : b;
  return { family: i.family, kind: "rect", cx: (bx.x0 + bx.x1) / 2, cy: (bx.y0 + bx.y1) / 2, w: bx.x1 - bx.x0, bottom: bx.y0, top: bx.y1, spring: bx.y1, r: 0, rOuter: 0, ew };
}
const corniceSteps: string[] = [];
const elevs: Elev[] = ELEVS.map((n) => {
  const ps = G.readPieces(path.join(dir, n + ".dxf"));
  const insts = instances(ps);
  const shapes = insts.filter((i) => isOpening(i.family)).map(shapeOf).filter((s) => s.ew > 40);
  // arches the sheet draws as loose lines, not as a window's block (the lower block's three small arches on the north): the arc
  // gives the head, the two upright lines dropping from its ends the sill
  for (const p of ps) {
    if (!p.arc || p.path.length || !/SEEN|GLAZ|WIND/.test(p.layer) || p.arc.r < 25 || Math.abs(p.arc.end - p.arc.start) < 2.5) continue;
    const { c, r } = p.arc;
    if (shapes.some((sh) => Math.abs(sh.cx - c.x) < 20 && Math.abs(sh.spring - c.y) < 40)) continue;
    let bottom = c.y - 2 * r;
    const jambs = ps.filter((q) => q.pts && !q.path.length && q.pts.length >= 2).flatMap((q) => q.pts!.slice(1).map((b, j) => [q.pts![j]!, b] as const))
      .filter(([a, b]) => Math.abs(a.x - b.x) < 1 && (Math.abs(a.x - (c.x - r)) < 3 || Math.abs(a.x - (c.x + r)) < 3) && Math.abs(Math.max(a.y, b.y) - c.y) < 5);
    if (jambs.length) bottom = Math.min(...jambs.map(([a, b]) => Math.min(a.y, b.y)));
    shapes.push({ family: `loose arch r${Math.round(r)}`, kind: "arch", cx: c.x, cy: c.y, w: 2 * r, bottom, top: c.y + r, spring: c.y, r, rOuter: r, ew: 2 * r });
  }
  // a floor's edge the sheet draws across a tall window (A-FLOR-OTLN: two lines, the slab's underside and top, where the roof
  // slab at +16.32 passes behind the towers' 12.5 m windows) is a band in the glass: an opaque spandrel panel at that height
  const otln = ps.filter((p) => p.pts && /A-FLOR-OTLN/.test(p.layer)).flatMap((p) => p.pts!.slice(1).map((b, j) => [p.pts![j]!, b] as const)).filter(([a, b]) => Math.abs(a.y - b.y) < 0.5);
  for (const sh of shapes) {
    if (sh.kind === "round") continue;
    const x0 = sh.cx - sh.w / 2, x1 = sh.cx + sh.w / 2, hiY = sh.kind === "arch" ? sh.spring + sh.r : sh.top;
    const ys = [...new Set(otln.filter(([a, b]) => Math.min(a.x, b.x) > x0 - 8 && Math.max(a.x, b.x) < x1 + 8 && Math.abs(a.x - b.x) >= 0.6 * sh.w && a.y > sh.bottom + 20 && a.y < hiY - 10).map(([a]) => Math.round(a.y * 10) / 10))].sort((a, b) => a - b);
    const sp: Array<[number, number]> = [];
    for (let k = 0; k + 1 < ys.length; k++) { const d = ys[k + 1]! - ys[k]!; if (d >= 10 && d <= 80) { sp.push([ys[k]!, ys[k + 1]!]); k++; } }
    if (sp.length) sh.sp = sp;
  }
  const top = new Map<number, number>();
  for (const p of ps) {
    if (/ANNO|DIMS|Level|GRID|C-TOPO|L-SITE|G-/i.test(p.layer) || p.type === "TEXT" || p.type === "MTEXT" || p.type === "INSERT") continue;
    if (p.path.some((q) => NOT_BUILDING.test(q))) continue;
    // along every segment, not only at its ends: a cornice's long line is the top of every column it spans
    const put = (x: number, y: number) => { const c = Math.round(x / 10); if (y > (top.get(c) ?? -1e9)) top.set(c, y); };
    const seqs = p.rings ?? (p.pts ? [p.pts] : []);
    for (const q of seqs) for (let i = 0; i + 1 < q.length; i++) {
      const a = q[i]!, b = q[i + 1]!, n = Math.max(1, Math.ceil(Math.abs(b.x - a.x) / 10));
      for (let k = 0; k <= n; k++) put(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  }
  const bandsFP: Array<{ e0: number; e1: number; y0: number; y1: number; prot?: number }> = insts
    .filter((i) => /^FP_\d+/.test(i.name) && i.box.y1 - i.box.y0 <= 30 && i.box.x1 - i.box.x0 >= 50)
    .map((i) => ({ e0: i.box.x0, e1: i.box.x1, y0: i.box.y0, y1: Math.max(i.box.y1, i.box.y0 + 8) }));
  // stepped cornices: a stack of horizontal lines, each a little wider than the one under it, is a moulding seen face on — every
  // step a band, standing out as far as its line runs past the stack's lowest
  const hl: Array<{ y: number; e0: number; e1: number }> = [];
  for (const p of ps) {
    if (!p.pts || !/WALL/.test(p.layer) || p.path.some((q) => isOpening(famOf(q)))) continue;
    for (let j = 0; j + 1 < p.pts.length; j++) {
      const a = p.pts[j]!, c = p.pts[j + 1]!;
      if (Math.abs(a.y - c.y) < 0.5 && Math.abs(a.x - c.x) >= 100) hl.push({ y: a.y, e0: Math.min(a.x, c.x), e1: Math.max(a.x, c.x) });
    }
  }
  hl.sort((p, q) => p.y - q.y || p.e0 - q.e0);
  const usedL = new Set<number>();
  let steps = 0;
  // a moulding's lines may grow at either end: the east cornice's courses all start at the tower and step out only at the
  // building's south corner (+3 cm a course), where the sheet sees the return's profile
  const grow = (base: { e0: number; e1: number }, up: { e0: number; e1: number }) => Math.max(0, base.e0 - up.e0, up.e1 - base.e1);
  const stacks: Array<Array<{ y: number; e0: number; e1: number }>> = [];
  for (let i = 0; i < hl.length; i++) {
    if (usedL.has(i)) continue;
    const stack = [hl[i]!]; usedL.add(i);
    for (let j = i + 1; j < hl.length; j++) {
      const t = stack[stack.length - 1]!, q = hl[j]!;
      if (q.y - t.y > 30) break;
      if (q.y - t.y < 2 || usedL.has(j)) continue;
      const mid = (t.e0 + t.e1) / 2, qm = (q.e0 + q.e1) / 2;
      if (Math.abs(mid - qm) > 10 || q.e0 > t.e0 + 1 || q.e1 < t.e1 - 1 || t.e0 - q.e0 > 15 || q.e1 - t.e1 > 15) continue;
      stack.push(q); usedL.add(j);
    }
    if (stack.length >= 3) stacks.push(stack);
  }
  // a stack drawn face on between two walls (over the fin beside the south tower: tower to block, no end free) shows no profile;
  // the same cornice beside it, at the same heights, has one — that is the moulding it is
  const profile = (st: Array<{ y: number; e0: number; e1: number }>) => grow(st[0]!, st[st.length - 1]!);
  for (const stack of stacks) {
    const base = stack[0]!, top = stack[stack.length - 1]!;
    let protOf = (k: number) => 4 + grow(base, stack[k + 1]!);
    if (profile(stack) < 3) {
      const twin = stacks.find((o) => o !== stack && profile(o) >= 3 && o.length === stack.length && o.every((l, k) => Math.abs(l.y - stack[k]!.y) < 1.5));
      if (!twin) continue;
      protOf = (k: number) => 4 + grow(twin[0]!, twin[k + 1]!);
    }
    for (let k = 0; k + 1 < stack.length; k++) {
      const lo = stack[k]!, up = stack[k + 1]!;
      const prot = protOf(k);
      const fp = bandsFP.find((bd) => bd.y0 < up.y - 1 && bd.y1 > lo.y + 1 && bd.e0 < up.e1 && bd.e1 > up.e0);
      if (fp) { fp.prot = Math.max(fp.prot ?? 0, prot); continue; }
      bandsFP.push({ e0: up.e0, e1: up.e1, y0: lo.y, y1: up.y, prot });
      steps++;
    }
    // the stack's top line under an FP band of the same cornice: that band stands out at least as far
    for (const bd of bandsFP) if (bd.y0 >= top.y - 1 && bd.y0 <= top.y + 12 && bd.e0 < top.e1 && bd.e1 > top.e0) bd.prot = Math.max(bd.prot ?? 0, protOf(stack.length - 2));
  }
  corniceSteps.push(`${n}: ${steps}`);
  const wallBoxes = ps.filter((p) => p.rings && /A-WALL-PATT/.test(p.layer)).map((p) => {
    const q = p.rings!.flat();
    return { x0: Math.min(...q.map((v) => v.x)), x1: Math.max(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), y1: Math.max(...q.map((v) => v.y)) };
  });
  // the same hatch ring by ring: one piece may gather every cut wall across the face, its box then says nothing of any one wall
  const ringBoxes = ps.filter((p) => p.rings && /A-WALL-PATT/.test(p.layer)).flatMap((p) => p.rings!.filter((r) => r.length >= 3).map((q) => ({ x0: Math.min(...q.map((v) => v.x)), x1: Math.max(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), y1: Math.max(...q.map((v) => v.y)) })));
  // the level marks it writes (+17.70, +19.56 …): each where it stands along the face
  const marks = ps.filter((p) => p.text && p.at && /^\+?\d{1,2}\.\d{2}$/.test(p.text.trim())).map((p) => ({ e: p.at!.x, y: Math.round(Number(p.text!.trim()) * 100) }));
  // the curtain wall's grid as the elevation draws it (A-GLAZ-CWMG lines): mullions and transoms where they stand
  const cw = ps.filter((p) => /A-GLAZ-CWMG/.test(p.layer) && p.pts && p.pts.length >= 2).flatMap((p) => p.pts!.slice(1).map((q, m2) => ({ a: p.pts![m2]!, b: q })));
  const otlnH = otln.map(([a, b]) => ({ y: a.y, e0: Math.min(a.x, b.x), e1: Math.max(a.x, b.x) }));
  return { name: n, marks, wallBoxes, ringBoxes, shapes, top, otln: otlnH, bands: bandsFP, cw };
});

// ---------- plans
const PLAN_NAMES = [...PLANS, "M-roof"];
const plans = PLAN_NAMES.map((n) => G.readPieces(path.join(dir, n + ".dxf")));
const allWall = plans.flatMap((ps) => G.wallRings(ps).flat());
const bx = {
  x0: Math.min(...allWall.map((p) => p.x)) - 300, y0: Math.min(...allWall.map((p) => p.y)) - 300,
  x1: Math.max(...allWall.map((p) => p.x)) + 300, y1: Math.max(...allWall.map((p) => p.y)) + 300,
};
// ---------- elevation ↔ plan: e = s·(X or Y) + b, fitted on the openings both draw
const planOpenings = plans.slice(0, 4).flatMap((ps) =>
  instances(ps).filter((i) => isOpening(i.family)).map((i) => ({ fam: i.family, X: (i.box.x0 + i.box.x1) / 2, Y: (i.box.y0 + i.box.y1) / 2 })),
);
for (const el of elevs) {
  let best: Elev["map"];
  for (const axis of ["X", "Y"] as const) for (const s of [1, -1] as const) {
    const votes = new Map<number, number>();
    for (const sh of el.shapes) for (const po of planOpenings) if (po.fam === sh.family) {
      const b = Math.round((sh.cx - s * po[axis]) / 5);
      votes.set(b, (votes.get(b) ?? 0) + 1);
    }
    for (const [b5] of votes) {
      const b = b5 * 5;
      const score = el.shapes.filter((sh) => planOpenings.some((po) => po.fam === sh.family && Math.abs(s * po[axis] + b - sh.cx) < 12)).length;
      if (!best || score > best.score) best = { axis, s, b, score };
    }
  }
  el.map = best;
}
// A door the elevation draws cut short (by a parapet, a stair or a wall in front of it) keeps its type's height (the family
// name's 100_210): its sill is the drawn bottom, unless the drawn top less the height falls on a floor (a roof room's door seen
// only over the parapet). Its shape becomes a plain rectangle — the swing's arc is not an arch.
const doorsLengthened: string[] = [];
for (const el of elevs) for (const sh of el.shapes) {
  if (!/Door|IntSgl|Flush|דלת/i.test(sh.family) || /Curtain/i.test(sh.family)) continue;
  const wh = famWH(sh.family);
  if (!wh || sh.top - sh.bottom >= wh[1] - 5) continue;
  const floorsAll = [...LEVELS, ROOF];
  const near = (y: number) => Math.min(...floorsAll.map((f) => Math.abs(f - y)));
  const bottom = near(sh.top - wh[1]) < 10 && near(sh.bottom) > 50 ? sh.top - wh[1] : sh.bottom;
  doorsLengthened.push(`${el.name} ${sh.family.slice(0, 30)} e=${sh.cx.toFixed(0)} ${sh.bottom.toFixed(0)}..${sh.top.toFixed(0)} → ${bottom.toFixed(0)}..${(bottom + wh[1]).toFixed(0)}`);
  sh.kind = "rect"; sh.bottom = bottom; sh.top = bottom + wh[1]; sh.cy = bottom + wh[1] / 2; sh.spring = sh.top; sh.r = sh.w / 2;
}
report.doorsLengthened = doorsLengthened;
report.elevations = elevs.map((e) => ({ name: e.name, shapes: e.shapes.length, map: e.map, bands: e.bands.length }));

// A ring standing where the ground floor has nothing under it (the entrance canopy's rim, cut in every plan above) is not a
// storey-high wall: its height is what the side elevations hatch for it there.
function hatchedSpan(X0: number, X1: number, Y0: number, Y1: number): [number, number] | null {
  let lo = 1e9, hi = -1e9;
  for (const el of elevs) {
    if (!el.map || el.map.score < 3) continue;
    const [a0, a1] = el.map.axis === "X" ? [X0, X1] : [Y0, Y1];
    const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b - 5, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b + 5;
    for (const w of el.wallBoxes) if (w.x0 >= e0 && w.x1 <= e1) { lo = Math.min(lo, w.y0); hi = Math.max(hi, w.y1); }
  }
  return hi > lo ? [Math.max(0, lo), hi] : null;
}
const overhangsDone = new Set<string>();
let canopyPieces = 0;
function pointInRing(p: Pt, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** A ring grown (d > 0) or shrunk by d cm along each edge's normal, corners mitred (capped at 3·|d|). */
function offsetRing(r0: Pt[], d: number, joint?: (m: Pt, n: Pt) => boolean): Pt[] {
  if (!d) return r0;
  // repeated and in-line points first: a zero-length edge has no normal
  let r = r0.filter((p, i) => { const q = r0[(i + 1) % r0.length]!; return Math.hypot(q.x - p.x, q.y - p.y) > 0.05; });
  r = r.filter((p, i) => { const a = r[(i - 1 + r.length) % r.length]!, b = r[(i + 1) % r.length]!; return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) > 0.01 * Math.hypot(b.x - a.x, b.y - a.y); });
  if (r.length < 3) return r0;
  let a2 = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a2 += p.x * q.y - q.x * p.y; }
  const sg = a2 > 0 ? 1 : -1; // CCW: outward normal is (dy, -dx)
  const n = r.length, out: Pt[] = [];
  const nrm = (i: number) => { const p = r[i]!, q = r[(i + 1) % n]!, L = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (sg * (q.y - p.y)) / L, y: (-sg * (q.x - p.x)) / L }; };
  // an edge against another piece of the same rim is a joint: it stays where it is, the step runs on through it
  const held = r.map((p, i) => { const q = r[(i + 1) % n]!, m = nrm(i); return !!joint?.({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, m); });
  for (let i = 0; i < n; i++) {
    const ia = (i - 1 + n) % n;
    if (held[ia] || held[i]) {
      // slide along the held edge: the free edge's line meets the held edge's line
      const fi = held[i] ? ia : i, hi = held[i] ? i : ia;
      if (held[fi]) { out.push(r[i]!); continue; }
      const fn = nrm(fi), hp = r[hi]!, hq = r[(hi + 1) % n]!;
      const dx = hq.x - hp.x, dy = hq.y - hp.y, L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;
      const dot = fn.x * tx + fn.y * ty;
      if (Math.abs(dot) < 0.05) { out.push(r[i]!); continue; }
      const t = d / dot;
      out.push({ x: r[i]!.x + tx * t, y: r[i]!.y + ty * t });
      continue;
    }
    const a = nrm(ia), b = nrm(i);
    let mx = a.x + b.x, my = a.y + b.y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const cos = mx * b.x + my * b.y, k = Math.min(3, 1 / Math.max(cos, 1e-3));
    out.push({ x: r[i]!.x + mx * d * k, y: r[i]!.y + my * d * k });
  }
  return out;
}
// a ring cut identically in the first floor's plan and the roof's, over nothing on the ground: not a wall of any storey but
// the canopy's rim, which every plan's view range cuts
const keyOf = (o: Pt[]) => {
  const xs = o.map((q) => q.x), ys = o.map((q) => q.y);
  return `${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)},${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}`;
};
const ringKeys = (ps: DxfPiece[]) => new Set(ps.filter((p) => p.rings && G.WALL_LAYERS.test(p.layer)).flatMap((p) => p.rings!).map((o) => {
  const xs = o.map((q) => q.x), ys = o.map((q) => q.y);
  return `${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)},${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}`;
}));
const k1 = ringKeys(plans[1]!), kr = ringKeys(plans[4]!);
// the same ring within 5 cm: the roof plan cuts the canopy's return 4 cm shorter at the face (337 for the first floor's 333) — an
// exact match missed it, and its neck stood as a 1.1 m fin from +4.08 to the parapet on every storey, which no elevation draws
const near5 = (a: string, b: string) => { const A = a.split(",").map(Number), B = b.split(",").map(Number); return A.every((v, i) => Math.abs(v - B[i]!) <= 5); };
const krL = [...kr];
const repeated = [...k1].filter((x) => krL.some((y) => near5(x, y))).map((key) => { const [X0, Y0, X1, Y1] = key.split(",").map(Number) as [number, number, number, number]; return { key, X0, Y0, X1, Y1 }; });
// touching repeated rings are one piece; the piece is the canopy when the side elevations hatch any part of it low (under 6 m)
const groupOf = repeated.map((_, i) => i);
const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i]!)));
repeated.forEach((a, i) => repeated.forEach((b, j) => { if (j > i && a.X0 <= b.X1 + 20 && b.X0 <= a.X1 + 20 && a.Y0 <= b.Y1 + 20 && b.Y0 <= a.Y1 + 20) groupOf[find(i)] = find(j); }));
const groupTop = new Map<number, number>();
repeated.forEach((r, i) => { const sp = hatchedSpan(r.X0, r.X1, r.Y0, r.Y1); if (sp) groupTop.set(find(i), Math.min(groupTop.get(find(i)) ?? 1e9, sp[1])); });
const canopyTop = new Map<string, number>();
repeated.forEach((r, i) => { const t = groupTop.get(find(i)); if (t != null && t < 600) canopyTop.set(r.key, t); });
const canopyKeys = [...canopyTop.keys()];
const isCanopyRing = (key: string) => canopyTop.has(key) || canopyKeys.some((c) => near5(c, key));
type Plan = { closed: Uint8Array; name: string; level: number; pieces: DxfPiece[]; insts: Inst[]; walls: G.Grid; fp: Uint8Array; outside: Float32Array; partitions: Array<{ ring: Pt[]; thick: number; len: number; lone?: boolean }> };
const quadKey = (k: number, qd: { ring: Pt[] }) => { const xs = qd.ring.map((q) => q.x), ys = qd.ring.map((q) => q.y); return `${k}:${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)},${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}`; };
const buildPlans = (skip: Set<string>): Plan[] => plans.map((ps, k) => {
  const g = G.makeGrid(bx.x0, bx.y0, bx.x1, bx.y1);
  for (const p of ps) if (p.rings && G.WALL_LAYERS.test(p.layer)) G.fillRings(g, k >= 1 ? p.rings.filter((o) => !isCanopyRing(keyOf(o))) : p.rings);
  // the light walls (gypsum partitions, drawn as their faces' lines): walls of the grid too, so their doors find their gaps;
  // those the hatch already covers are not built twice
  const hatched = g.a.slice();
  const partitions = PR.partitionQuads(ps).filter((qd) => {
    const c = qd.ring.reduce((m, v) => ({ x: m.x + v.x / 4, y: m.y + v.y / 4 }), { x: 0, y: 0 });
    const i = Math.floor((c.x - g.x0) / G.CELL), j = Math.floor((c.y - g.y0) / G.CELL);
    return !(i >= 0 && j >= 0 && i < g.nx && j < g.ny && hatched[j * g.nx + i]) && !skip.has(quadKey(k, qd));
  });
  for (const qd of partitions) {
    G.fillRings(g, [qd.ring]);
    const m0 = { x: (qd.ring[0]!.x + qd.ring[3]!.x) / 2, y: (qd.ring[0]!.y + qd.ring[3]!.y) / 2 }, m1 = { x: (qd.ring[1]!.x + qd.ring[2]!.x) / 2, y: (qd.ring[1]!.y + qd.ring[2]!.y) / 2 };
    G.drawLine(g, m0, m1, 1); // a thin wall still a continuous run of cells
  }
  const walls: G.Grid = { ...g, a: g.a.slice() };
  const insts = instances(ps);
  for (const i of insts) if (isOpening(i.family) || /Mullion|Panel/.test(i.family)) for (const p of i.pieces) {
    if (p.pts) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(g, p.pts[j]!, p.pts[j + 1]!, 2);
  }
  const fp = G.footprint(g, 70);
  // outside is what a straight ray from the drawing's edge reaches without meeting a wall or an opening's line, not only what
  // the closed footprint leaves out: a recess between pilasters is outside, and the walls lining it are the face
  const ex = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx && !g.a[j * g.nx + i]; i++) ex[j * g.nx + i] = 1;
    for (let i = g.nx - 1; i >= 0 && !g.a[j * g.nx + i]; i--) ex[j * g.nx + i] = 1;
  }
  for (let i = 0; i < g.nx; i++) {
    for (let j = 0; j < g.ny && !g.a[j * g.nx + i]; j++) ex[j * g.nx + i] = 1;
    for (let j = g.ny - 1; j >= 0 && !g.a[j * g.nx + i]; j--) ex[j * g.nx + i] = 1;
  }
  const outside = G.distance({ ...g, a: fp.map((v, c) => (v && !ex[c] ? 1 : 0)) }, (v) => v === 0);
  return { closed: g.a, name: PLAN_NAMES[k]!, level: k < 4 ? LEVELS[k]! : ROOF, pieces: ps, insts, walls, fp, outside, partitions };
});
const cellOf = (g: G.Grid, x: number, y: number) => {
  const i = Math.floor((x - g.x0) / G.CELL), j = Math.floor((y - g.y0) / G.CELL);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
};
const isWall = (pl: Plan, x: number, y: number) => { const k = cellOf(pl.walls, x, y); return k >= 0 && pl.walls.a[k] === 1; };
const inFp = (pl: Plan, x: number, y: number) => { const k = cellOf(pl.walls, x, y); return k >= 0 && pl.fp[k] === 1; };
// the ground's open court: footprint the closing filled (a site wall rings it: the sunken yard between the north face and the
// plot's diagonal retaining wall) with no storey over it and no roof the floor-1 plan draws (its A-FLOR-PATT: the canopy at +4.07
// over the court's west end). Open sky: its walls are the facade's stone, and it is paved, not roofed. Patches under 3 m² are
// slivers between walls, not a court.
let courtFor: Plan[] | null = null, court = new Uint8Array(0), courtDist = new Float32Array(0), courtRoofed = new Uint8Array(0);
const courtOf = () => {
  if (courtFor === P) return { court, courtDist, courtRoofed };
  courtFor = P;
  const g = P[0]!.walls, nn = g.nx * g.ny, m = new Uint8Array(nn);
  const roofed: G.Grid = { ...g, a: new Uint8Array(nn) };
  G.fillRings(roofed, P[1]!.pieces.filter((p) => p.layer === "A-FLOR-PATT" && p.rings).flatMap((p) => p.rings!));
  // the canopy's part is still open air for its walls (stone, a facade's openings); only its roof is the canopy's own
  for (let c = 0; c < nn; c++) if (P[0]!.fp[c] && (!P[1]!.fp[c] || roofed.a[c]) && !g.a[c] && P[0]!.outside[c]! > 0) m[c] = 1;
  const seen = new Uint8Array(nn);
  for (let c0 = 0; c0 < nn; c0++) {
    if (!m[c0] || seen[c0]) continue;
    const comp: number[] = [c0]; seen[c0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q]!, i = c % g.nx, j = (c - i) / g.nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii; if (m[kk] && !seen[kk]) { seen[kk] = 1; comp.push(kk); }
      }
    }
    if (comp.length * G.CELL * G.CELL < 3e4) for (const c of comp) m[c] = 0;
  }
  court = m;
  courtRoofed = roofed.a;
  courtDist = G.distance({ ...g, a: m.map((v) => (v ? 0 : 1)) }, (v) => v === 0);
  return { court, courtDist, courtRoofed };
};
const exterior = (pl: Plan, x: number, y: number, cm = 25) => {
  const k = cellOf(pl.walls, x, y); if (k < 0) return false;
  if (pl.outside[k]! * G.CELL <= cm) return true;
  // (the court's face stands back under floor 1's overhang, up to 50 cm in from the open court)
  return pl === P[0] && courtOf().courtDist[k]! * G.CELL <= cm + 50;
};
// a face's cladding drawn as a partition (a pier's 5–12 cm stone, outside the hatch) runs up the building: one no storey above
// or below repeats is the plan's slip (the north piers' were drawn on alternate storeys). Left in, it moved the face — and the
// window surrounds read off it — 10 cm out on that storey only: steps on the face. The plans are read again without them.
let P: Plan[] = buildPlans(new Set());
{
  const sameQuad = (a: string, b: string) => { const A = a.split(":")[1]!.split(",").map(Number), B = b.split(":")[1]!.split(",").map(Number); return A.every((v, i) => Math.abs(v - B[i]!) < 3); };
  const isExt = (pl: Plan, qd: { ring: Pt[] }) => qd.ring.some((q) => exterior(pl, q.x, q.y, 10));
  const lone = new Set<string>();
  P.forEach((pl, k) => {
    if (k === 4) return;
    for (const qd of pl.partitions) {
      if (!(qd.thick >= 5 && qd.thick <= 12) || !isExt(pl, qd)) continue;
      const key = quadKey(k, qd);
      const rep = [k - 1, k + 1].some((kk) => kk >= 0 && kk <= 3 && P[kk]!.partitions.some((o) => isExt(P[kk]!, o) && sameQuad(quadKey(kk, o), key)));
      if (!rep) lone.add(key);
    }
  });
  report.loneCladding = [...lone];
  if (lone.size) P = buildPlans(lone);
}


// ---------- walls
const ringArea = (r: Pt[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.y - q.x * p.y; } return a / 2; };
const inside = (pt: Pt, r: Pt[]) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!, b = r[j]!;
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const ringM = (r: Pt[]) => r.map((p) => M(p.x, p.y));
/** A ring's part between two lines across one plan axis (Sutherland–Hodgman against both). */
function clipBand(r: Pt[], ax: "x" | "y", lo: number, hi: number): Pt[] {
  const side = (keep: (q: Pt) => boolean, cut: number, ring: Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!, ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) { const t = (cut - a[ax]) / (b[ax] - a[ax]); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    }
    return out;
  };
  return side((q) => q[ax] <= hi, hi, side((q) => q[ax] >= lo, lo, r));
}
/** A roof wall's top: the lowest roof-level mark (≥ +17.00) the elevations that see it face on write over it; else the silhouette. */
function roofTopAt(X0: number, X1: number, Y0: number, Y1: number): number | null {
  const ys: number[] = [];
  for (const el of elevs) {
    if (!el.map || el.map.score < 3) continue;
    const [a0, a1] = el.map.axis === "X" ? [X0, X1] : [Y0, Y1];
    if (a1 - a0 < 50) continue;
    const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
    for (const m of el.marks) if (m.y >= 1700 && m.y <= 2100 && m.e >= e0 - 60 && m.e <= e1 + 60) ys.push(m.y);
  }
  // a mark names the top of what it stands over; a short wall that only borrows a tower's mark from nearby stands no higher
  // than the elevations' silhouette over it
  const sil = silhouetteAt(X0, X1, Y0, Y1);
  if (!ys.length) return sil;
  const m = Math.min(...ys);
  const top = sil != null && sil >= ROOF + 20 && sil < m - 10 ? sil : m;
  return Math.min(top, parapetCopingAt(X0, X1, Y0, Y1) ?? top);
}
/**
 * A facade parapet's coping: the near elevation that sees the wall face on draws a cornice band (+17.xx) right across it. The
 * marks and silhouette over it are of what stands behind (a roof room's +19.75, a tower's crown): a parapet strip beside a tower
 * stood to the tower's top.
 */
let fpBox: [number, number, number, number] | null = null;
function parapetCopingAt(X0: number, X1: number, Y0: number, Y1: number): number | null {
  if (!fpBox) {
    const g = P[3]!.walls; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let c = 0; c < g.a.length; c++) if (P[3]!.fp[c]) { const i = c % g.nx, j = (c - i) / g.nx, x = g.x0 + i * G.CELL, y = g.y0 + j * G.CELL; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    fpBox = [x0, x1, y0, y1];
  }
  // face on, and end on too (a short return wall off the parapet, seen by its end in the same elevation)
  let best: number | null = null;
  for (const alongY of [true, false]) {
  const near = alongY ? ((X0 + X1) / 2 > (fpBox[0] + fpBox[1]) / 2 ? /מזרח/ : /מערב/) : ((Y0 + Y1) / 2 > (fpBox[2] + fpBox[3]) / 2 ? /דרומ/ : /צפונ/);
  for (const el of elevs) {
    if (!el.map || el.map.score < 3 || !near.test(el.name) || (el.map.axis === "Y") !== alongY) continue;
    const [a0, a1] = alongY ? [Y0, Y1] : [X0, X1];
    const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
    // only a wall nothing of the roof stands in front of, towards that elevation (a tower's side walls are behind the parapets)
    const east = /מזרח/.test(el.name), west = /מערב/.test(el.name), south = /דרומ/.test(el.name);
    let hidden = 0, samples = 0;
    for (let a = a0 + 5; a < a1; a += 10) {
      samples++;
      for (let d = 10; d < 3000; d += 10) {
        const x = alongY ? (east ? X1 + d : west ? X0 - d : 0) : a, y = alongY ? a : south ? Y1 + d : Y0 - d;
        if (isWall(P[4]!, x, y) && inFp(P[3]!, x, y)) { hidden++; break; }
      }
    }
    if (hidden > samples / 2) continue;
    for (const b of el.bands) if (b.y1 >= 1700 && b.y1 <= 1800 && b.e0 <= e0 + 5 && b.e1 >= e1 - 5) best = Math.max(best ?? 0, b.y1);
  }
  }
  return best;
}
function silhouetteAt(X0: number, X1: number, Y0: number, Y1: number): number | null {
  const tops: number[] = [];
  for (const el of elevs) {
    if (!el.map || el.map.score < 3) continue;
    const [a0, a1] = el.map.axis === "X" ? [X0, X1] : [Y0, Y1];
    const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
    const hs: number[] = [];
    for (let c = Math.ceil(e0 / 10); c <= Math.floor(e1 / 10); c++) { const t = el.top.get(c); if (t != null) hs.push(t); }
    if (hs.length) tops.push(hs.sort((p, q) => p - q)[Math.floor(hs.length / 2)]!);
  }
  return tops.length ? Math.min(...tops) : null;
}
/** A low wall's top: the highest wall hatch an elevation cuts along its line (a one-storey block in front of the building is cut
 * in the side elevations to its roof), only hatches that start at the ground. */
function cutTopAt(X0: number, X1: number, Y0: number, Y1: number, base = 0): number | null {
  let best: number | null = null;
  for (const el of elevs) {
    if (!el.map || el.map.score < 3) continue;
    // only an elevation that sees the wall face on: one that sees it end on cuts other walls along its line of sight
    if ((el.map.axis === "X") !== (X1 - X0 >= Y1 - Y0)) continue;
    const [a0, a1] = el.map.axis === "X" ? [X0, X1] : [Y0, Y1];
    const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
    for (const w of el.ringBoxes) {
      if (base === 0 ? (w.y0 > 150 || w.y1 > 600 || w.y1 - w.y0 < 150) : (w.y0 < base - 60 || w.y0 > base + 150 || w.y1 > base + 600 || w.y1 - w.y0 < 50)) continue;
      const ov = Math.min(e1, w.x1) - Math.max(e0, w.x0);
      if (ov < (e1 - e0) * 0.5) continue; // the hatch must stand over most of the wall, not touch a corner of a long one
      best = Math.max(best ?? 0, w.y1);
    }
  }
  return best;
}
/** The ground plan's diagonal site walls (outside the storey over it), each outline once. */
let diagCache: Pt[][] | null = null;
function diagSite(): Pt[][] {
  if (diagCache) return diagCache;
  diagCache = [];
  for (const p of P[0]!.pieces) {
    if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue;
    for (const r of p.rings) {
      if (r.length < 3) continue;
      const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
      if (Math.max(...xs) - Math.min(...xs) >= 150 && Math.max(...ys) - Math.min(...ys) >= 150 && !inFp(P[1]!, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)) diagCache.push(r);
    }
  }
  return diagCache;
}
/** The street (רחוב דבורה הנביאה) runs past the plot's east line, which the elevations' "גבול מגרש" lines give at its two
 * ends: X 609 on the south sheet (its far end, Y 1581 on the east sheet), X 1255 on the north (Y −1065). Beyond it the sheets'
 * sidewalk ("מדרכה", the south sheet's X ≈ 1050) and the road. */
const STREET = (() => {
  const A = { x: 609, y: 1581 }, B = { x: 1255, y: -1065 }, L = Math.hypot(B.x - A.x, B.y - A.y);
  const d = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -d.y, y: d.x };
  const nn = n.x > 0 ? n : { x: -n.x, y: -n.y };
  return { A, d, n: nn, off: (x: number, y: number) => (x - A.x) * nn.x + (y - A.y) * nn.y };
})();
let groundRaised = 0;
let coveredWalls = 0;
let wallCount = 0, liningCount = 0;
// the roof plan's walls are not all one height (a parapet at 17.70, a tower at 19.56): each cell keeps its wall's top, so a band
// high on a tower is laid on the tower, not on the parapet in front of it
const roofWallTop = new Float32Array(P[4]!.walls.nx * P[4]!.walls.ny);
// the ground plan's walls too: a site wall stands 1.2 m, the lower block's walls a storey
const groundWallTop = new Float32Array(P[0]!.walls.nx * P[0]!.walls.ny);
P.forEach((pl, k) => {
  for (const p of pl.pieces) {
    if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue;
    const rings = p.rings.filter((r) => r.length >= 3 && Math.abs(ringArea(r)) > 4);
    const outers = rings.filter((r) => !rings.some((o) => o !== r && Math.abs(ringArea(o)) > Math.abs(ringArea(r)) && inside(r[0]!, o)));
    for (const o of outers) {
      const holes = rings.filter((r) => r !== o && inside(r[0]!, o));
      const xs = o.map((q) => q.x), ys = o.map((q) => q.y);
      const [X0, X1, Y0, Y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
      let y0 = pl.level;
      let y1 = k < 3 ? LEVELS[k + 1]! : ROOF;
      if (k === 0 && !inFp(P[1]!, cx, cy)) y1 = cutTopAt(X0, X1, Y0, Y1) ?? 120;
      // a wall of an upper storey with no storey over it is a terrace's parapet: as high as the side elevations cut it
      if (k >= 1 && k <= 2 && !inFp(P[k + 1]!, cx, cy) && o.some((q) => inFp(P[0]!, q.x, q.y))) {
        const t = cutTopAt(X0, X1, Y0, Y1, pl.level);
        y1 = t ?? pl.level + 110;
        report.parapets = [...((report.parapets as string[]) ?? []), `${pl.name} X${X0.toFixed(0)}..${X1.toFixed(0)} Y${Y0.toFixed(0)}..${Y1.toFixed(0)} top ${y1}${t == null ? " (default)" : ""}`];
      }
      if (k === 4) y1 = Math.min(1975, Math.max(ROOF + 60, roofTopAt(X0, X1, Y0, Y1) ?? 1770));
      let ext = k === 4 || o.some((q) => exterior(pl, q.x, q.y));
      // a ground wall facing only a covered space open to the street (the parking under the shtiblach) is the space's inside
      // wall: plastered, not the facade's stone. Open air is an outside cell with no storey over it.
      if (ext && k === 0 && inFp(P[1]!, cx, cy)) {
        const openAir = o.some((q) => exterior(pl, q.x, q.y) && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => [40, 80].some((r) => {
          const x2 = q.x + dx! * r, y2 = q.y + dy! * r, c2 = cellOf(pl.walls, x2, y2);
          // the open court (floor 1's canopy over its west end is no storey: the wall under it is still the facade's)
          if (c2 >= 0 && courtOf().court[c2] === 1) return true;
          return c2 >= 0 && pl.outside[c2] === 0 && !isWall(pl, x2, y2) && !inFp(P[1]!, x2, y2);
        })));
        if (!openAir) { ext = false; coveredWalls++; }
      }
      const ringKey = `${X0.toFixed(0)},${Y0.toFixed(0)},${X1.toFixed(0)},${Y1.toFixed(0)}`;
      // the canopy's return to the face (its neck, over the ground floor's own footprint) is the canopy's too, not a storey's wall
      if (k >= 1 && (!o.some((q) => inFp(P[0]!, q.x, q.y)) || isCanopyRing(ringKey))) {
        // apart from the storey's own walls (its own piece of the wall grid) and over nothing: the canopy's rim, cut in every plan
        // above it. Its top is what the side elevations hatch beyond the building's face there; its depth the canopy beam's (20_60).
        const key = canopyTop.has(ringKey) ? ringKey : canopyKeys.find((c) => near5(c, ringKey)) ?? ringKey;
        if (canopyTop.has(key)) {
          if (overhangsDone.has(key)) continue;
          overhangsDone.add(key);
          y1 = canopyTop.get(key)!;
          // its underside: the floor-edge line (A-FLOR-OTLN) the side elevations draw under it (+3.62); else the beam's 60 cm
          const under = elevs.flatMap((el) => {
            if (!el.map || el.map.score < 3) return [];
            const [a0, a1] = el.map.axis === "X" ? [X0, X1] : [Y0, Y1];
            const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
            return el.otln.filter((l) => l.e0 < e1 - 5 && l.e1 > e0 + 5 && l.y > y1 - 120 && l.y < y1 - 30).map((l) => l.y);
          });
          y0 = under.length ? Math.min(...under) : y1 - 60;
          ext = true;
          // the moulding the face-on elevation draws (east: 3.63 fascia, steps at 3.94 / 4.20 / 4.30, a cap at 4.38..4.46 standing
          // a few cm proud with rounded ends): each step the rim's outline grown by what its line runs past the fascia's
          const steps: Array<[number, number, number]> = [[y0, 394, -9], [394, 420, -6], [420, 430, -3], [430, 438, 0], [438, y1, 3]];
          if (y1 - y0 > 70) {
            const others = P[k]!.pieces.filter((p) => p.rings && G.WALL_LAYERS.test(p.layer)).flatMap((p) => p.rings!).filter((r) => r !== o && isCanopyRing(keyOf(r)));
            const joint = (m: Pt, nv: Pt) => others.some((r) => pointInRing({ x: m.x + nv.x * 3, y: m.y + nv.y * 3 }, r));
            for (const [a, b, d] of steps) if (b > a) prims.push({ type: "prism", ring: ringM(offsetRing(o, d, joint)), y0: a / 100, y1: b / 100, material: "jerusalemStone", tag: `canopy:${pl.name}` });
            canopyPieces++;
            continue;
          }
        }
      }
      if (k === 4) {
        const tg: G.Grid = { ...P[4]!.walls, a: new Uint8Array(P[4]!.walls.nx * P[4]!.walls.ny) };
        G.fillRings(tg, [o]);
        for (let c = 0; c < tg.a.length; c++) if (tg.a[c]) roofWallTop[c] = Math.max(roofWallTop[c]!, y1);
      }
      if (k === 0) {
        const tg: G.Grid = { ...P[0]!.walls, a: new Uint8Array(P[0]!.walls.nx * P[0]!.walls.ny) };
        G.fillRings(tg, [o]);
        for (let c = 0; c < tg.a.length; c++) if (tg.a[c]) groundWallTop[c] = Math.max(groundWallTop[c]!, y1);
      }
      // a site wall running across the slope (the plot's diagonal wall on the north): its top steps up the hill. The elevation
      // that sees it end on draws each step (the east sheet: 4.00, 4.67, 5.35, 6.02, 6.69 over its 2 m across Y); it is built
      // in those steps, each the wall's piece under its run of the outline
      if (k === 0 && !holes.length && !inFp(P[1]!, cx, cy) && X1 - X0 >= 150 && Y1 - Y0 >= 150) {
        const endAxis: "X" | "Y" = X1 - X0 < Y1 - Y0 ? "X" : "Y";
        const el = elevs.find((e) => e.map && e.map.score >= 3 && e.map.axis === endAxis);
        const [u0, u1] = endAxis === "X" ? [X0, X1] : [Y0, Y1];
        const cols: Array<{ u: number; top: number }> = [];
        if (el) for (let u = u0 + 5; u < u1; u += 10) { const t = el.top.get(Math.round((el.map!.s * u + el.map!.b) / 10)); if (t != null) cols.push({ u, top: t }); }
        const runs: Array<{ a: number; b: number; top: number }> = [];
        for (const c of cols) { const r = runs.at(-1); if (r && Math.abs(r.top - c.top) < 8) r.b = c.u + 5; else runs.push({ a: c.u - 5, b: c.u + 5, top: c.top }); }
        const tops = runs.map((r) => r.top);
        // the sheet is a section: a thin hatch the cut draws across the wall's line (the east sheet's 28 cm at 2.14..3.44) is the
        // wall nearest the viewer there — the cut one, its top the hatch's. Another diagonal wall behind it is the stepped one.
        const ax: "x" | "y" = endAxis === "X" ? "x" : "y", dAx: "x" | "y" = ax === "x" ? "y" : "x";
        const nearSign = !el ? 0 : /מזרחית/.test(el.name) ? 1 : /מערבית/.test(el.name) ? -1 : /צפונית/.test(el.name) ? -1 : 1;
        const depthAt = (r: Pt[], u: number) => { const q = clipBand(r, ax, u - 5, u + 5); return q.length ? q.reduce((a, v) => a + v[dAx], 0) / q.length : null; };
        // of the cuts along its line the highest: a lower one is the retaining wall's foot at the street, cut deeper
        const cut = !el ? undefined : el.ringBoxes.filter((w) => {
          if (w.x1 - w.x0 > 60 || w.y0 > 300 || w.y1 < 200 || w.y1 > 900) return false;
          const u = (w.x0 + w.x1) / 2 / (el.map!.s); if (u < u0 || u > u1) return false;
          const me = depthAt(o, u); if (me == null) return false;
          // no other diagonal site wall of this plan nearer the viewer at that line
          return !diagSite().some((r) => r !== o && (() => { const d = depthAt(r, u); return d != null && (d - me) * nearSign > 40; })());
        }).sort((a, b) => b.y1 - a.y1)[0];
        if (cut) {
          y1 = cut.y1;
          // its top is the cut's: what rests on walls (a band) must not take it for the storey-high wall it was first read as
          { const tg: G.Grid = { ...P[0]!.walls, a: new Uint8Array(P[0]!.walls.nx * P[0]!.walls.ny) }; G.fillRings(tg, [o]); for (let c = 0; c < tg.a.length; c++) if (tg.a[c]) groundWallTop[c] = y1; }
          report.steppedWalls = [...((report.steppedWalls as string[]) ?? []), `${pl.name} X${X0.toFixed(0)}..${X1.toFixed(0)} Y${Y0.toFixed(0)}..${Y1.toFixed(0)}: cut at ${cut.x0.toFixed(0)}..${cut.x1.toFixed(0)} → ${cut.y1.toFixed(0)}`];
        } else if (runs.length >= 2 && cols.length >= (u1 - u0) / 10 - 2 && Math.max(...tops) - Math.min(...tops) >= 40 && Math.min(...tops) > 150 && Math.max(...tops) < 900) {
          runs[0]!.a = u0 - 1; runs.at(-1)!.b = u1 + 1;
          for (const r of runs) {
            const piece = clipBand(o, endAxis === "X" ? "x" : "y", r.a, r.b);
            if (piece.length >= 3) prims.push({ type: "prism", ring: ringM(piece), y0: y0 / 100, y1: r.top / 100, material: ext ? "stone" : "plaster", tag: `wall:${pl.name}` });
          }
          report.steppedWalls = [...((report.steppedWalls as string[]) ?? []), `${pl.name} X${X0.toFixed(0)}..${X1.toFixed(0)} Y${Y0.toFixed(0)}..${Y1.toFixed(0)}: ${runs.map((r) => `${r.a.toFixed(0)}..${r.b.toFixed(0)}→${r.top.toFixed(0)}`).join(" ")}`];
          wallCount++;
          continue;
        }
      }
      prims.push({ type: "prism", ring: ringM(o), ...(holes.length ? { holes: holes.map(ringM) } : {}), y0: y0 / 100, y1: y1 / 100, material: ext ? "stone" : "plaster", tag: `wall:${pl.name}` });
      wallCount++;
      // a stone facade wall is plastered on its room side: each long edge whose off-wall side is a room gets a 1.5 cm lining
      if (ext && k < 4) for (const r of [o, ...holes]) for (let e = 0; e < r.length; e++) {
        const pa = r[e]!, pb = r[(e + 1) % r.length]!, len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (len < 40) continue; // a pier's 50 cm end in a hall is a room face too
        const nx = -(pb.y - pa.y) / len, ny = (pb.x - pa.x) / len;
        const room = (x: number, y: number) => inFp(pl, x, y) && !isWall(pl, x, y) && !exterior(pl, x, y, 25);
        for (const sd of [1, -1]) {
          if (![0.2, 0.5, 0.8].every((f) => room(pa.x + (pb.x - pa.x) * f + nx * sd * 8, pa.y + (pb.y - pa.y) * f + ny * sd * 8))) continue;
          const ox = nx * sd * 1.5, oy = ny * sd * 1.5;
          prims.push({ type: "prism", ring: ringM([pa, pb, { x: pb.x + ox, y: pb.y + oy }, { x: pa.x + ox, y: pa.y + oy }]), y0: y0 / 100, y1: y1 / 100, material: "plaster", tag: `wall:lining:${pl.name}` });
          liningCount++;
        }
      }
    }
  }
});
report.linings = liningCount;
// a toilet cubicle's panel: thin, on its own (no board layer beside it), by a WC, urinal or shower
const wetAt = P.map((pl) => pl.insts.filter((i) => /WC|Toilet|אסלה|Urinal|Shower|מקלחת/i.test(i.family)).map((i) => ({ x: (i.box.x0 + i.box.x1) / 2, y: (i.box.y0 + i.box.y1) / 2 })));
const isCubicle = (k: number, qd: { ring: Pt[]; thick: number; lone?: boolean }) => {
  if (!(qd.thick < 4 && qd.lone)) return false;
  return qd.ring.some((q) => wetAt[k]!.some((w) => Math.hypot(w.x - q.x, w.y - q.y) < 180));
};
// the light walls: each partition's quad, the storey's height, plastered (stone where it stands on the face)
let partitionCount = 0, cubicleCount = 0;
const cubicleRings: Pt[][][] = P.map(() => []);
P.forEach((pl, k) => {
  if (k === 4) return;
  const y0 = pl.level, y1 = k < 3 ? LEVELS[k + 1]! : ROOF;
  for (const qd of pl.partitions) {
    const ext = qd.ring.some((q) => exterior(pl, q.x, q.y, 10));
    // a panel under 4 cm is a toilet cubicle's (compact laminate): raised 15 cm off the floor, 2.00 m high, not to the ceiling
    if (isCubicle(k, qd) && !ext) {
      prims.push({ type: "prism", ring: ringM(qd.ring), y0: (y0 + 15) / 100, y1: (y0 + 215) / 100, material: "worktop", tag: `wall:cubicle:${pl.name}` });
      cubicleCount++;
      cubicleRings[k]!.push(qd.ring);
      continue;
    }
    prims.push({ type: "prism", ring: ringM(qd.ring), y0: y0 / 100, y1: y1 / 100, material: ext ? "stone" : "plaster", tag: `wall:partition:${pl.name}` });
    partitionCount++;
  }
});
report.partitions = partitionCount;
report.cubiclePanels = cubicleCount;
// hairline joints between two hatches (a tower's ring against the wall's, ≤ 10 cm) are the drawing's, not a gap in the stone:
// closed with the wall either side, the storey's height
const slits: number[] = [];
P.forEach((pl, k) => {
  if (k === 4) { slits.push(0); return; }
  const g = pl.walls, nn = g.nx * g.ny;
  const dw = G.distance(g, (v) => v === 1);
  const dil = new Uint8Array(nn); for (let c = 0; c < nn; c++) dil[c] = dw[c]! <= 2.01 ? 1 : 0;
  const de = G.distance({ ...g, a: dil }, (v) => v === 0);
  const fill = new Uint8Array(nn);
  let cnt = 0;
  for (let c = 0; c < nn; c++) if (!g.a[c] && de[c]! > 2.01) { fill[c] = 1; cnt++; }
  slits.push(cnt);
  const y0 = pl.level, y1 = k < 3 ? LEVELS[k + 1]! : ROOF;
  for (const r of G.rects(g, fill)) {
    const [x0, z1] = M(r.x0, r.y0), [x1, z0] = M(r.x1, r.y1);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    if (k === 0 && !inFp(P[1]!, cx, cy)) continue;
    if (k >= 1 && k <= 2 && !inFp(P[k + 1]!, cx, cy)) continue; // a parapet's joint: no storey stands over it
    const ext = exterior(pl, r.x0, r.y0) || exterior(pl, r.x1, r.y1);
    // a joint between a toilet cubicle's panels is the panels' own: their height, their laminate — not a plaster post to the ceiling
    if (cubicleRings[k]!.some((rg) => rg.some((q) => q.x >= r.x0 - 12 && q.x <= r.x1 + 12 && q.y >= r.y0 - 12 && q.y <= r.y1 + 12))) {
      prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + 115) / 100, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: 2, z: z1 - z0 }, material: "worktop", tag: `wall:cubicle:joint:${pl.name}` });
      continue;
    }
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 200, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: (y1 - y0) / 100, z: z1 - z0 }, material: ext ? "stone" : "plaster", tag: `wall:joint:${pl.name}` });
  }
});
report.joints = slits;
report.faceGaps = P.map((pl) => {
  const g = pl.walls, nn = g.nx * g.ny, seen = new Uint8Array(nn), out: string[] = [];
  const isGap = (c: number) => pl.fp[c] === 1 && !pl.closed[c] && pl.outside[c]! <= 8;
  for (let c0 = 0; c0 < nn; c0++) {
    if (seen[c0] || !isGap(c0)) continue;
    const q = [c0]; seen[c0] = 1; let n1 = 0, i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    while (q.length) {
      const c = q.pop()!; n1++; const i = c % g.nx, j = (c - i) / g.nx;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii; if (!seen[kk] && isGap(kk)) { seen[kk] = 1; q.push(kk); }
      }
    }
    if (n1 >= 4) out.push(`X ${(g.x0 + i0 * G.CELL).toFixed(0)}..${(g.x0 + (i1 + 1) * G.CELL).toFixed(0)} Y ${(g.y0 + j0 * G.CELL).toFixed(0)}..${(g.y0 + (j1 + 1) * G.CELL).toFixed(0)} n${n1}`);
  }
  return `${pl.name}: ${out.length} | ` + out.filter((l) => +l.split(" ")[3]!.split("..")[1]! > 1350).join("; ");
});
report.walls = wallCount;
report.frames = elevs.map((el) => `${el.name}: ` + [...new Map(el.shapes.map((sh) => [sh.family.slice(-22), `${sh.kind} h${sh.hs?.length ?? 0} v${sh.vs?.length ?? 0}`])).entries()].map(([f, v]) => `${f}=${v}`).join("; "));
report.overhangs = [...overhangsDone];
report.canopyPieces = canopyPieces;


// ---------- openings: each plan's gap filled around the opening's true shape
type Gap = { along: "x" | "y"; a0: number; a1: number; t0: number; t1: number; out: 1 | -1 };
/**
 * A door whose wall the grid cannot tell from the room (an end cubicle's: its side panels run the cubicle's whole depth, so every
 * row between them reads as wall): the gap from the block's own frame, its two jamb squares (short lines ≤ 10 cm, clustered) on
 * one line, as far apart as the type's width.
 */
let frameGaps = 0, hingeGaps = 0;
/** Which face of a wall is the outside: the one nearer open air (the plan's distance to outside), not only the one off the
 * footprint — a stair tower's shaft is off it too, and a window there was turned to face into the stair. */
function outOf(pl: Plan, along: "x" | "y", am: number, t0: number, t1: number): 1 | -1 {
  const dist = (t: number) => { const c = along === "x" ? cellOf(pl.walls, am, t) : cellOf(pl.walls, t, am); return c < 0 ? 0 : pl === P[0] ? Math.min(pl.outside[c]!, courtOf().courtDist[c]!) : pl.outside[c]!; };
  // first a straight look out each way along the wall's normal: the side that sees the plan's edge with no wall between
  const free = (t: number, dir: 1 | -1) => {
    const g = pl.walls, lim = dir === 1 ? (along === "x" ? g.y0 + g.ny * G.CELL : g.x0 + g.nx * G.CELL) : along === "x" ? g.y0 : g.x0;
    for (let u = t; dir === 1 ? u < lim : u > lim; u += dir * G.CELL) if (along === "x" ? isWall(pl, am, u) : isWall(pl, u, am)) return false;
    return true;
  };
  const f1 = free(t1 + 10, 1), f0 = free(t0 - 10, -1);
  if (f1 !== f0) return f1 ? 1 : -1;
  const d1 = dist(t1 + 40), d0 = dist(t0 - 40);
  if (d1 !== d0) return d1 < d0 ? 1 : -1;
  const probe = (t: number) => (along === "x" ? inFp(pl, am, t) : inFp(pl, t, am));
  return !probe(t1 + 40) ? 1 : !probe(t0 - 40) ? -1 : 1;
}
function frameGap(pl: Plan, i: Inst): Gap | null {
  const pts: Pt[] = [];
  for (const p of i.pieces) if (p.pts) for (let j = 0; j + 1 < p.pts.length; j++) {
    const a = p.pts[j]!, b = p.pts[j + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) <= 10) pts.push(a, b);
  }
  const cl: Box[] = [];
  for (const q of pts) {
    const c = cl.find((b) => q.x >= b.x0 - 10 && q.x <= b.x1 + 10 && q.y >= b.y0 - 10 && q.y <= b.y1 + 10);
    if (c) { c.x0 = Math.min(c.x0, q.x); c.x1 = Math.max(c.x1, q.x); c.y0 = Math.min(c.y0, q.y); c.y1 = Math.max(c.y1, q.y); } else cl.push({ x0: q.x, x1: q.x, y0: q.y, y1: q.y });
  }
  const sq = cl.filter((b) => b.x1 - b.x0 <= 12 && b.y1 - b.y0 <= 12 && (b.x1 - b.x0 > 0.5 || b.y1 - b.y0 > 0.5));
  const want = famWH(i.family)?.[0] ?? 80;
  let best: { g: Gap; err: number } | null = null;
  for (let p = 0; p < sq.length; p++) for (let q = p + 1; q < sq.length; q++) {
    const A = sq[p]!, B = sq[q]!;
    for (const along of ["x", "y"] as const) {
      const [aA0, aA1, tA0, tA1] = along === "x" ? [A.x0, A.x1, A.y0, A.y1] : [A.y0, A.y1, A.x0, A.x1];
      const [aB0, aB1, tB0, tB1] = along === "x" ? [B.x0, B.x1, B.y0, B.y1] : [B.y0, B.y1, B.x0, B.x1];
      if (Math.abs((tA0 + tA1) / 2 - (tB0 + tB1) / 2) > 3) continue; // one wall line
      const [lo, hi] = aA0 < aB0 ? [aA1, aB0] : [aB1, aA0];
      const err = Math.abs(hi - lo - want);
      if (hi - lo < 40 || err > 15) continue;
      const t0 = Math.min(tA0, tB0), t1 = Math.max(tA1, tB1), am = (lo + hi) / 2;
      const probe = (t: number) => (along === "x" ? inFp(pl, am, t) : inFp(pl, t, am));
      const g: Gap = { along, a0: lo, a1: hi, t0, t1, out: outOf(pl, along, am, t0, t1) };
      if (!best || err < best.err) best = { g, err };
    }
  }
  return best?.g ?? null;
}
function gapOf(pl: Plan, i: Inst): Gap | null {
  const b = i.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const tries: Gap[] = [];
  for (const along of ["x", "y"] as const) {
    // the reach: the block's own extent, or its type's width where the block is drawn short (a door whose leaf and swing are
    // nested deeper than its frame line: the panic door's 68 cm line of a 120 door), its whole width off its line's middle
    const famW = famWH(i.family)?.[0] ?? 0, ext = along === "x" ? b.x1 - b.x0 : b.y1 - b.y0;
    const half = ext >= famW - 5 ? ext / 2 + 40 : famW + 40;
    const aMid = along === "x" ? cx : cy, tMid = along === "x" ? cy : cx;
    const tHalf = (along === "x" ? b.y1 - b.y0 : b.x1 - b.x0) / 2 + 40;
    const at = (a: number, t: number) => (along === "x" ? isWall(pl, a, t) : isWall(pl, t, a));
    // a wall row: wall on both sides of the opening's middle, within reach
    const acrossVals: Array<{ t: number; l: number; r: number }> = [];
    for (let t = tMid - tHalf; t <= tMid + tHalf; t += G.CELL) {
      let l = aMid, r = aMid;
      while (l > aMid - half && !at(l, t)) l -= G.CELL;
      while (r < aMid + half && !at(r, t)) r += G.CELL;
      if (l > aMid - half && r < aMid + half && r - l > 30) acrossVals.push({ t, l, r });
    }
    if (acrossVals.length < 1) continue; // a cubicle's 2 cm panel is one row of cells
    // rows with the same jambs are one wall's depth; a room's width between two cross walls (inside a cubicle) is another run,
    // too deep to be a wall, and is passed over
    const runs: Array<typeof acrossVals> = [];
    for (const v of acrossVals) { const last = runs.at(-1); const lv = last?.at(-1); if (last && lv && v.t - lv.t <= G.CELL * 1.5 && Math.abs(v.l - lv.l) <= G.CELL && Math.abs(v.r - lv.r) <= G.CELL) last.push(v); else runs.push([v]); }
    const okRuns = runs.filter((rn) => { const d = rn.at(-1)!.t - rn[0]!.t + G.CELL; return d <= 90 && d >= 4; });
    // a door at a corridor's end between two long walls (the prayer room's at 48,537): the jambs run on deeper than a wall; the
    // door's frame stands at its swing's hinge line, a light wall's 20 cm there
    if (!okRuns.length && isDoor(i)) {
      const hinge = i.pieces.find((p) => p.arc && p.arc.r > 40)?.arc?.c;
      const th = hinge ? (along === "x" ? hinge.y : hinge.x) : null;
      const deep = th == null ? undefined : runs.find((rn) => rn[0]!.t - G.CELL <= th && th <= rn.at(-1)!.t + G.CELL);
      if (deep && th != null) { const v = deep.reduce((m, q) => (Math.abs(q.t - th) < Math.abs(m.t - th) ? q : m)); tries.push({ along, a0: v.l + G.CELL / 2, a1: v.r - G.CELL / 2, t0: th - 10, t1: th + 10, out: 1 }); hingeGaps++; }
    }
    if (!okRuns.length) continue;
    const run = okRuns.sort((p, q) => Math.abs((p[0]!.t + p.at(-1)!.t) / 2 - tMid) - Math.abs((q[0]!.t + q.at(-1)!.t) / 2 - tMid))[0]!;
    const t0 = run[0]!.t - G.CELL / 2, t1 = run.at(-1)!.t + G.CELL / 2;
    const tm = (t0 + t1) / 2;
    let l = aMid, r = aMid;
    while (l > aMid - half && !at(l, tm)) l -= G.CELL;
    while (r < aMid + half && !at(r, tm)) r += G.CELL;
    const probe = (t: number) => (along === "x" ? inFp(pl, aMid, t) : inFp(pl, t, aMid));
    const outSide: 1 | -1 = outOf(pl, along, aMid, t0, t1);
    tries.push({ along, a0: l + G.CELL / 2, a1: r - G.CELL / 2, t0, t1, out: outSide });
  }
  if (!tries.length && isDoor(i)) { const fg = frameGap(pl, i); if (fg) { frameGaps++; return fg; } }
  if (!tries.length) return null;
  const want = famWH(i.family)?.[0];
  return tries.sort((p, q) => (want ? Math.abs(p.a1 - p.a0 - want) - Math.abs(q.a1 - q.a0 - want) : q.t1 - q.t0 - (p.t1 - p.t0)))[0]!;
}
const solidGaps: string[] = [], offWall: string[] = [], roofSeenBelow: string[] = [];
const noGapInsts: Array<{ k: number; i: Inst; name: string }> = [];
function solidGap(pl: Plan, i: Inst): Gap | null {
  const b = i.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const wh = famWH(i.family), w = wh?.[0] ?? Math.max(b.x1 - b.x0, b.y1 - b.y0);
  let best: Gap | null = null, bestLen = 0;
  for (const along of ["x", "y"] as const) {
    const at = (a: number, t: number) => (along === "x" ? isWall(pl, a, t) : isWall(pl, t, a));
    const aMid = along === "x" ? cx : cy, tMid = along === "x" ? cy : cx;
    // the wall the block stands in: the run of wall across it nearest its middle, a wall's depth (10..90)
    let t0 = NaN, t1 = NaN;
    for (let d = 0; d <= 60 && Number.isNaN(t0); d += G.CELL) for (const sg of [1, -1]) { const t = tMid + sg * d; if (at(aMid, t)) { t0 = t; t1 = t; break; } }
    if (Number.isNaN(t0)) continue;
    while (at(aMid, t0 - G.CELL) && t0 - t1 > -100) t0 -= G.CELL;
    while (at(aMid, t1 + G.CELL) && t1 - t0 < 100) t1 += G.CELL;
    // a wall the plan fills on into what stands against it inside (a WC's wet wall, a shaft): the window's own is the outer
    // 40 cm of it, from the face the outside meets
    if (t1 - t0 + G.CELL > 95) {
      const outAt = (t: number) => !(along === "x" ? inFp(pl, aMid, t) : inFp(pl, t, aMid));
      if (outAt(t0 - 40)) t1 = t0 + 35; else if (outAt(t1 + 40)) t0 = t1 - 35; else continue;
    }
    const depth = t1 - t0 + G.CELL;
    if (depth < 10) continue;
    // whole along the opening's width at the wall's middle
    const tm = (t0 + t1) / 2;
    let len = 0;
    for (let a = aMid - w / 2 + G.CELL / 2; a < aMid + w / 2; a += G.CELL) if (at(a, tm)) len += G.CELL;
    if (len < 0.9 * w || len <= bestLen) continue;
    bestLen = len;
    const probe = (t: number) => (along === "x" ? inFp(pl, aMid, t) : inFp(pl, t, aMid));
    const T0 = t0 - G.CELL / 2, T1 = t1 + G.CELL / 2;
    best = { along, a0: aMid - w / 2, a1: aMid + w / 2, t0: T0, t1: T1, out: outOf(pl, along, aMid, T0, T1) };
  }
  return best;
}
const box = (a0: number, a1: number, t0: number, t1: number, y0: number, y1: number, along: "x" | "y", material: BuildingMaterial, tag: string) => {
  if (a1 - a0 < 0.5 || t1 - t0 < 0.5 || y1 - y0 < 0.5) return;
  const [X0, X1, Y0, Y1] = along === "x" ? [a0, a1, t0, t1] : [t0, t1, a0, a1];
  const [mx0, mz1] = M(X0, Y0), [mx1, mz0] = M(X1, Y1);
  prims.push({ type: "box", centre: { x: (mx0 + mx1) / 2, y: (y0 + y1) / 200, z: (mz0 + mz1) / 2 }, size: { x: mx1 - mx0, y: (y1 - y0) / 100, z: mz1 - mz0 }, material, tag });
};
// A facade wall the top storey's plan draws and the roof plan does not carry on (the strip between the two street towers): the
// face-on elevation draws it standing on past the roof (+18.00 with its cornice). Each run of such walls along one face line —
// window gaps bridged — is one wall from the roof to the top that elevation draws over it.
{
  parapetCopingAt(0, 0, 0, 0); // sets fpBox
  const fb = fpBox!;
  type Run = { along: "x" | "y"; t0: number; t1: number; a0: number; a1: number };
  const segs: Run[] = [];
  for (const p of P[3]!.pieces) {
    if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue;
    for (const o of p.rings) {
      if (o.length < 3 || Math.abs(ringArea(o)) < 4) continue;
      const xs = o.map((q) => q.x), ys = o.map((q) => q.y);
      const [X0, X1, Y0, Y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const along: "x" | "y" = X1 - X0 >= Y1 - Y0 ? "x" : "y";
      const [t0, t1, a0, a1] = along === "y" ? [X0, X1, Y0, Y1] : [Y0, Y1, X0, X1];
      if (t1 - t0 > 60 || isCanopyRing(keyOf(o)) || isWall(P[4]!, (X0 + X1) / 2, (Y0 + Y1) / 2) || !o.some((q) => exterior(P[3]!, q.x, q.y))) continue;
      segs.push({ along, t0, t1, a0, a1 });
    }
  }
  const runs: Run[] = [];
  for (const s of segs.sort((a, b) => a.a0 - b.a0)) {
    const r = runs.find((q) => q.along === s.along && Math.min(q.t1, s.t1) - Math.max(q.t0, s.t0) > -5 && s.a0 <= q.a1 + 150);
    if (r) { r.t0 = Math.min(r.t0, s.t0); r.t1 = Math.max(r.t1, s.t1); r.a1 = Math.max(r.a1, s.a1); } else runs.push({ ...s });
  }
  for (const r of runs) {
    // its ends stop at the roof plan's walls (the towers' own)
    const at = (a: number) => (r.along === "y" ? { x: (r.t0 + r.t1) / 2, y: a } : { x: a, y: (r.t0 + r.t1) / 2 });
    while (r.a0 < r.a1 && (() => { const q = at(r.a0 + 5); return isWall(P[4]!, q.x, q.y); })()) r.a0 += 10;
    while (r.a1 > r.a0 && (() => { const q = at(r.a1 - 5); return isWall(P[4]!, q.x, q.y); })()) r.a1 -= 10;
    if (r.a1 - r.a0 < 150) continue;
    const mid = (r.t0 + r.t1) / 2;
    const near = r.along === "y" ? (mid > (fb[0] + fb[1]) / 2 ? /מזרח/ : /מערב/) : (mid > (fb[2] + fb[3]) / 2 ? /דרומ/ : /צפונ/);
    const el = elevs.find((e) => e.map && e.map.score >= 3 && near.test(e.name) && (e.map.axis === "Y") === (r.along === "y"));
    if (!el) continue;
    const hs: number[] = [];
    for (let a = r.a0 + 5; a < r.a1; a += 10) { const t = el.top.get(Math.round((el.map!.s * a + el.map!.b) / 10)); if (t != null) hs.push(t); }
    if (hs.length < (r.a1 - r.a0) / 20) continue;
    const top = hs.sort((p, q) => p - q)[Math.floor(hs.length / 2)]!;
    if (top < ROOF + 40 || top > 2100) continue;
    box(r.a0, r.a1, r.t0, r.t1, ROOF, top, r.along, "stone", "wall:M-roof");
    // it is the roof's wall now: the elevation's cornice over it (+18.00) is laid on it like on any roof wall
    for (let a = r.a0 + G.CELL / 2; a < r.a1; a += G.CELL) for (let t = r.t0 + G.CELL / 2; t < r.t1; t += G.CELL) {
      const q = at(a), c = cellOf(P[4]!.walls, r.along === "y" ? t : q.x, r.along === "y" ? q.y : t);
      if (c >= 0) { P[4]!.walls.a[c] = 1; roofWallTop[c] = top; }
    }
    report.roofCarried = [...((report.roofCarried as string[]) ?? []), `${r.along} t${r.t0.toFixed(0)}..${r.t1.toFixed(0)} a${r.a0.toFixed(0)}..${r.a1.toFixed(0)} → ${top.toFixed(0)}`];
  }
}
/** An upright outline (u, y in cm) in a wall running `along`, through the wall from t0 to t1 (plan cm): a true curve, no slices. */
let sidePrisms = 0;
const sidePrism = (poly: Array<[number, number]>, along: "x" | "y", t0: number, t1: number, material: BuildingMaterial, tag: string) => {
  if (t1 - t0 < 0.5 || poly.length < 3) return;
  const ys = poly.map(([, y]) => y);
  const ring: Array<[number, number]> = poly.map(([u, y]) => [along === "x" ? u / 100 : -u / 100, y / 100]);
  const side = along === "x" ? { along: "x" as const, t0: -t1 / 100, t1: -t0 / 100 } : { along: "z" as const, t0: t0 / 100, t1: t1 / 100 };
  prims.push({ type: "prism", ring, y0: Math.min(...ys) / 100, y1: Math.max(...ys) / 100, material, tag, side });
  sidePrisms++;
};
type Prof = { kind: Shape["kind"]; cA: number; w: number; bottom: number; top: number; spring: number; r: number; rOuter: number; cy: number; hs?: number[]; vs?: number[]; sp?: Array<[number, number]> };
function openingAt(prof: Prof, u: number): [number, number] | null {
  const d = u - prof.cA;
  if (prof.kind === "round") { if (Math.abs(d) >= prof.r) return null; const h = Math.sqrt(prof.r ** 2 - d * d); return [prof.cy - h, prof.cy + h]; }
  if (Math.abs(d) >= prof.w / 2) return null;
  if (prof.kind === "arch") return [prof.bottom, prof.spring + Math.sqrt(Math.max(0, prof.r ** 2 - d * d))];
  return [prof.bottom, prof.top];
}
/** The frame's bars the elevation draws in the glass: transoms across the opening's width at their height, mullions from the
 * sill to the opening's head at their place; 6 cm faces, a little proud of the glass either side. */
function frameBars(prof: Prof, L: number, Ltop: number, tA: number, tB: number, along: "x" | "y", tag: string) {
  let n1 = 0;
  for (const y of prof.hs ?? []) {
    if (y < L || y > Ltop) continue;
    let hw = prof.w / 2;
    if (prof.kind === "arch" && y > prof.spring) hw = Math.sqrt(Math.max(0, prof.r * prof.r - (y - prof.spring) ** 2));
    if (hw < 5) continue;
    box(prof.cA - hw, prof.cA + hw, tA - 2, tB + 2, y - 3, y + 3, along, "frame", tag + ":bar"); n1++;
  }
  // the spandrel: an opaque panel in the glass's plane where the slab passes behind it, a bar at its top and bottom
  for (const [y0, y1] of prof.sp ?? []) {
    if (y1 < L || y0 > Ltop) continue;
    const hw = prof.w / 2;
    box(prof.cA - hw, prof.cA + hw, tA - 1, tB + 1, Math.max(L, y0), Math.min(Ltop, y1), along, "darkSteel", tag + ":spandrel"); n1++;
    for (const y of [y0, y1]) if (y >= L && y <= Ltop) box(prof.cA - hw, prof.cA + hw, tA - 2, tB + 2, y - 3, y + 3, along, "frame", tag + ":bar");
  }
  for (const v of prof.vs ?? []) {
    const op = openingAt(prof, prof.cA + v);
    if (!op) continue;
    const y0 = Math.max(L, op[0]), y1 = Math.min(Ltop, op[1]);
    if (y1 - y0 < 10) continue;
    box(prof.cA + v - 3, prof.cA + v + 3, tA - 2, tB + 2, y0, y1, along, "frame", tag + ":bar"); n1++;
  }
  return n1;
}
let barCount = 0;
/** Where a window passes a floor: the opening's plan rectangle (the wall's whole depth) and the heights it spans. */
const throughSlabs: Array<{ along: "x" | "y"; a0: number; a1: number; t0: number; t1: number; y0: number; y1: number }> = [];
function surroundAt(prof: Prof, u: number): [number, number] | null {
  if (prof.rOuter <= prof.r + 2) return null;
  const d = u - prof.cA, R = prof.rOuter;
  if (Math.abs(d) >= R) return null;
  if (prof.kind === "round") { const h = Math.sqrt(R * R - d * d); return [prof.cy - h, prof.cy + h]; }
  return [prof.bottom, prof.spring + Math.sqrt(R * R - d * d)];
}
const doorSeen: string[] = [];
const doorPads: Array<{ along: "x" | "y"; a0: number; a1: number; t: number; out: number; sill: number }> = [];
// the outside doors' heads, for the lantern over each
const doorHeads: Array<{ k: number; along: "x" | "y"; a: number; w: number; t: number; out: number; top: number }> = [];
let matched = 0, unmatched = 0, filled = 0, noGap = 0;
const noGapList: string[] = [];
const roofSplits: Array<{ along: "x" | "y"; a0: number; a1: number; t0: number; t1: number; tag?: string }> = [];
/** Intervals [lo, hi] minus the cut intervals. */
function minus(base: Array<[number, number]>, cutsIn: Array<[number, number]>): Array<[number, number]> {
  let cur = base.filter(([a, b]) => b > a);
  for (const [c0, c1] of cutsIn) cur = cur.flatMap(([a, b]): Array<[number, number]> => (c1 <= a || c0 >= b ? [[a, b]] : ([[a, Math.min(b, c0)], [Math.max(a, c1), b]] as Array<[number, number]>).filter(([p2, q]) => q - p2 > 0.5)));
  return cur;
}
const usedShapes = new Set<Shape>();
const looseTaken: string[] = [];
type Entry = { gap: Gap; prof: Prof; tag: string; extWall: boolean; glassMat: BuildingMaterial; door?: boolean; shaped?: boolean };
const entriesBy: Entry[][] = [];
let carriedDown = 0, dupOpenings = 0, cubicleDoors = 0, revolving = 0, liftDoors = 0, carriedUp = 0, carriedUpInto = 0;
P.forEach((pl, k) => {
  const L = pl.level, LtopStorey = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
  const entries: Entry[] = [];
  for (const i of pl.insts) {
    if (!isOpening(i.family)) continue;
    // the roof plan: the doors of its rooms (stair heads); its windows are the top storey's carried up, or the face's louvers
    if (k === 4 && !isDoor(i)) continue;
    // the roof plan draws the top storey's doors under it again (the same block at the same place, seen from above): they are
    // floor 3's, built there — not doors standing on the roof
    // — told by its insertion point (the same as floor 3's block), or by the roof's wall there standing lower than a door
    // (a parapet: the roof plan draws a door block only as its head line over it)
    const sameAsBelow = (o: Inst) => o.family === i.family && ((o.m && i.m && Math.hypot(o.m.e - i.m.e, o.m.f - i.m.f) < 5) || Math.hypot((o.box.x0 + o.box.x1) / 2 - (i.box.x0 + i.box.x1) / 2, (o.box.y0 + o.box.y1) / 2 - (i.box.y0 + i.box.y1) / 2) < 30);
    const roofWallBy = () => { const cx = i.m?.e ?? (i.box.x0 + i.box.x1) / 2, cy = i.m?.f ?? (i.box.y0 + i.box.y1) / 2; let t = 0; for (let dx = -60; dx <= 60; dx += G.CELL) for (let dy = -60; dy <= 60; dy += G.CELL) { const c = cellOf(P[4]!.walls, cx + dx, cy + dy); if (c >= 0) t = Math.max(t, roofWallTop[c] ?? 0); } return t; };
    if (k === 4 && (P[3]!.insts.some(sameAsBelow) || roofWallBy() < ROOF + (famWH(i.family)?.[1] ?? 210) - 10)) { roofSeenBelow.push(`${i.family.slice(-20)} @${((i.box.x0 + i.box.x1) / 2).toFixed(0)},${((i.box.y0 + i.box.y1) / 2).toFixed(0)}`); continue; }
    let gap = gapOf(pl, i);
    // a window over the plan's cut (a high "BW Standard Single 100_78", a round window): the plan draws its wall whole under
    // its block. Its gap is cut into that wall here — the wall's depth at the block, the type's width along it — and the
    // storey's wall prism split round it, as the openings carried up into the roof walls are
    // a gap found off the block's own wall (the WC's partition 50 cm in behind a window drawn in the outer wall): the window is
    // the outer wall's, cut there
    if (gap && !isDoor(i)) {
      const [b0, b1] = gap.along === "x" ? [i.box.y0, i.box.y1] : [i.box.x0, i.box.x1];
      if (gap.t1 < b0 - 5 || gap.t0 > b1 + 5) { const sg = solidGap(pl, i); if (sg && !(sg.t1 < b0 - 5 || sg.t0 > b1 + 5)) { offWall.push(`${pl.name} ${i.family.slice(-20)} @${((i.box.x0 + i.box.x1) / 2).toFixed(0)},${((i.box.y0 + i.box.y1) / 2).toFixed(0)}`); gap = null; } }
    }
    if (!gap && !isDoor(i)) { gap = solidGap(pl, i); if (gap) { solidGaps.push(`${pl.name} ${i.family.slice(-24)}`); for (const tg of [`wall:${pl.name}`, `wall:partition:${pl.name}`, `wall:lining:${pl.name}`]) roofSplits.push({ along: gap.along, a0: gap.a0, a1: gap.a1, t0: gap.t0 - 6, t1: gap.t1 + 6, tag: tg }); } }
    // a revolving door (the lobby's two, on the light line between the lobby and the mikveh's entrance): no gap to fill, its own
    // drum — the glass arcs the plan draws (A-DOOR-GLAZ), four leaves crossed at its post, a round canopy and floor plate
    if (!gap && /Revolving/i.test(i.family)) {
      const arcs = i.pieces.filter((p) => p.arc && p.layer === "A-DOOR-GLAZ");
      const c = arcs[0]?.arc?.c ?? { x: (i.box.x0 + i.box.x1) / 2, y: (i.box.y0 + i.box.y1) / 2 };
      const R = Math.max(...arcs.map((p) => p.arc!.r), 67), H = 230;
      const ringAt = (r: number, nSeg = 32): Array<[number, number]> => Array.from({ length: nSeg }, (_, j) => { const a = (j / nSeg) * 2 * Math.PI; return M(c.x + r * Math.cos(a), c.y + r * Math.sin(a)); });
      for (const p of arcs) {
        let a0 = p.arc!.start, a1 = p.arc!.end; if (a1 <= a0) a1 += 2 * Math.PI;
        const ns = Math.max(2, Math.ceil((a1 - a0) / 0.12));
        const outer: Pt[] = [], inner: Pt[] = [];
        for (let j = 0; j <= ns; j++) { const a = a0 + ((a1 - a0) * j) / ns; outer.push({ x: c.x + (R + 1) * Math.cos(a), y: c.y + (R + 1) * Math.sin(a) }); inner.push({ x: c.x + (R - 1) * Math.cos(a), y: c.y + (R - 1) * Math.sin(a) }); }
        prims.push({ type: "prism", ring: ringM([...outer, ...inner.reverse()]), y0: (L + 2) / 100, y1: (L + H) / 100, material: "glass", tag: `door:revolving:${pl.name}` });
      }
      for (let w = 0; w < 4; w++) { // the leaves, glass in a thin metal edge, at 45° to the line
        const a = Math.PI / 4 + (w * Math.PI) / 2, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        const r0 = 4, r1 = R - 3, t = 1;
        const q = [[r0, -t], [r1, -t], [r1, t], [r0, t]].map(([r, o]) => ({ x: c.x + dx * r! + nx * o!, y: c.y + dy * r! + ny * o! }));
        prims.push({ type: "prism", ring: ringM(q), y0: (L + 3) / 100, y1: (L + H - 5) / 100, material: "glass", tag: `door:revolving:${pl.name}` });
        const e = [[r1 - 3, -2], [r1, -2], [r1, 2], [r1 - 3, 2]].map(([r, o]) => ({ x: c.x + dx * r! + nx * o!, y: c.y + dy * r! + ny * o! }));
        prims.push({ type: "prism", ring: ringM(e), y0: (L + 3) / 100, y1: (L + H - 5) / 100, material: "metal", tag: `door:revolving:${pl.name}` });
      }
      prims.push({ type: "prism", ring: ringAt(4, 12), y0: L / 100, y1: (L + H) / 100, material: "metal", tag: `door:revolving:${pl.name}` });
      prims.push({ type: "prism", ring: ringAt(R + 3), y0: (L + H) / 100, y1: (L + H + 18) / 100, material: "metal", tag: `door:revolving:${pl.name}` });
      prims.push({ type: "prism", ring: ringAt(R + 1), y0: L / 100, y1: (L + 1.5) / 100, material: "metal", tag: `door:revolving:${pl.name}` });
      revolving++; continue;
    }
    if (!gap) { noGap++; noGapList.push(`${pl.name} ${i.family.slice(-28)} @${((i.box.x0 + i.box.x1) / 2).toFixed(0)},${((i.box.y0 + i.box.y1) / 2).toFixed(0)}`); noGapInsts.push({ k, i, name: noGapList.at(-1)! }); continue; }
    filled++;
    const X = (i.box.x0 + i.box.x1) / 2, Y = (i.box.y0 + i.box.y1) / 2;
    const aCentre = (gap.a0 + gap.a1) / 2;
    let shape: Shape | undefined;
    let shapeEl: Elev | undefined;
    for (const el of elevs) {
      if (!el.map || el.map.score < 3) continue;
      if ((el.map.axis === "X") !== (gap.along === "x")) continue; // only the elevation that sees it face on
      const e = el.map.s * (el.map.axis === "X" ? X : Y) + el.map.b;
      // its own family where the elevation draws it; else whatever opening the elevation draws in this gap on this storey (the
      // gallery's south arches are loose lines in the elevation over a plan block of a plain window)
      const Lk = pl.level, Lnext = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
      // an opening is this plan's if it opens within the storey's height (a tall window is every storey's it passes)
      const onStorey = (sh: Shape) => sh.bottom < Lnext - 50 && (sh.kind === "round" ? sh.cy + sh.r : sh.top) > Lk + 50;
      const s = el.shapes.find((sh) => sh.family === i.family && Math.abs(sh.cx - e) < 15 && onStorey(sh))
        // a door on a stair's half landing opens below the storey it is cut in (the west tower's door at +6.12 in the +8.16 plan)
        // (its block drawn cut short by the stair in front of it, so its centre reads off: the type's width is the tolerance)
        ?? (isDoor(i) ? el.shapes.find((sh) => sh.family === i.family && Math.abs(sh.cx - e) < (famWH(i.family)?.[0] ?? 100) / 2 && !usedShapes.has(sh) && Math.max(sh.top, sh.bottom + (famWH(i.family)?.[1] ?? 0)) > Lk - 10 && sh.bottom < Lnext - 50) : undefined)
        // (a door takes a loose shape only if it stands on the floor: the north face's middle arch, sill +1.10, was taken by an
        // inner double door on the same line 7 m in, and left an open hole to the floor in the facade)
        ?? el.shapes.find((sh) => sh.family.startsWith("loose") && !usedShapes.has(sh) && Math.abs(sh.cx - e) < 15 && onStorey(sh) && sh.w <= gap.a1 - gap.a0 + 10 && (!isDoor(i) || sh.bottom < Lk + 20));
      if (s) { shape = s; shapeEl = el; usedShapes.add(s); if (s.family.startsWith("loose")) looseTaken.push(`${el.name} ${s.cx.toFixed(0)} ← ${pl.name} ${i.family} @${X.toFixed(0)},${Y.toFixed(0)}`); break; }
    }
    if (shape) matched++; else unmatched++;
    const wh = famWH(i.family);
    const door = isDoor(i);
    let prof: Prof;
    if (shape && shapeEl) {
      const e = shapeEl.map!.s * (shapeEl.map!.axis === "X" ? X : Y) + shapeEl.map!.b;
      const landing = door && wh != null && Math.abs(shape.cx - e) >= 15; // a cut-short door block: the plan places it, the type sizes it
      const cA = landing ? aCentre : aCentre + shapeEl.map!.s * (shape.cx - e);
      // a door's block drawn cut short by what stands in front of it keeps its type's height
      // — the edge it is cut short at is the one farther from the plan's floor (a roof room's door shows only over the parapet)
      let bottom = shape.bottom;
      if (door && wh && shape.top - shape.bottom < wh[1] - 5 && Math.abs(shape.top - wh[1] - L) < Math.abs(shape.bottom - L)) bottom = shape.top - wh[1];
      const top = door && wh && shape.kind === "rect" ? Math.max(shape.top, bottom + wh[1]) : shape.top;
      prof = { kind: landing ? "rect" : shape.kind, cA, w: landing ? wh![0] : shape.w, bottom, top, spring: shape.spring, r: shape.r, rOuter: shape.rOuter, cy: shape.cy, hs: shape.hs, vs: shape.vs?.map((v) => shapeEl!.map!.s * v), sp: shape.sp };
    } else {
      const w = Math.min(wh?.[0] ?? gap.a1 - gap.a0, gap.a1 - gap.a0), h = wh?.[1] ?? (door ? 210 : 130);
      const bottom = door ? L : L + (h > 300 ? 60 : 90);
      const kind: Shape["kind"] = /עגול/.test(i.family) ? "round" : /קשת/.test(i.family) ? "arch" : "rect";
      prof = { kind, cA: aCentre, w, bottom, top: bottom + h, spring: bottom + h - w / 2, r: w / 2, rOuter: 0, cy: bottom + h / 2 };
      if (kind === "round") { prof.r = 50; prof.cy = L + 200; prof.w = 100; }
    }
    const tag = `opening:${pl.name}:${i.family}`;
    // the lift's landing door: a sliding door within 2.5 m of the plan's "מעלית" note (the A-GENM opening "פתח עפ"י יועץ מעליות")
    const liftNote = /Sliding/i.test(i.family) && P.some((q) => q.pieces.some((p) => p.text && p.at && /מעלית/.test(p.text) && Math.hypot(p.at.x - X, p.at.y - Y) < 250));
    // a vision-panel door (VP: the women's gallery's 1.5 m-high panels in its front over the hall) is glazed, in the front's dark tint
    const glassMat: BuildingMaterial = liftNote ? "metal" : /- VP -/.test(i.family) ? "glassTint" : door && !/זכוכית|Glass|Curtain|Arch/i.test(i.family) ? "timber" : "glass";
    if (liftNote) {
      liftDoors++;
      // two leaves meeting at the centre: a dark seam, a steel frame round them and a call button beside the jamb
      const a = prof.cA, t0 = gap.t0 - 1, t1 = gap.t1 + 1, top = prof.top, w = prof.w;
      box(a - 0.6, a + 0.6, t0, t1, L, top, gap.along, "darkSteel", tag + ":lift");
      for (const s of [-1, 1]) box(a + s * (w / 2) - 4, a + s * (w / 2) + 4, t0 - 1, t1 + 1, L, top + 4, gap.along, "darkSteel", tag + ":lift");
      box(a - w / 2 - 4, a + w / 2 + 4, t0 - 1, t1 + 1, top, top + 6, gap.along, "darkSteel", tag + ":lift");
      for (const t of [t0 - 2, t1]) box(a + w / 2 + 12, a + w / 2 + 20, t, t + 2, L + 100, L + 125, gap.along, "metal", tag + ":lift:button");
    }
    entries.push({ gap, prof, tag, extWall: exterior(pl, X, Y, 80), glassMat, door, shaped: !!shape });
    // an outside door's sill: the ground in front of it is dug down to it (a sunk path to the tower's door at +6.10 on the west)
    if (door) doorSeen.push(`${pl.name} ${X.toFixed(0)},${Y.toFixed(0)} ext=${exterior(pl, X, Y, 80)} out=${gap.out}`);
    if (door && exterior(pl, X, Y, 80)) doorHeads.push({ k, along: gap.along, a: prof.cA, w: prof.w, t: gap.out === 1 ? gap.t1 : gap.t0, out: gap.out, top: prof.top });
    if (door && exterior(pl, X, Y, 80)) doorPads.push({ along: gap.along, a0: prof.cA - prof.w / 2 - 30, a1: prof.cA + prof.w / 2 + 30, t: gap.out === 1 ? gap.t1 : gap.t0, out: gap.out, sill: prof.bottom });
  }
  entriesBy[k] = entries;
});
const revealHeads: string[] = [];
P.forEach((pl, k) => {
  const L = pl.level;
  let LtopStorey = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
  // an opening of the storey above that starts below its floor (the tower's 6.4 m window over the landing door) is cut into
  // this storey's wall too, where this storey has its own opening there to cut round
  const own = entriesBy[k] ?? [];
  const carried = k < 3 ? (entriesBy[k + 1] ?? []).filter((e) => e.prof.bottom < LEVELS[k + 1]! - 5 && own.some((o) => o.gap.along === e.gap.along && o.gap.a0 < e.gap.a1 && e.gap.a0 < o.gap.a1 && o.gap.t0 < e.gap.t1 && e.gap.t0 < o.gap.t1) && !own.some((o) => Math.abs(o.prof.cA - e.prof.cA) < 10 && Math.abs(o.prof.bottom - e.prof.bottom) < 10)) : [];
  carriedDown += carried.length;
  // and one of the storey below that rises past this floor into a wall where this storey cuts its own opening (the tower's
  // round window at 11.14..12.54 under the round one at 15.32): cut here too, in this storey's band, with its own
  const topOfE = (e: Entry) => (e.prof.kind === "round" ? e.prof.cy + e.prof.r : e.prof.top);
  const fromBelow = k >= 1 && k <= 3 ? (entriesBy[k - 1] ?? []).filter((e) => topOfE(e) > L + 5 && own.some((o) => o.gap.along === e.gap.along && o.gap.a0 < e.gap.a1 && e.gap.a0 < o.gap.a1 && o.gap.t0 < e.gap.t1 && e.gap.t0 < o.gap.t1) && !own.some((o) => Math.abs(o.prof.cA - e.prof.cA) < 10 && Math.abs(o.prof.bottom - e.prof.bottom) < 10)) : [];
  carriedUpInto += fromBelow.length;
  const entries = [...own, ...carried, ...fromBelow];
  // Openings sharing one gap (a small window under an arch, stacked in the same wall) are cut together: the wall is the band
  // minus all of them, so no opening's fill closes another's.
  const groups: Array<typeof entries> = [];
  for (const e of entries) {
    const g = groups.find((gr) => gr.some((o) => o.gap.along === e.gap.along && o.gap.a0 < e.gap.a1 && e.gap.a0 < o.gap.a1 && o.gap.t0 < e.gap.t1 && e.gap.t0 < o.gap.t1));
    if (g) g.push(e); else groups.push([e]);
  }
  for (const gr0 of groups) {
    // one block drawn twice in the plan (same family, same place) is one opening: the one the elevation shaped is kept
    const twice: typeof gr0 = [];
    for (const e of [...gr0].sort((p, q) => (q.prof.kind !== "rect" ? 1 : 0) - (p.prof.kind !== "rect" ? 1 : 0))) {
      if (!twice.some((o) => o.tag === e.tag && Math.abs(o.prof.cA - e.prof.cA) < 5 && Math.abs(o.gap.t0 - e.gap.t0) < 10)) twice.push(e);
    }
    // a safe room's blast window (Tovna_Mamad_Window) stands inside the room's own glazed window in the same opening: the
    // facade shows the glazed window only
    const gr = twice.some((e) => !/Mamad_Window/i.test(e.tag)) ? twice.filter((e) => !/Mamad_Window/i.test(e.tag)) : twice;
    dupOpenings += gr0.length - gr.length;
    LtopStorey = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
    const along = gr[0]!.gap.along, out = gr[0]!.gap.out;
    // the gap's ends sit on the wall grid's cells, up to half a cell short of the hatch: run 3 cm into each jamb so no slit of
    // sky shows between the opening's fill and the wall
    const a0 = Math.min(...gr.map((e) => e.gap.a0)) - 3, a1 = Math.max(...gr.map((e) => e.gap.a1)) + 3;
    const t0 = Math.min(...gr.map((e) => e.gap.t0)), t1 = Math.max(...gr.map((e) => e.gap.t1));
    // An opening of the top storey that rises past the roof (the towers' 12.5 m windows) goes on into the roof plan's walls,
    // which that plan cuts above the window and so draws whole: the band over the roof is cut here, the roof wall split round it.
    // a roof room's door: its wall's own top round it
    if (k === 4) LtopStorey = Math.min(1975, Math.max(ROOF + 60, (along === "x" ? roofTopAt(a0, a1, t0, t1) : roofTopAt(t0, t1, a0, a1)) ?? 1770));
    // a door in a toilet cubicle's panel: the band stops at the panel's top (2.15), no lintel hanging to the ceiling
    const tm = (t0 + t1) / 2;
    const ends = along === "x" ? [[a0, tm], [a1, tm]] : [[tm, a0], [tm, a1]];
    const cubicle = k < 4 && gr.some((e) => e.door) && pl.partitions.some((qd) => isCubicle(k, qd) && qd.ring.some((q) => ends.some(([x, y]) => Math.hypot(q.x - x!, q.y - y!) < 20)));
    if (cubicle) { LtopStorey = L + 215; cubicleDoors++; }
    const bands: Array<[number, number]> = [[L, LtopStorey]];
    if (k === 3 && gr.some((e) => (e.prof.kind === "round" ? e.prof.cy + e.prof.r : e.prof.top) > ROOF + 5)) {
      const rt = Math.min(1975, Math.max(ROOF + 60, (along === "x" ? roofTopAt(a0, a1, t0, t1) : roofTopAt(t0, t1, a0, a1)) ?? 1770));
      bands.push([ROOF, rt]);
      roofSplits.push({ along, a0, a1, t0, t1 });
    }
    // an opening that rises past this storey's top (the stair tower's round window at 11.14..12.54 over the +12.24 floor) where
    // the storey over has none of its own: its upper part is cut into that storey's wall too, split round it
    const topOf = (e: Entry) => (e.prof.kind === "round" ? e.prof.cy + e.prof.r : e.prof.top);
    if (k < 3 && !cubicle && gr.some((e) => topOf(e) > LtopStorey + 5) && !(entriesBy[k + 1] ?? []).some((o) => o.gap.along === along && o.gap.a0 < a1 && a0 < o.gap.a1 && o.gap.t0 < t1 && t0 < o.gap.t1)) {
      const up = k + 1 < 3 ? LEVELS[k + 2]! : ROOF;
      bands.push([LtopStorey, Math.min(up, Math.max(...gr.map(topOf)) + 60)]);
      for (const tg of [`wall:${P[k + 1]!.name}`, `wall:partition:${P[k + 1]!.name}`, `wall:lining:${P[k + 1]!.name}`]) roofSplits.push({ along, a0, a1, t0: t0 - 6, t1: t1 + 6, tag: tg });
      carriedUp++;
    }
    // an opening that starts below this storey's floor (the tower's landing door at +6.12 in the +8.16 plan) where the storey
    // below has none of its own: its wall there is split away and built here, the band under the floor cut round the opening
    if (k >= 1 && k <= 3 && gr.some((e) => e.prof.bottom < L - 5) && !(entriesBy[k - 1] ?? []).some((o) => o.gap.along === along && o.gap.a0 < a1 && a0 < o.gap.a1 && o.gap.t0 < t1 && t0 < o.gap.t1)) {
      bands.unshift([LEVELS[k - 1]!, L]);
      roofSplits.push({ along, a0, a1, t0, t1, tag: `wall:${P[k - 1]!.name}` });
    }
    // a door hung in the inner leaf of a two-leaf wall (the side face's glazed exit, its frame 19 cm back): the outer leaf's gap in
    // front of it is a reveal up to the opening's head only — above it the outer leaf runs on, or the floor's slab edge shows there
    if (gr.some((e) => e.extWall) && !cubicle) {
      const tO = out === 1 ? t1 : t0, mid = (a0 + a1) / 2;
      const at = (a: number, t: number) => (along === "x" ? isWall(pl, a, t) : isWall(pl, t, a));
      let depth = 0;
      for (let d = 3; d <= 41; d += 2) { const t = tO + out * d; if (!at(mid, t) && at(a0 - 8, t) && at(a1 + 8, t)) depth = d + 2; else break; }
      const hTop = Math.max(...gr.map(topOf));
      if (depth >= 8 && hTop < LtopStorey - 10) {
        box(a0, a1, out === 1 ? tO : tO - depth, out === 1 ? tO + depth : tO, hTop, LtopStorey, along, "stone", gr[0]!.tag + ":reveal-head");
        revealHeads.push(`${pl.name} ${gr[0]!.tag.split(":").pop()} a${mid.toFixed(0)} ${depth} cm`);
      }
    }
    for (const [L, Ltop] of bands) {
    const extWall = gr.some((e) => e.extWall);
    const wallMat: BuildingMaterial = cubicle ? "worktop" : extWall || L >= ROOF ? "stone" : "plaster";
    const tOut = out === 1 ? t1 : t0, inward = -out;
    const glassT0 = Math.min(tOut + inward * 10, tOut + inward * 14), glassT1 = Math.max(tOut + inward * 10, tOut + inward * 14);
    const f0 = out === 1 ? t1 : t0 - 5, f1 = out === 1 ? t1 + 5 : t0;
    // The band round its openings as true outlines (sweep.mts): wall = band − openings; glass = each opening in the band;
    // surround = its ring between the opening and the outer arc, in front of the face.
    const Lb = SW.flat("L", L), Tb = SW.flat("T", Ltop);
    const ops = gr.map((e, j) => ({ e, o: SW.openingEdges(e.prof, `o${j}`), s: extWall ? SW.surroundEdges(e.prof, `o${j}`) : null }));
    const crits = [a0, a1];
    for (const { o, s: sr } of ops) { crits.push(o.u0, o.u1); if (sr) crits.push(sr.u0, sr.u1); }
    const cr = crits.filter((x) => x >= a0 - 0.01 && x <= a1 + 0.01);
    const curvedAt = (u: number) => ops.some(({ o, s: sr }) => (o.curved && u > o.u0 && u < o.u1) || (sr != null && u > sr.u0 && u < sr.u1));
    const holesAt = (u: number): SWPiece[] => ops.filter(({ o }) => u > o.u0 && u < o.u1).map(({ o }) => [o.lo, o.hi]);
    // a facade's band is stone through, its room side plastered (1.5 cm) where a storey's room is behind it
    const lined = wallMat === "stone" && L < ROOF;
    const [st0, st1, pt0, pt1] = !lined ? [t0, t1, 0, 0] : out === 1 ? [t0 + 1.5, t1, t0, t0 + 1.5] : [t0, t1 - 1.5, t1 - 1.5, t1];
    for (const poly of SW.sweep(cr, curvedAt, (u) => SW.minusE([[Lb, Tb]], holesAt(u), u))) {
      sidePrism(poly, along, st0, st1, wallMat, gr[0]!.tag);
      if (lined) sidePrism(poly, along, pt0, pt1, "plaster", gr[0]!.tag + ":lining");
    }
    for (const { e, o } of ops) {
      const crG = [o.u0, o.u1].map((x) => Math.min(a1, Math.max(a0, x)));
      for (const poly of SW.sweep(crG, () => o.curved, (u) => SW.intersectE([[Lb, Tb]], [o.lo, o.hi], u))) sidePrism(poly, along, glassT0, glassT1, e.glassMat, e.tag);
    }
    if (extWall) for (const { e, s: sr } of ops) {
      if (!sr) continue;
      const crS = [sr.u0, sr.u1, ...ops.flatMap(({ o }) => [o.u0, o.u1])].filter((x) => x >= sr.u0 && x <= sr.u1);
      for (const poly of SW.sweep(crS, () => true, (u) => SW.minusE(SW.intersectE([[Lb, Tb]], [sr.lo, sr.hi], u), holesAt(u), u))) sidePrism(poly, along, f0, f1, "jerusalemStone", e.tag + ":surround");
    }
    for (const e of gr) barCount += frameBars(e.prof, L, Ltop, glassT0, glassT1, along, e.tag);
    // a glazed door the elevation draws at the foot of a window's glass (the north tower's exit at +4.46 onto the canopy's roof,
    // under its 12.5 m window): the glass alone reads as more window — its leaf is framed in it: stiles, a head and a kick rail,
    // a pull outside and a push bar inside
    for (const e of gr) {
      if (!e.door || !e.shaped || e.glassMat !== "glass" || e.prof.kind !== "rect" || !gr.some((o) => !o.door)) continue;
      const { cA, w, bottom: yb, top: yt } = e.prof;
      if (yb < L - 1 || yb >= Ltop) continue;
      const da0 = cA - w / 2, da1 = cA + w / 2, tg = e.tag + ":leaf";
      // a door's leaf reads by its heavier frame than the window's 6 cm bars: 11 cm stiles, a 14 cm head, a 20 cm kick rail,
      // standing 3 cm proud of the glass on the outside, and a long bright pull
      const tOutF = out === 1 ? glassT1 + 2 : glassT0 - 2, tInF = out === 1 ? glassT0 - 2 : glassT1 + 2;
      const [fT0, fT1] = [Math.min(glassT0 - 2, tOutF + out * 3), Math.max(glassT1 + 2, tOutF + out * 3)];
      for (const a of [da0, da1 - 11]) box(a, a + 11, fT0, fT1, yb, yt, along, "darkSteel", tg);
      box(da0, da1, fT0, fT1, yt - 14, yt, along, "darkSteel", tg);
      box(da0, da1, fT0, fT1, yb, yb + 20, along, "darkSteel", tg);
      const tP = tOutF + out * 3;
      box(da1 - 24, da1 - 19, Math.min(tP, tP + out * 7), Math.max(tP, tP + out * 7), yb + 60, yb + 170, along, "metal", tg + ":pull");
      box(da0 + 9, da1 - 9, Math.min(tInF, tInF - out * 4), Math.max(tInF, tInF - out * 4), yb + 95, yb + 101, along, "metal", tg + ":panic-bar");
      report.windowDoors = [...((report.windowDoors as string[]) ?? []), `${pl.name} ${e.tag.split(":").pop()} a${cA.toFixed(0)} ${yb.toFixed(0)}..${yt.toFixed(0)}`];
    }
    for (const e of gr) {
      const hw = e.prof.kind === "rect" ? e.prof.w / 2 : e.prof.r;
      throughSlabs.push({ along, a0: e.prof.cA - hw, a1: e.prof.cA + hw, t0: t0 - 30, t1: t1 + 30, y0: e.prof.bottom, y1: e.prof.kind === "round" ? e.prof.cy + e.prof.r : e.prof.top });
    }
    }
  }
});
// the roof plan's walls split round the openings carried up into them (axis-aligned rectangles only — reported otherwise)
let roofSplit = 0;
const roofSplitMissed: string[] = [];
for (const sp of roofSplits) {
  const [ax0, ax1] = sp.along === "x" ? [sp.a0 / 100, sp.a1 / 100] : [-sp.a1 / 100, -sp.a0 / 100];
  const [tz0, tz1] = sp.along === "x" ? [-sp.t1 / 100, -sp.t0 / 100] : [sp.t0 / 100, sp.t1 / 100];
  for (let i = prims.length - 1; i >= 0; i--) {
    const pr = prims[i]!;
    if (pr.type !== "prism" || !(sp.tag ? pr.tag === sp.tag : pr.tag === "wall:M-roof" || pr.tag === "wall:roof-room") || pr.holes) continue;
    const xs = pr.ring.map(([x]) => x), zs = pr.ring.map(([, z]) => z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    // along "x": the opening runs in x, across z; along "y": runs in z, across x
    const [u0, u1, v0, v1] = sp.along === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const [cu0, cu1, cv0, cv1] = sp.along === "x" ? [ax0, ax1, tz0, tz1] : [ax0, ax1, tz0, tz1];
    if (!(u0 < cu1 && cu0 < u1 && v0 < cv1 - 0.02 && cv0 + 0.02 < v1)) continue;
    // its own bounding box: every corner on the box's edges (collinear points allowed)
    const rect = pr.ring.every(([x, z]) => Math.abs(x - x0) < 0.005 || Math.abs(x - x1) < 0.005 || Math.abs(z - z0) < 0.005 || Math.abs(z - z1) < 0.005);
    if (!rect) {
      // any other outline: clipped by half-planes into the pieces round the opening's rectangle (left, right, before, behind)
      const U = (q: [number, number]) => (sp.along === "x" ? q[0] : q[1]), V = (q: [number, number]) => (sp.along === "x" ? q[1] : q[0]);
      const clip = (rg: Array<[number, number]>, f: (q: [number, number]) => number): Array<[number, number]> => {
        // keep f ≤ 0
        const outR: Array<[number, number]> = [];
        for (let m2 = 0; m2 < rg.length; m2++) {
          const A = rg[m2]!, B = rg[(m2 + 1) % rg.length]!, fa = f(A), fb = f(B);
          if (fa <= 0) outR.push(A);
          if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); outR.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
        }
        return outR;
      };
      const area = (rg: Array<[number, number]>) => Math.abs(rg.reduce((s2, q, m2) => { const r2 = rg[(m2 + 1) % rg.length]!; return s2 + q[0] * r2[1] - r2[0] * q[1]; }, 0)) / 2;
      const rg0 = pr.ring as Array<[number, number]>;
      const mid = clip(clip(rg0, (q) => cu0 - U(q)), (q) => U(q) - cu1);
      const pieces2 = [clip(rg0, (q) => U(q) - cu0), clip(rg0, (q) => cu1 - U(q)), clip(mid, (q) => V(q) - cv0), clip(mid, (q) => cv1 - V(q))].filter((rg) => rg.length >= 3 && area(rg) > 1e-4);
      prims.splice(i, 1, ...pieces2.map((rg) => ({ ...pr, ring: rg })));
      roofSplit++;
      roofSplitMissed.push(`clipped ${x0.toFixed(2)},${z0.toFixed(2)} → ${pieces2.length}`);
      continue;
    }
    const parts: Array<[number, number]> = [[u0, Math.min(u1, cu0)], [Math.max(u0, cu1), u1]].filter(([a, b]) => b - a > 0.01) as Array<[number, number]>;
    const ring = ([a, b]: [number, number]): Array<[number, number]> => (sp.along === "x" ? [[a, z0], [b, z0], [b, z1], [a, z1]] : [[x0, a], [x1, a], [x1, b], [x0, b]]);
    prims.splice(i, 1, ...parts.map((uv) => ({ ...pr, ring: ring(uv) })));
    roofSplit++;
  }
}
report.roofSplit = { split: roofSplit, missed: roofSplitMissed };
report.doorSeen = doorSeen;
report.coveredWalls = coveredWalls;
report.sidePrisms = sidePrisms;
report.openings = { dupOpenings, roofSeenBelow, solidGaps, offWall, hingeGaps, revolving, liftDoors, carriedDown, carriedUp, carriedUpInto, cubicleDoors, frameGaps, filled, noGap, noGapList, matchedToElevation: matched, standardShape: unmatched };
report.revealHeads = revealHeads;

// ---------- slabs
const n = P[0]!.walls.nx * P[0]!.walls.ny;
// a cell a straight ray from the edge of the drawing reaches without meeting a wall or an opening's line is outside the
// building, even where the footprint's closing filled it (the recesses between pilasters)
const exposedIn = (pl: Plan) => {
  const g = pl.walls, e = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx && !pl.closed[j * g.nx + i]; i++) e[j * g.nx + i] = 1;
    for (let i = g.nx - 1; i >= 0 && !pl.closed[j * g.nx + i]; i--) e[j * g.nx + i] = 1;
  }
  for (let i = 0; i < g.nx; i++) {
    for (let j = 0; j < g.ny && !pl.closed[j * g.nx + i]; j++) e[j * g.nx + i] = 1;
    for (let j = g.ny - 1; j >= 0 && !pl.closed[j * g.nx + i]; j--) e[j * g.nx + i] = 1;
  }
  return e;
};
const EXPOSED = P.map(exposedIn);
// ---------- the stairs (stairs.mts reads them off the plans' riser numbers): treads, landings, and the floors opened over them
const stairOpen = new Map<number, Uint8Array>();
const pitBase = new Float32Array(P[0]!.walls.nx * P[0]!.walls.ny).fill(0); // the ground under a pit: its floor's underside
{
  const STR = await import("./stairs.mts");
  const { stairs, report: sr } = STR.readStairs(P.map((pl) => pl.pieces));
  const g = P[0]!.walls;
  const STOREYS = [0, ...LEVELS.slice(1), ROOF];
  const floorUnder = (y: number, base: number) => Math.max(base, ...STOREYS.filter((L) => L < y - 0.5));
  const openAt = (L: number) => { let m = stairOpen.get(L); if (!m) { m = new Uint8Array(n); stairOpen.set(L, m); } return m; };
  const cellsOfRect = (x0: number, x1: number, y0: number, y1: number, f: (c: number) => void) => {
    for (let X = x0 + G.CELL / 2; X < x1; X += G.CELL) for (let Y = y0 + G.CELL / 2; Y < y1; Y += G.CELL) { const c = cellOf(g, X, Y); if (c >= 0) f(c); }
  };
  let treadCount = 0, landingCount = 0, pitWalls = 0, railCount = 0;
  const landingsReport: string[] = [];
  for (const s of stairs) {
    const base = Math.min(...s.treads.map((t) => t.top)) - s.riser;
    const tags = new Int32Array(n).fill(-1); // the tread number on each cell
    for (const t of s.treads) {
      // a tread stands down to the step's soffit (a stepped waist, 40 cm), never through the floor it starts from
      const top = t.top, bot = Math.max(floorUnder(top, base), top - 40);
      box(t.x0, t.x1, t.y0, t.y1, bot, top, "x", "floorStone", `stair:${s.id}:tread:${t.n}`);
      treadCount++;
      cellsOfRect(t.x0, t.x1, t.y0, t.y1, (c) => { if (tags[c]! < 0 || t.n > tags[c]!) tags[c] = t.n; });
    }
    // the landings: where a flight turns (or, straight on, leaves a gap) between n and n + 1 — the rect from n's front edge on to
    // the wall (a turn) or to n + 1 (straight on), across n's width, both flights' when it turns back (a U: the well between)
    const byN = new Map(s.treads.map((t) => [t.n, t] as const));
    const depthOf = (t: (typeof s.treads)[number]) => (Math.abs(t.dirX) > 0.5 ? t.x1 - t.x0 : t.y1 - t.y0);
    const storeyOf = (y: number) => Math.min(P.length - 1, Math.max(0, STOREYS.filter((L) => L <= y + 0.5).length - 1));
    type R = { x0: number; x1: number; y0: number; y1: number; y: number };
    const lands: R[] = [];
    for (const a of s.treads) {
      const b = byN.get(a.n + 1); if (!b) continue;
      const dx = Math.abs(a.dirX) > 0.5 ? Math.sign(a.dirX) : 0, dy = dx ? 0 : Math.sign(a.dirY);
      const dot = a.dirX * b.dirX + a.dirY * b.dirY;
      const gap = dx > 0 ? b.x0 - a.x1 : dx < 0 ? a.x0 - b.x1 : dy > 0 ? b.y0 - a.y1 : a.y0 - b.y1;
      if (dot > 0.5 && gap < 1.5 * depthOf(a)) continue;
      const across = dot < -0.5 ? (dx ? [Math.min(a.y0, b.y0), Math.max(a.y1, b.y1)] : [Math.min(a.x0, b.x0), Math.max(a.x1, b.x1)]) : dx ? [a.y0, a.y1] : [a.x0, a.x1];
      // how far the landing runs: straight on, to n + 1; turned back (a U), as deep as the flight is wide, never past a wall; a
      // quarter turn, to n + 1's far side. n + 1 must start at the landing (a number in the wrong place makes none)
      const front = dx > 0 ? a.x1 : dx < 0 ? a.x0 : dy > 0 ? a.y1 : a.y0, sg = dx || dy;
      const bFar = dx > 0 ? b.x1 : dx < 0 ? b.x0 : dy > 0 ? b.y1 : b.y0, bNear = dx > 0 ? b.x0 : dx < 0 ? b.x1 : dy > 0 ? b.y0 : b.y1;
      const widthA = across[1]! - across[0]!, widthOwn = dx ? a.y1 - a.y0 : a.x1 - a.x0;
      let len = 0;
      if (dot > 0.5) len = gap;
      else if (dot < -0.5) {
        if (Math.abs(bFar - front) > 40) continue;
        const wg = P[storeyOf(a.top)]!.walls, wu = P[Math.min(P.length - 1, storeyOf(a.top) + 1)]!.walls;
        const cap = Math.min(320, 1.15 * widthOwn);
        for (let d = G.CELL; d <= cap; d += G.CELL) {
          let hit = 0, all = 0;
          for (let u = across[0]! + G.CELL / 2; u < across[1]!; u += G.CELL) {
            const X = dx > 0 ? a.x1 + d - G.CELL / 2 : dx < 0 ? a.x0 - d + G.CELL / 2 : u, Y = dy > 0 ? a.y1 + d - G.CELL / 2 : dy < 0 ? a.y0 - d + G.CELL / 2 : u;
            const c = cellOf(wg, X, Y); all++; if (c < 0 || wg.a[c] || wu.a[c]) hit++;
          }
          if (hit > all * 0.3) break;
          len = d;
        }
      } else {
        len = (bFar - front) * sg;
        if ((bNear - front) * sg < -30 || len > 320) continue;
      }
      void widthA;
      if (len < 20) continue;
      const r: R = dx > 0 ? { x0: a.x1, x1: a.x1 + len, y0: across[0]!, y1: across[1]!, y: a.top } : dx < 0 ? { x0: a.x0 - len, x1: a.x0, y0: across[0]!, y1: across[1]!, y: a.top }
        : dy > 0 ? { x0: across[0]!, x1: across[1]!, y0: a.y1, y1: a.y1 + len, y: a.top } : { x0: across[0]!, x1: across[1]!, y0: a.y0 - len, y1: a.y0, y: a.top };
      lands.push(r);
      const atStorey = STOREYS.some((L) => Math.abs(L - a.top) < 1);
      if (!atStorey) {
        box(r.x0, r.x1, r.y0, r.y1, a.top - 20, a.top - 1, "x", "slab", `stair:${s.id}:landing`);
        box(r.x0, r.x1, r.y0, r.y1, a.top - 1, a.top, "x", "floorStone", `stair:${s.id}:landing`);
        landingCount++; landingsReport.push(`${s.id}@${a.n}:${a.top}`);
      }
    }
    // the floor at L: open over the storey under it's flights and half landings (their bbox: the well too), but for L's own landing
    for (const L of STOREYS) {
      if (L <= 0) continue;
      const parts: R[] = [...s.treads.filter((t) => t.top > L - 408 + 0.5 && t.top < L - 0.5).map((t) => ({ ...t, y: t.top })), ...lands.filter((r) => r.y > L - 408 + 0.5 && r.y < L - 0.5)];
      if (!parts.length) continue;
      const keep = new Uint8Array(n);
      for (const t of s.treads) if (Math.abs(t.top - L) < 1) cellsOfRect(t.x0, t.x1, t.y0, t.y1, (c) => (keep[c] = 1));
      for (const r of lands) if (Math.abs(r.y - L) < 1) cellsOfRect(r.x0, r.x1, r.y0, r.y1, (c) => (keep[c] = 1));
      // open where the step or landing under it has less than a man's headroom (2.10 under the slab's 30 cm), then the
      // stair's well and landings between those cells; the floor over a flight's low steps stays (the plans close it there)
      const wg = P[storeyOf(L)]!.walls, o = openAt(L);
      const under = new Float32Array(n).fill(-1e9);
      for (const r of parts) cellsOfRect(r.x0, r.x1, r.y0, r.y1, (c) => { if (r.y > under[c]!) under[c] = r.y; });
      let ox0 = 1e9, ox1 = -1e9, oy0 = 1e9, oy1 = -1e9;
      for (const r of parts) if (r.y > L - 240) { ox0 = Math.min(ox0, r.x0); ox1 = Math.max(ox1, r.x1); oy0 = Math.min(oy0, r.y0); oy1 = Math.max(oy1, r.y1); }
      if (ox1 > ox0) cellsOfRect(ox0, ox1, oy0, oy1, (c) => { if (!keep[c] && !wg.a[c] && (under[c]! < -1e8 || under[c]! > L - 240)) o[c] = 1; });
    }
    const near = G.distance({ ...g, a: tags.map((v) => (v >= 0 ? 0 : 1)) as unknown as Uint8Array }, (v) => v === 0);
    // the rails (A-FLOR-HRAL, on each storey's plan): each line follows the walk beside it, 90 cm over the step or landing it
    // runs along — a glass panel under a metal handrail, as the gallery's; the plan of storey L draws the flights from L up
    {
      const sb = { x0: Math.min(...s.treads.map((t) => t.x0), ...lands.map((r) => r.x0)) - 60, x1: Math.max(...s.treads.map((t) => t.x1), ...lands.map((r) => r.x1)) + 60, y0: Math.min(...s.treads.map((t) => t.y0), ...lands.map((r) => r.y0)) - 60, y1: Math.max(...s.treads.map((t) => t.y1), ...lands.map((r) => r.y1)) + 60 };
      type W = R & { t?: (typeof s.treads)[number] };
      const walks: W[] = [...s.treads.map((t) => ({ x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, y: t.top, t })), ...lands];
      const done: Array<{ along: "x" | "y"; t: number; u0: number; u1: number; L: number }> = [];
      for (let k = 0; k < P.length; k++) {
        const L = STOREYS[k]!;
        const band = walks.filter((r) => r.y >= L - 0.5 && r.y < L + 408 - 0.5 && r.y >= base);
        if (!band.length) continue;
        const walkAt = (x: number, y: number) => {
          const ds = band.map((r) => ({ r, d: Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1)) }));
          const m = Math.min(...ds.map((q) => q.d));
          if (m > 30) return null;
          const w = ds.filter((q) => q.d <= m + 3).sort((p1, p2) => p1.r.y - p2.r.y)[0]!.r as W;
          // over a flight the rail runs on the nosings' line: the tread's back edge at its top, rising a riser to its front
          if (!w.t) return w.y;
          const t2 = w.t, ax = Math.abs(t2.dirX) > 0.5;
          const sgn = ax ? Math.sign(t2.dirX) : Math.sign(t2.dirY);
          const lo = ax ? t2.x0 : t2.y0, hi = ax ? t2.x1 : t2.y1, v = ax ? x : y;
          const f = Math.min(1, Math.max(0, sgn > 0 ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)));
          return w.y + f * s.riser;
        };
        for (const pc of P[k]!.pieces) {
          if (!pc.pts || !/A-FLOR-HRAL/.test(pc.layer)) continue;
          for (let j = 0; j + 1 < pc.pts.length; j++) {
            const a = pc.pts[j]!, b = pc.pts[j + 1]!;
            if (Math.min(a.x, b.x) < sb.x0 || Math.max(a.x, b.x) > sb.x1 || Math.min(a.y, b.y) < sb.y0 || Math.max(a.y, b.y) > sb.y1) continue;
            const along: "x" | "y" | null = Math.abs(a.y - b.y) < 1 ? "x" : Math.abs(a.x - b.x) < 1 ? "y" : null;
            if (!along) continue;
            const t = along === "x" ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
            const u0 = Math.min(along === "x" ? a.x : a.y, along === "x" ? b.x : b.y), u1 = Math.max(along === "x" ? a.x : a.y, along === "x" ? b.x : b.y);
            if (u1 - u0 < 20) continue;
            // a rail runs with its flight: a line across one (a tread's edge, a baluster's mark) is none
            {
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              const near1 = s.treads.filter((q) => q.top >= L - 0.5 && q.top < L + 407.5).map((q) => ({ q, d: Math.hypot(Math.max(q.x0 - mx, 0, mx - q.x1), Math.max(q.y0 - my, 0, my - q.y1)) })).sort((p1, p2) => p1.d - p2.d)[0];
              const nearL = lands.filter((r) => r.y >= L - 0.5 && r.y < L + 407.5).map((r) => Math.hypot(Math.max(r.x0 - mx, 0, mx - r.x1), Math.max(r.y0 - my, 0, my - r.y1))).sort((p1, p2) => p1 - p2)[0] ?? 1e9;
              if (near1 && near1.d <= nearL && (Math.abs(near1.q.dirX) > 0.5 ? "x" : "y") !== along) continue;
            }
            // a rail's two faces, and the same rail on the plan of the storey over: one
            if (done.some((d) => d.along === along && d.L === L && Math.abs(d.t - t) < 8 && Math.min(d.u1, u1) - Math.max(d.u0, u0) > 0.8 * (u1 - u0))) continue;
            done.push({ along, t, u0, u1, L });
            // the walk's height along it, sampled every 14 cm; a run breaks where no step or landing is beside it
            const runs: Array<Array<[number, number]>> = [];
            let cur: Array<[number, number]> = [];
            for (let u = u0; u <= u1 + 0.1; u += Math.min(14, Math.max(1, u1 - u))) {
              const h = along === "x" ? walkAt(u, t) : walkAt(t, u);
              // a run also breaks where the walk beside it jumps (a landing of the storey over, a flight across the well)
              const prev = cur[cur.length - 1];
              if (h == null || (prev && Math.abs(h - prev[1]) > 45)) { if (cur.length > 1) runs.push(cur); cur = h == null ? [] : [[u, h]]; } else cur.push([u, h]);
              if (u >= u1) break;
            }
            if (cur.length > 1) runs.push(cur);
            for (const run of runs) {
              const top = run.map(([u, h]) => [u, h + 90] as [number, number]);
              const rail: Array<[number, number]> = [...top, ...top.slice().reverse().map(([u, y]) => [u, y - 5] as [number, number])];
              // the plan names each rail's family: "Handrail_Internal" (the wall's "מאחז יד עפ״י תקן") is a handrail on brackets
              // only; "Railing – רוחב מדרגות …" (the well's "מעקה קל" with its "מאחז יד") a light metal railing: top rail,
              // bottom rail, upright bars 12 cm apart (under 10 cm clear)
              const handrailOnly = /Handrail/i.test(pc.path.join(">"));
              sidePrism(rail, along, t - 2.5, t + 2.5, "metal", `stair:${s.id}:${handrailOnly ? "handrail" : "rail"}`);
              if (handrailOnly) {
                for (let q = 0; q < run.length; q += 6) { const [u, h] = run[q]!; box(u - 1, u + 1, t - 1, t + 1, h + 78, h + 85, along, "metal", `stair:${s.id}:handrail:bracket`); }
              } else {
                const bottom: Array<[number, number]> = [...run.map(([u, h]) => [u, h + 12] as [number, number]), ...run.slice().reverse().map(([u, h]) => [u, h + 9] as [number, number])];
                sidePrism(bottom, along, t - 1.5, t + 1.5, "metal", `stair:${s.id}:rail:bottom`);
                const uA = run[0]![0], uB = run[run.length - 1]![0];
                const hAt = (u: number) => { for (let q = 0; q + 1 < run.length; q++) { const [u0, h0] = run[q]!, [u1, h1] = run[q + 1]!; if (u >= u0 && u <= u1) return h0 + ((h1 - h0) * (u - u0)) / (u1 - u0 || 1); } return run[run.length - 1]![1]; };
                for (let u = uA + 6; u < uB - 2; u += 12) { const h = hAt(u); box(u - 0.8, u + 0.8, t - 0.8, t + 0.8, h + 12, h + 85, along, "metal", `stair:${s.id}:rail:bar`); }
              }
              railCount++;
            }
          }
        }
      }
    }
    // a pit (the mikveh): the ground floor opened over it, its floor at the pit's bottom, its sides tiled down to it
    if (s.descending) {
      const o = openAt(0);
      const pit = new Uint8Array(n);
      for (let c = 0; c < n; c++) if (tags[c]! >= 0) pit[c] = 1;
      // the pool round its steps: what the ground plan's walls close round them
      const bar = P[0]!.walls.a;
      const q: number[] = []; for (let c = 0; c < n; c++) if (pit[c]) q.push(c);
      while (q.length) {
        const c = q.pop()!, i = c % g.nx, j = (c - i) / g.nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
          const cc = jj * g.nx + ii;
          if (!pit[cc] && !bar[cc] && P[0]!.fp[cc] && near[cc]! * G.CELL <= 60) { pit[cc] = 1; q.push(cc); }
        }
      }
      for (let c = 0; c < n; c++) if (pit[c]) o[c] = 1;
      for (let c = 0; c < n; c++) if (pit[c]) pitBase[c] = Math.min(pitBase[c]!, base - 20);
      const floor = pit.map((v, c) => (v && tags[c]! < 0 ? 1 : 0));
      for (const r of G.rects(g, floor)) box(r.x0, r.x1, r.y0, r.y1, base - 20, base, "x", "ceramic", `stair:${s.id}:pit-floor`);
      // its sides: the ring of cells round the pit, from the pit's floor up to ±0
      const ring = new Uint8Array(n);
      for (let c = 0; c < n; c++) {
        if (pit[c]) continue;
        const i = c % g.nx, j = (c - i) / g.nx;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const ii = i + di!, jj = j + dj!; return ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny && pit[jj * g.nx + ii]; })) ring[c] = 1;
      }
      for (const r of G.rects(g, ring)) { box(r.x0, r.x1, r.y0, r.y1, base - 20, 0, "x", "ceramic", `stair:${s.id}:pit-side`); pitWalls++; }
    }
  }
  report.stairOpenRects = Object.fromEntries([...stairOpen.entries()].map(([L, m]) => [L, G.rects(g, m).map((r) => [r.x0, r.x1, r.y0, r.y1].map(Math.round))]));
  report.stairs = { ...sr, treads: treadCount, landings: landingCount, rails: railCount, landingLevels: landingsReport, pitWalls, opened: [...stairOpen.entries()].map(([L, m]) => `${L}: ${m.reduce((a, v) => a + v, 0)}`) };
}
const slab = (mask00: Uint8Array, y: number, t: number, material: BuildingMaterial, tag: string, inset = 25, between: number[] = [], open?: Uint8Array) => {
  // a slab is the floor of the storey over it: where that storey's walls leave it outside, it is a sliver past the building
  const mask0 = between.length ? mask00.map((v, k) => (v && !EXPOSED[between[between.length - 1]!]![k] ? 1 : 0)) : mask00.slice();
  // the stairs' openings: a floor at a storey's level (its slab, its finish a centimetre over) is open over a flight
  for (const [L, o] of stairOpen) if (Math.abs(y - L) <= 20) for (let c = 0; c < mask0.length; c++) if (o[c]) mask0[c] = 0;
  const gw = P[0]!.walls;
  for (const o of throughSlabs) {
    if (!(o.y0 < y - t && o.y1 > y)) continue;
    const [X0, X1, Y0, Y1] = o.along === "x" ? [o.a0, o.a1, o.t0, o.t1] : [o.t0, o.t1, o.a0, o.a1];
    for (let X = X0; X <= X1; X += G.CELL) for (let Y = Y0; Y <= Y1; Y += G.CELL) { const c = cellOf(gw, X, Y); if (c >= 0) mask0[c] = 0; }
  }
  // an edge over an open void (the gallery's front) runs to the void: no inset there
  const near = G.distance({ ...P[0]!.walls, a: open ? mask0.map((v, k) => (v || open[k] ? 1 : 0)) : mask0 }, (v) => v === 0);
  const mask = mask0.map((v, k) => (v && near[k]! * G.CELL > inset ? 1 : 0));
  for (const r of G.rects(P[0]!.walls, mask)) {
    const [x0, z1] = M(r.x0, r.y0), [x1, z0] = M(r.x1, r.y1);
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y - t / 2) / 100, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: t / 100, z: z1 - z0 }, material, tag });
  }
};
const or = (...ms: Uint8Array[]) => { const o = new Uint8Array(n); for (const m of ms) for (let k = 0; k < n; k++) if (m[k]) o[k] = 1; return o; };
// the void over the beit midrash: the region round "חלל" on the women's floor, bounded by walls, the gallery's glass and rails
/** The mask less its connected patches under `m2` that touch no wall of the gallery's plan. */
function dropIslands(mask: Uint8Array, m2: number): Uint8Array {
  const g = P[0]!.walls, out = mask.slice(), seen = new Uint8Array(mask.length);
  let dropped = 0;
  for (let k0 = 0; k0 < mask.length; k0++) {
    if (!mask[k0] || seen[k0]) continue;
    const comp: number[] = [k0]; seen[k0] = 1;
    let wall = false, byVoid = false;
    for (let q = 0; q < comp.length; q++) {
      const k = comp[q]!, i = k % g.nx, j = (k - i) / g.nx;
      if (P[3]!.walls.a[k]) wall = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii;
        if (voidMask[kk]) byVoid = true;
        if (mask[kk] && !seen[kk]) { seen[kk] = 1; comp.push(kk); }
      }
    }
    // or a patch under 3 m² the void's edge cut off (a window's lines closed it against the hall's wall)
    const m2c = (comp.length * G.CELL * G.CELL) / 1e4;
    if ((!wall && m2c < m2) || (byVoid && m2c < 3)) { for (const k of comp) out[k] = 0; dropped++; }
  }
  report.slabIslandsDropped = dropped;
  return out;
}
const voidMask = new Uint8Array(n);
{
  const pl = P[3]!;
  const t = pl.pieces.find((p) => p.text && /חלל/.test(p.text));
  const g = pl.walls;
  const gb: G.Grid = { ...g, a: g.a.slice() };
  for (const i of pl.insts) for (const p of i.pieces) if (p.pts && !/A-ANNO/.test(p.layer)) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(gb, p.pts[j]!, p.pts[j + 1]!, 2);
  for (const p of pl.pieces) if (p.pts && /HRAL|RAIL|GLAZ|A_WALL_PRTN/.test(p.layer)) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(gb, p.pts[j]!, p.pts[j + 1]!, 2);
  const bar = gb.a;
  // the plan draws the void's sides it does not share with a wall (A-DETL-GENF: the gallery's front, long straight lines with
  // the diagonals of its shading): the void is what walls and partitions close round "חלל", cut at those lines — the flood
  // below is the fallback (pews and the shading's lines stop it short)
  let edges: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (t?.at) {
    const segs = pl.pieces.filter((p) => p.pts && /A-DETL-GENF/.test(p.layer)).flatMap((p) => p.pts!.slice(1).map((q, j) => [p.pts![j]!, q] as const));
    const vert = segs.filter(([a, b]) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 500 && Math.min(a.y, b.y) < t.at!.y && Math.max(a.y, b.y) > t.at!.y).map(([a]) => a.x);
    const hor = segs.filter(([a, b]) => Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 500 && Math.min(a.x, b.x) < t.at!.x && Math.max(a.x, b.x) > t.at!.x).map(([a]) => a.y);
    const L = vert.filter((x) => x < t.at!.x), R = vert.filter((x) => x > t.at!.x), D = hor.filter((y) => y < t.at!.y), U = hor.filter((y) => y > t.at!.y);
    if (vert.length || hor.length) edges = { x0: L.length ? Math.max(...L) : -1e9, x1: R.length ? Math.min(...R) : 1e9, y0: D.length ? Math.max(...D) : -1e9, y1: U.length ? Math.min(...U) : 1e9 };
  }
  if (edges && t?.at) {
    const wb: G.Grid = { ...g, a: g.a.slice() };
    for (const p of pl.pieces) if (p.pts && /A_WALL_PRTN|GLAZ|RAIL|HRAL/.test(p.layer)) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(wb, p.pts[j]!, p.pts[j + 1]!, 2);
    for (const i of pl.insts) if (isOpening(i.family)) for (const p of i.pieces) if (p.pts) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(wb, p.pts[j]!, p.pts[j + 1]!, 2);
    const inE = (k: number) => { const i = k % g.nx, j = (k - i) / g.nx, x = g.x0 + (i + 0.5) * G.CELL, y = g.y0 + (j + 0.5) * G.CELL; return x > edges!.x0 && x < edges!.x1 && y > edges!.y0 && y < edges!.y1; };
    const k0 = cellOf(g, t.at.x, t.at.y), q: number[] = [];
    if (k0 >= 0) { voidMask[k0] = 1; q.push(k0); }
    while (q.length) {
      const k = q.pop()!; const i = k % g.nx, j = (k - i) / g.nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii;
        if (!voidMask[kk] && !wb.a[kk] && pl.fp[kk] && inE(kk)) { voidMask[kk] = 1; q.push(kk); }
      }
    }
    // the recesses in the hall's walls (the window bays): the window blocks' own lines closed them off the void, so the gallery's
    // slab was laid in them and stood out of the plaster as white stubs at +12.24 — a second fill from the void that only walls,
    // partitions, glazing and rails stop takes them in (still inside the gallery front's edges)
    const wr: G.Grid = { ...g, a: g.a.slice() };
    for (const p of pl.pieces) if (p.pts && /A_WALL_PRTN|GLAZ|RAIL|HRAL/.test(p.layer)) for (let j = 0; j + 1 < p.pts.length; j++) G.drawLine(wr, p.pts[j]!, p.pts[j + 1]!, 2);
    // a bay is no deeper than a wall: the fill goes 60 cm at most (a door's gap would lead it into the rooms beyond)
    let front: number[] = [];
    for (let k = 0; k < n; k++) if (voidMask[k]) front.push(k);
    let bays = 0;
    for (let step = 0; step < Math.ceil(60 / G.CELL) && front.length; step++) {
      const next: number[] = [];
      for (const k of front) {
        const i = k % g.nx, j = (k - i) / g.nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
          const kk = jj * g.nx + ii;
          if (!voidMask[kk] && !wr.a[kk] && pl.fp[kk] && inE(kk)) { voidMask[kk] = 2; next.push(kk); }
        }
      }
      front = next;
    }
    // only what lies in a closed bay is kept: a pocket of the fill that reaches a cell the first fill left as floor (across a
    // door's gap, or past the gallery front's line onto the gallery) is given back
    {
      const seen2 = new Uint8Array(n);
      for (let k0 = 0; k0 < n; k0++) {
        if (voidMask[k0] !== 2 || seen2[k0]) continue;
        const comp = [k0]; seen2[k0] = 1; let open = false;
        for (let q = 0; q < comp.length; q++) {
          const k = comp[q]!, i = k % g.nx, j = (k - i) / g.nx;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
            const kk = jj * g.nx + ii;
            if (voidMask[kk] === 2) { if (!seen2[kk]) { seen2[kk] = 1; comp.push(kk); } }
            else if (!voidMask[kk] && !wr.a[kk] && pl.fp[kk]) open = true;
          }
        }
        for (const k of comp) { if (open) voidMask[k] = 0; else { voidMask[k] = 1; bays++; } }
      }
    }
    report.voidEdges = edges;
    report.voidBayCells = bays;
  } else if (t?.at) {
    const k0 = cellOf(g, t.at.x, t.at.y);
    const q: number[] = [];
    if (k0 >= 0 && !bar[k0]) { voidMask[k0] = 1; q.push(k0); }
    while (q.length) {
      const k = q.pop()!; const i = k % g.nx, j = (k - i) / g.nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii;
        if (!voidMask[kk] && !bar[kk] && pl.fp[kk]) { voidMask[kk] = 1; q.push(kk); }
      }
    }
  }
  let a = 0, f = 0;
  for (let k = 0; k < n; k++) { a += voidMask[k]!; f += pl.fp[k]!; }
  report.void = { text: t?.text, m2: (a * G.CELL * G.CELL) / 1e4, ofFloorM2: (f * G.CELL * G.CELL) / 1e4 };
  if (a > 0.7 * f) voidMask.fill(0);
}
slab(P[0]!.fp, 0, 15, "floorStone", "slab:0", 0);
// the lower block's roof: ground floor under no storey, closed by its walls, roofed at their top (the sections cut it at +3.94)
{
  const g = P[0]!.walls, nn = g.nx * g.ny, lowRoof = new Uint8Array(nn);
  const tops: number[] = [];
  const { court: yard, courtRoofed: canopy } = courtOf();
  const open0 = yard.map((v, c) => (v && !canopy[c] ? 1 : 0));
  report.court = { m2: (yard.reduce((a, v) => a + v, 0) * G.CELL * G.CELL) / 1e4, openSkyM2: (open0.reduce((a, v) => a + v, 0) * G.CELL * G.CELL) / 1e4 };
  for (let c = 0; c < nn; c++) if (P[0]!.fp[c] && !P[1]!.fp[c] && !EXPOSED[0]![c] && !open0[c]) {
    lowRoof[c] = 1;
    if (g.a[c] && groundWallTop[c]! > 250 && groundWallTop[c]! < 600) tops.push(groundWallTop[c]!);
  }
  tops.sort((a, b) => a - b);
  // the ground plan's footprint and floor 1's differ by a few cm along shared faces: those slivers are no roof, they stuck out of
  // the side face at +3.64 as pale chips of slab. An opening (erode, then grow back) drops every strip or wedge under 70 cm wide.
  {
    const r = Math.max(1, Math.round(35 / G.CELL)), er = new Uint8Array(nn);
    const all = (src: Uint8Array, i: number, j: number) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny || !src[jj * g.nx + ii]) return false; } return true; };
    for (let c = 0; c < nn; c++) if (lowRoof[c]) { const i = c % g.nx; if (all(lowRoof, i, (c - i) / g.nx)) er[c] = 1; }
    let dropped = 0;
    for (let c = 0; c < nn; c++) {
      if (!lowRoof[c]) continue;
      const i = c % g.nx, j = (c - i) / g.nx;
      let keep = false;
      for (let dj = -r; dj <= r && !keep; dj++) for (let di = -r; di <= r; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny && er[jj * g.nx + ii]) { keep = true; break; } }
      if (!keep) { lowRoof[c] = 0; dropped++; }
    }
    report.lowerBlockSliversM2 = (dropped * G.CELL * G.CELL) / 1e4;
    // what the opening leaves of a strip's widened end is still no roof: a patch under 2 m² stood out of the faces as a stone chip
    const seen = new Uint8Array(nn); let chips = 0;
    for (let c0 = 0; c0 < nn; c0++) {
      if (!lowRoof[c0] || seen[c0]) continue;
      const comp: number[] = [c0]; seen[c0] = 1;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q]!, i = c % g.nx, j = (c - i) / g.nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue; const k = jj * g.nx + ii; if (lowRoof[k] && !seen[k]) { seen[k] = 1; comp.push(k); } }
      }
      if ((comp.length * G.CELL * G.CELL) / 1e4 < 2) { for (const c of comp) lowRoof[c] = 0; chips += comp.length; }
    }
    report.lowerBlockChipsM2 = (chips * G.CELL * G.CELL) / 1e4;
  }
  const lt = tops[Math.floor(tops.length / 2)];
  if (lt != null) {
    slab(lowRoof, lt - 14, 30, "slab", "slab:lower-block", 25);
    // its top is the shtiblach's terrace (floor 1 opens onto it): paved up to the storey's floor
    slab(lowRoof, lt, 14, "floorStone", "slab:lower-block:terrace", 25);
  }
  report.lowerBlockRoof = { cm: lt ?? null, m2: (lowRoof.reduce((a, v) => a + v, 0) * G.CELL * G.CELL) / 1e4 };
}
slab(P[1]!.fp, 408, 30, "slab", "slab:1", 25, [0, 1]);
slab(or(P[2]!.fp, P[1]!.fp), 816, 30, "slab", "slab:2", 25, [1, 2]);
// the void's own islands: a block the gallery's plan draws in the void (the bimah below, seen) closed a patch the fill did not
// reach — a patch of floor with no wall to stand on, under 6 m², is void too
const gallery = dropIslands(or(P[3]!.fp, P[2]!.fp).map((v, k) => (v && !voidMask[k] ? 1 : 0)), 6);
// a cell's sliver between a hall wall and the void (the grid's 5 cm past the wall's face) stood 3 cm out of the plaster
{
  const g = P[3]!.walls; let slivers = 0;
  const nb = (k: number, f: (kk: number) => boolean) => { const i = k % g.nx, j = (k - i) / g.nx; return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) => { const ii = i + di, jj = j + dj; return ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny && f(jj * g.nx + ii); }); };
  const drop: number[] = [];
  for (let k = 0; k < n; k++) if (gallery[k] && !g.a[k] && nb(k, (kk) => !!voidMask[kk]) && nb(k, (kk) => !!g.a[kk])) drop.push(k);
  for (const k of drop) { gallery[k] = 0; slivers++; }
  report.gallerySlivers = slivers;
}
slab(gallery, 1224, 30, "slab", "slab:3", 25, [2, 3], voidMask);
slab(or(P[3]!.fp, P[4]!.fp), ROOF, 30, "slab", "slab:roof", 25, [3, 4]);
// each storey's floor finish: stone tiles a centimetre over its slab (the slab's concrete is only its edge and underside)
slab(P[1]!.fp, 409, 1, "floorStone", "floor:1", 30, [0, 1]);
slab(or(P[2]!.fp, P[1]!.fp), 817, 1, "floorStone", "floor:2", 30, [1, 2]);
slab(gallery, 1225, 1, "floorStone", "floor:3", 30, [2, 3], voidMask);
// the gallery's front over the void (the mechitza): the plan draws a parapet seen below the cut (A_SEEN_LT, a pair of lines a
// wall's thickness apart) and over it the Tripple windows' panes as staggered pairs of A_OPEN lines. Each pane: glass from its
// sill (the "UK" tag beside it) as tall as its window type, a metal frame round it, the parapet under it.
const fronts: Array<{ along: "x" | "y"; line: number; a0: number; a1: number }> = [];
{
  const pl = P[3]!, g = P[0]!.walls;
  const nearVoid = (x: number, y: number, cm: number) => {
    for (let dx = -cm; dx <= cm; dx += G.CELL) for (let dy = -cm; dy <= cm; dy += G.CELL) { const c = cellOf(g, x + dx, y + dy); if (c >= 0 && voidMask[c]) return true; }
    return false;
  };
  type S = { along: "x" | "y"; line: number; a0: number; a1: number };
  let outerPanes = 0;
  const axisSegs = (re: RegExp, minLen: number): S[] => pl.pieces.filter((p) => p.pts && re.test(p.layer)).flatMap((p) => p.pts!.slice(1).map((b, j) => {
    const a = p.pts![j]!;
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= minLen) return { along: "x" as const, line: a.y, a0: Math.min(a.x, b.x), a1: Math.max(a.x, b.x) };
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= minLen) return { along: "y" as const, line: a.x, a0: Math.min(a.y, b.y), a1: Math.max(a.y, b.y) };
    return null;
  }).filter((v): v is S => v != null));
  const pairs = (ss: S[], dMin: number, dMax: number) => {
    const out: S[] = [];
    ss.forEach((s, i) => ss.forEach((q, j) => {
      if (j <= i || q.along !== s.along) return;
      const d = Math.abs(q.line - s.line), a0 = Math.max(s.a0, q.a0), a1 = Math.min(s.a1, q.a1);
      if (d < dMin || d > dMax || a1 - a0 < 0.8 * Math.min(s.a1 - s.a0, q.a1 - q.a0)) return;
      const mid = (s.line + q.line) / 2, am = (a0 + a1) / 2;
      if (!(s.along === "x" ? nearVoid(am, mid, 60) : nearVoid(mid, am, 60))) return;
      // an outer wall's window (its glass lines are A_OPEN too, and the hall's void runs to the north face): no floor on one side
      const side = (d: number) => (s.along === "x" ? inFp(pl, am, mid + d) : inFp(pl, mid + d, am));
      if (!side(45) || !side(-45)) { outerPanes++; return; }
      out.push({ along: s.along, line: mid, a0, a1 });
    }));
    return out;
  };
  const ukAt = (x: number, y: number) => {
    let best: { d: number; v: number } | null = null;
    for (const p of pl.pieces) {
      const m = p.text?.match(/UK\s*=\s*(\d+)/); if (!m || !p.at) continue;
      const d = Math.hypot(p.at.x - x, p.at.y - y); if (d < 400 && (!best || d < best.d)) best = { d, v: +m[1]! };
    }
    return best?.v ?? 105;
  };
  const triple = pl.insts.filter((i) => /Tripple/i.test(i.family));
  const panes = pairs(axisSegs(/^A_OPEN$/, 50), 3, 7);
  const L = pl.level, top = ROOF - 3;
  for (const pn of panes) {
    const am = (pn.a0 + pn.a1) / 2, [x, y] = pn.along === "x" ? [am, pn.line] : [pn.line, am];
    const near = triple.map((i) => ({ i, d: Math.hypot((i.box.x0 + i.box.x1) / 2 - x, (i.box.y0 + i.box.y1) / 2 - y) })).sort((a, b) => a.d - b.d)[0];
    const h = (near && near.d < 300 ? famWH(near.i.family)?.[1] : undefined) ?? 300;
    const sill = L + ukAt(x, y), head = Math.min(top, sill + h);
    box(pn.a0, pn.a1, pn.line - 0.8, pn.line + 0.8, sill, head, pn.along, "glassTint", "gallery:front:glass");
    for (const [y0, y1] of [[sill, sill + 4], [head - 4, head]] as const) box(pn.a0, pn.a1, pn.line - 2.5, pn.line + 2.5, y0, y1, pn.along, "darkSteel", "gallery:front:frame");
    for (const a of [pn.a0, pn.a1 - 4]) box(a, a + 4, pn.line - 2.5, pn.line + 2.5, sill, head, pn.along, "darkSteel", "gallery:front:frame");
    box(pn.a0 - 1, pn.a1 + 1, pn.line - 7.5, pn.line + 7.5, L, sill, pn.along, "plaster", "gallery:front:parapet");
    fronts.push(pn);
  }
  // the parapet the plan draws seen (beyond the panes too)
  const par = pairs(axisSegs(/^A_SEEN_LT$/, 100), 8, 25);
  for (const pr of par) {
    if (panes.some((pn) => pn.along === pr.along && Math.abs(pn.line - pr.line) < 15 && pn.a0 < pr.a1 && pr.a0 < pn.a1 && pn.a0 <= pr.a0 + 5 && pn.a1 >= pr.a1 - 5)) continue;
    const t = Math.min(ukAt((pr.a0 + pr.a1) / 2, pr.line), 110);
    // only the parts the panes leave: a parapet under them is already built
    let cur: Array<[number, number]> = [[pr.a0, pr.a1]];
    for (const pn of panes) if (pn.along === pr.along && Math.abs(pn.line - pr.line) < 15) cur = cur.flatMap(([a, b]): Array<[number, number]> => (pn.a1 <= a || pn.a0 >= b ? [[a, b]] : ([[a, pn.a0], [pn.a1, b]] as Array<[number, number]>).filter(([p2, q]) => q - p2 > 2)));
    for (const [a, b] of cur) { box(a, b, pr.line - 7.5, pr.line + 7.5, L, L + t, pr.along, "plaster", "gallery:front:parapet"); box(a, b, pr.line - 8.5, pr.line + 8.5, L + t, L + t + 4, pr.along, "darkSteel", "gallery:front:coping"); }
    fronts.push(pr);
  }
  report.galleryFront = { panes: panes.length, outerPanesSkipped: outerPanes, parapets: par.length, m: fronts.reduce((t, f) => t + f.a1 - f.a0, 0) / 100 };
}
// the gallery's edge over the void: a glass balustrade 1.10 high with a metal handrail, along every straight run where the
// gallery's floor meets the void
{
  const g = P[0]!.walls;
  const runs: Array<{ along: "x" | "y"; line: number; a0: number; a1: number }> = [];
  const edgeAt = (along: "x" | "y", i: number, j: number) => {
    // along x: the edge between rows j and j+1 at column i; along y: between columns i and i+1 at row j
    const k0 = j * g.nx + i, k1 = along === "x" ? (j + 1) * g.nx + i : j * g.nx + i + 1;
    const w = P[3]!.walls.a;
    // a floor at least 60 cm deep behind the edge: a ledge by a wall (the windows' sills, a partition's foot) has no rail
    const deep = (i0: number, j0: number, di: number, dj: number) => {
      for (let st = 0; st < 12; st++) {
        const ii = i0 + di * st, jj = j0 + dj * st;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) return false;
        const kk = jj * g.nx + ii;
        if (w[kk] || !gallery[kk]) return false;
      }
      return true;
    };
    const [di, dj] = along === "x" ? [0, 1] : [1, 0];
    const [i1, j1] = along === "x" ? [i, j + 1] : [i + 1, j];
    return (gallery[k0] && voidMask[k1] && deep(i, j, -di, -dj)) || (gallery[k1] && voidMask[k0] && deep(i1, j1, di, dj));
  };
  for (const along of ["x", "y"] as const) {
    const [nA, nL] = along === "x" ? [g.nx, g.ny - 1] : [g.ny, g.nx - 1];
    for (let L = 0; L < nL; L++) {
      let start = -1;
      for (let a = 0; a <= nA; a++) {
        const on = a < nA && (along === "x" ? edgeAt("x", a, L) : edgeAt("y", L, a));
        if (on && start < 0) start = a;
        if (!on && start >= 0) {
          const line = along === "x" ? g.y0 + (L + 1) * G.CELL : g.x0 + (L + 1) * G.CELL;
          const a0 = (along === "x" ? g.x0 : g.y0) + start * G.CELL, a1 = (along === "x" ? g.x0 : g.y0) + a * G.CELL;
          if (a1 - a0 >= 40) runs.push({ along, line, a0, a1 });
          start = -1;
        }
      }
    }
  }
  for (const r of runs) {
    // where the plan draws the front (parapet and panes), that is the edge
    if (fronts.some((f) => f.along === r.along && Math.abs(f.line - r.line) < 45 && f.a0 < r.a1 - 10 && r.a0 + 10 < f.a1)) continue;
    box(r.a0, r.a1, r.line - 1, r.line + 1, 1225, 1325, r.along, "glass", "rail:gallery:glass");
    box(r.a0, r.a1, r.line - 3, r.line + 3, 1325, 1335, r.along, "metal", "rail:gallery:handrail");
    box(r.a0, r.a1, r.line - 2, r.line + 2, 1225, 1232, r.along, "metal", "rail:gallery:shoe");
  }
  report.galleryRail = { runs: runs.length, m: runs.reduce((t, r) => t + r.a1 - r.a0, 0) / 100 };
}

// ---------- the roofs of what stands on the roof: each small room the roof plan's walls close (a stair head, a tower) gets a
// slab at the top of the walls round it
let caps = 0, raised = 0;
{
  const pl = P[4]!, g = pl.walls, nn = g.nx * g.ny;
  const seen = new Int32Array(nn).fill(-1);
  let id = 0;
  for (let k0 = 0; k0 < nn; k0++) {
    if (seen[k0]! >= 0 || pl.closed[k0]) continue;
    const cells: number[] = []; let border = false; let top = 0;
    const q = [k0]; seen[k0] = id;
    while (q.length) {
      const k = q.pop()!; cells.push(k);
      const i = k % g.nx, j = (k - i) / g.nx;
      if (i === 0 || j === 0 || i === g.nx - 1 || j === g.ny - 1) border = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = jj * g.nx + ii;
        if (pl.closed[kk]) { top = Math.max(top, roofWallTop[kk] ?? 0); continue; }
        if (seen[kk]! < 0) { seen[kk] = id; q.push(kk); }
      }
    }
    id++;
    const m2 = (cells.length * G.CELL * G.CELL) / 1e4;
    if (border || m2 < 1 || m2 > 60 || top < ROOF + 100) continue;
    const mask = new Uint8Array(nn);
    for (const k of cells) mask[k] = 1;
    // tuck the slab under the walls round it
    const d = G.distance({ ...g, a: mask }, (v) => v === 1);
    for (let k = 0; k < nn; k++) if (d[k]! <= 3) mask[k] = 1;
    for (const r of G.rects(g, mask)) {
      const [x0, z1] = M(r.x0, r.y0), [x1, z0] = M(r.x1, r.y1);
      prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (top - 12) / 100, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: 0.24, z: z1 - z0 }, material: "concrete", tag: "roof:cap" });
    }
    // the walls round the room stand to its roof: a parapet that is also the room's front wall is cut at the parapet's mark
    // (17.70) in the roof plan's one ring, but the elevation draws it to the room's top
    const low = new Uint8Array(nn);
    for (let k = 0; k < nn; k++) if (mask[k] && pl.closed[k] && g.a[k] && (roofWallTop[k] ?? 0) < top - 20 && (roofWallTop[k] ?? 0) > 0) low[k] = 1;
    const was = roofWallTop.slice();
    for (let k = 0; k < nn; k++) if (low[k]) roofWallTop[k] = top;
    for (const r of G.rects(g, low)) {
      const [x0, z1] = M(r.x0, r.y0), [x1, z0] = M(r.x1, r.y1);
      const y0 = was[cellOf(g, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)] ?? ROOF;
      prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + top) / 200, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: (top - y0) / 100, z: z1 - z0 }, material: "stone", tag: "wall:roof-room" });
      raised++;
    }
    caps++;
  }
}
report.roofCaps = caps;
report.roofRoomWallsRaised = raised;

// ---------- bands from the elevations: cornices and the towers' crowns, laid on the face the elevation sees
let bandBoxes = 0, bandReturns = 0;
for (const el of elevs) {
  if (!el.map || el.map.score < 3) continue;
  const { axis, s, b } = el.map;
  // the viewer stands on the side whose openings the map matched: the face that side sees first
  // e = s·Y: s = 1 looks toward −X (the viewer on +X); e = s·X: s = 1 looks toward +Y (the viewer on −Y)
  const fromHigh = axis === "Y" ? s === 1 : s === -1;
  for (const band of el.bands) {
    const h = (band.y0 + band.y1) / 2;
    const pl = h >= ROOF ? P[4]! : P[LEVELS.filter((l) => l <= h).length - 1]!;
    const g = pl.walls;
    const [lo, hi] = axis === "X" ? [g.y0, g.y0 + g.ny * G.CELL] : [g.x0, g.x0 + g.nx * G.CELL];
    // sample the band along its length: where the wall stands under it, and how far it runs past the wall's ends —
    // that overhang is how far the moulding stands proud (a crown's upper courses wider than its lower ones step out)
    const samples: Array<{ a: number; hit: number | null }> = [];
    // a band rests on a wall that reaches it: not on a lower site wall in front (the plot's retaining wall, top 3.44, under the
    // +3.94 band at the north-east corner)
    const tall = (x: number, y: number) => isWall(pl, x, y) && (pl !== P[4] || (roofWallTop[cellOf(pl.walls, x, y)] ?? 0) >= band.y0 - 2) && (pl !== P[0] || (groundWallTop[cellOf(pl.walls, x, y)] ?? 0) >= band.y0 - 2);
    for (let e = band.e0; e < band.e1; e += 10) {
      const a = (e + 5 - b) / s;
      let hit: number | null = null;
      const step = fromHigh ? -G.CELL : G.CELL;
      for (let t = fromHigh ? hi : lo; fromHigh ? t > lo : t < hi; t += step) if (axis === "X" ? tall(a, t) : tall(t, a)) { hit = t; break; }
      samples.push({ a, hit });
    }
    if (!samples.some((x) => x.hit != null)) continue;
    const hits = samples.filter((x) => x.hit != null).map((x) => x.hit!).sort((p2, q) => p2 - q);
    const med = hits[Math.floor(hits.length / 2)]!;
    // a sample whose ray went on past the band's own wall to a far one is past that wall's end; a nearer wall is not (the fin
    // beside the south tower stands 1.1 m proud of the block, and the cornice the sheet draws over both crowns it too)
    for (const x of samples) if (x.hit != null && (fromHigh ? med - x.hit : x.hit - med) > 60) x.hit = null;
    const firstHit = samples.findIndex((x) => x.hit != null), lastHit = samples.length - 1 - [...samples].reverse().findIndex((x) => x.hit != null);
    const overhang = Math.max(firstHit, samples.length - 1 - lastHit) * 10;
    const prot = band.prot ?? Math.max(5, Math.min(40, overhang));
    // the face under the band: the outermost wall the band's middle sits on
    const near = samples.filter((x) => x.hit != null).map((x) => x.hit!);
    const face = fromHigh ? Math.max(...near) + G.CELL : Math.min(...near);
    // Each run of samples on one wall (no jump over 15 cm between neighbours) is one outline, not a stack of 10 cm cubes: a
    // line fitted through the run's face (within 4 cm) gives a straight or a sloped band — a diagonal wall's band is a slope,
    // not a stair. A run on a wall square to the elevation (no slope) runs on past the wall's end by the moulding's overhang
    // (the samples past it), a sloped one stops at its last sample.
    const fOf = (h: number) => (fromHigh ? h + G.CELL : h);
    const runs: Array<Array<{ a: number; f: number }>> = [];
    let cur: Array<{ a: number; f: number }> = [];
    samples.forEach((x) => {
      if (x.hit == null) { if (cur.length) runs.push(cur); cur = []; return; }
      const f = fOf(x.hit);
      if (cur.length && Math.abs(f - cur[cur.length - 1]!.f) > 15) { runs.push(cur); cur = []; }
      cur.push({ a: x.a, f });
    });
    if (cur.length) runs.push(cur);
    const dir = samples.length > 1 ? Math.sign(samples[1]!.a - samples[0]!.a) || 1 : 1;
    const ends: Array<{ aS: number; aE: number; f: number | null }> = [];
    for (const run of runs) {
      const n = run.length, ma = run.reduce((t, r) => t + r.a, 0) / n, mf = run.reduce((t, r) => t + r.f, 0) / n;
      const va = run.reduce((t, r) => t + (r.a - ma) ** 2, 0);
      const k = va > 0 ? run.reduce((t, r) => t + (r.a - ma) * (r.f - mf), 0) / va : 0;
      const fit = (a: number) => mf + k * (a - ma);
      const straightFit = run.every((r) => Math.abs(r.f - fit(r.a)) <= 4);
      const level = straightFit && Math.abs(k) < 0.02;
      const fAt = (a: number, raw: number) => (straightFit ? (level ? mf : fit(a)) : raw);
      let aS = run[0]!.a - 5 * dir, aE = run[n - 1]!.a + 5 * dir;
      if (level) {
        // past the wall's ends, up to 40 cm, where the elevation still draws the band and no other wall stands
        const i0 = samples.findIndex((x) => x.a === run[0]!.a), i1 = samples.findIndex((x) => x.a === run[n - 1]!.a);
        let e0 = 0, e1 = 0;
        while (e0 < 4 && i0 - e0 - 1 >= 0 && samples[i0 - e0 - 1]!.hit == null) e0++;
        while (e1 < 4 && i1 + e1 + 1 < samples.length && samples[i1 + e1 + 1]!.hit == null) e1++;
        aS -= e0 * 10 * dir; aE += e1 * 10 * dir;
      }
      const pts: Array<{ a: number; f: number }> = [{ a: aS, f: fAt(aS, run[0]!.f) }, ...run.map((r) => ({ a: r.a, f: fAt(r.a, r.f) })), { a: aE, f: fAt(aE, run[n - 1]!.f) }];
      if (straightFit) pts.splice(1, pts.length - 2);
      const tIn = (f: number) => (fromHigh ? f - 12 : f + 12), tOut = (f: number) => (fromHigh ? f + prot : f - prot);
      const ring = [...pts.map((q) => ({ a: q.a, t: tIn(q.f) })), ...[...pts].reverse().map((q) => ({ a: q.a, t: tOut(q.f) }))]
        .map((q) => (axis === "X" ? { x: q.a, y: q.t } : { x: q.t, y: q.a }));
      prims.push({ type: "prism", ring: ringM(ring), y0: band.y0 / 100, y1: band.y1 / 100, material: "jerusalemStone", tag: `band:${el.name}` });
      bandBoxes++;
      // the run's face for a return: its level, or its middle face when it steps a few cm (the recess beside the tower)
      const fs = run.map((r) => r.f).sort((p2, q2) => p2 - q2);
      ends.push({ aS, aE, f: level ? mf : fs.length >= 3 && fs[fs.length - 1]! - fs[0]! <= 12 ? fs[Math.floor(fs.length / 2)]! : null });
    }
    // where the band steps from one face to a nearer one (the fin beside the south tower, 1.1 m proud of the block), the moulding
    // returns along the nearer wall's side, back to the farther face: a cornice wraps a projection, it does not stop at its edge
    for (let i = 0; i + 1 < ends.length; i++) {
      const p = ends[i]!, q = ends[i + 1]!;
      if (p.f == null || q.f == null || Math.abs(q.aS - p.aE) > 1 || Math.abs(q.f - p.f) < 15 || Math.abs(q.f - p.f) > 150) continue;
      const nearIsP = fromHigh ? p.f > q.f : p.f < q.f;
      const near = nearIsP ? p : q, far = nearIsP ? q : p;
      const at = nearIsP ? p.aE : q.aS, out = nearIsP ? dir : -dir;
      // only along a side that is there: the nearer wall runs back to the farther face just inside its end (not a separate
      // block standing in front with open ground between)
      let side = 0, n = 0;
      for (let t = Math.min(far.f, near.f) + 5; t < Math.max(far.f, near.f) - 5; t += 10) {
        n++;
        const a = at - out * 5, tt = fromHigh ? t - G.CELL : t;
        if (axis === "X" ? tall(a, tt) : tall(tt, a)) side++;
      }
      if (!n || side < 0.8 * n) continue;
      const t0 = far.f, t1 = fromHigh ? near.f + prot : near.f - prot;
      const ring = [{ a: at, t: t0 }, { a: at + out * prot, t: t0 }, { a: at + out * prot, t: t1 }, { a: at, t: t1 }]
        .map((r) => (axis === "X" ? { x: r.a, y: r.t } : { x: r.t, y: r.a }));
      prims.push({ type: "prism", ring: ringM(ring), y0: band.y0 / 100, y1: band.y1 / 100, material: "jerusalemStone", tag: `band:${el.name}:return` });
      bandBoxes++;
      bandReturns++;
    }
  }
}
report.bandBoxes = bandBoxes;
report.bandReturns = bandReturns;
report.maps = Object.fromEntries(elevs.map((el) => [el.name, el.map ?? null]));
report.corniceSteps = corniceSteps;

// ---------- openings only the elevations draw (above every plan's cut): laid on the face the elevation sees
// ---------- curtain walls: the plan's mullions and glazed panels (A-GLAZ, A-GLAZ-CWMG) on one line give where it stands; the
// elevation that sees it face on gives its height and its grid (its A-GLAZ-CWMG lines). Its doors are in the glass.
const curtains: string[] = [];
const curtainDoors: Inst[] = [];
const elevBuilt: Array<{ along: "x" | "y"; a: number; t: number; y0: number; y1: number }> = [];
P.forEach((pl, k) => {
  if (k === 4) return;
  const Lk = pl.level, Lnext = k < 3 ? LEVELS[k + 1]! : ROOF;
  const ms = pl.insts.filter((i) => /Rectangular Mullion|System Panel/i.test(i.family) && i.box.x1 > i.box.x0 - 1);
  const lines: Array<{ along: "x" | "y"; t: number; a0: number; a1: number }> = [];
  for (const i of ms) {
    const cx = (i.box.x0 + i.box.x1) / 2, cy = (i.box.y0 + i.box.y1) / 2;
    const along: "x" | "y" = i.box.x1 - i.box.x0 > i.box.y1 - i.box.y0 ? "x" : "y";
    const t = along === "y" ? cx : cy, a0 = along === "y" ? i.box.y0 : i.box.x0, a1 = along === "y" ? i.box.y1 : i.box.x1;
    const ln = lines.find((l) => Math.abs(l.t - t) < 20 && (l.along === along || a1 - a0 < 20));
    if (ln) { ln.a0 = Math.min(ln.a0, a0); ln.a1 = Math.max(ln.a1, a1); } else if (a1 - a0 >= 20) lines.push({ along, t, a0, a1 });
  }
  for (const ln of lines) {
    if (ln.a1 - ln.a0 < 100) continue;
    for (const el of elevs) {
      if (!el.map || el.map.score < 3 || (el.map.axis === "X") !== (ln.along === "x")) continue;
      const m = el.map;
      const e0 = Math.min(m.s * ln.a0, m.s * ln.a1) + m.b, e1 = Math.max(m.s * ln.a0, m.s * ln.a1) + m.b;
      const segs = el.cw.filter(({ a, b }) => Math.min(a.x, b.x) > e0 - 30 && Math.max(a.x, b.x) < e1 + 30 && Math.min(a.y, b.y) > Lk - 20 && Math.max(a.y, b.y) < Lnext + 20);
      if (segs.length < 4) continue;
      const ys = segs.flatMap(({ a, b }) => [a.y, b.y]), es = segs.flatMap(({ a, b }) => [a.x, b.x]);
      const y0 = Math.max(Lk, Math.min(...ys)), y1 = Math.max(...ys);
      const aOf = (e: number) => (e - m.b) / m.s;
      const A0 = Math.min(aOf(Math.min(...es)), aOf(Math.max(...es))), A1 = Math.max(aOf(Math.min(...es)), aOf(Math.max(...es)));
      box(A0, A1, ln.t - 2, ln.t + 2, y0, y1, ln.along, "glass", `curtain:${pl.name}`);
      const uniq = (vs: number[]) => vs.sort((p2, q) => p2 - q).filter((v, m2, arr) => m2 === 0 || v - arr[m2 - 1]! > 8);
      const vx = uniq(segs.filter(({ a, b }) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 20).map(({ a }) => a.x));
      const hy = uniq(segs.filter(({ a, b }) => Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 20).map(({ a }) => a.y));
      for (const e of vx) { const a = aOf(e); box(a - 3, a + 3, ln.t - 8, ln.t + 8, y0, y1, ln.along, "frame", `curtain:${pl.name}:mullion`); }
      for (const y of hy) if (y >= y0 - 1 && y <= y1 + 1) box(A0, A1, ln.t - 8, ln.t + 8, Math.max(y0, y - 3), Math.min(y1 + 3, y + 3), ln.along, "frame", `curtain:${pl.name}:transom`);
      // the doors the plan draws in this glass (the main entrance's two panic leaves, "Wall-Single-Glass _ידית בהלה"): each its
      // swing's arc — centre the hinge on the line, the arc's reach along the line the leaf's width. The leaf is the curtain's
      // glass in a frame: stiles, rails, a panic bar inside, a pull outside; its head the curtain's first transom over 2 m.
      const head = hy.filter((y) => y > Lk + 200).sort((p2, q) => p2 - q)[0] ?? Lk + 230;
      for (const i of pl.insts) {
        if (!isDoor(i) || !/Glass/i.test(i.family)) continue;
        const arc = i.pieces.find((q) => q.arc && q.arc.r > 60 && q.arc.r < 140)?.arc;
        if (!arc) continue;
        const tc = ln.along === "y" ? arc.c.x : arc.c.y, ac = ln.along === "y" ? arc.c.y : arc.c.x;
        if (Math.abs(tc - ln.t) > 20 || ac < A0 - 20 || ac > A1 + 20) continue;
        const arcPts = Array.from({ length: 17 }, (_, n) => { const th = arc.start + ((arc.end - arc.start) * n) / 16; return { x: arc.c.x + arc.r * Math.cos(th), y: arc.c.y + arc.r * Math.sin(th) }; });
        const as = arcPts.map((q) => (ln.along === "y" ? q.y : q.x)), ts = arcPts.map((q) => (ln.along === "y" ? q.x : q.y));
        const a0 = Math.max(A0, Math.min(...as)), a1 = Math.min(A1, Math.max(...as));
        const swing = ts.reduce((t2, v) => t2 + v, 0) / ts.length > ln.t ? 1 : -1; // the side it opens to: the outside
        const tg = `curtain:${pl.name}:door`;
        for (const a of [a0, a1 - 6]) box(a, a + 6, ln.t - 4, ln.t + 4, Lk, head, ln.along, "frame", tg);
        box(a0, a1, ln.t - 4, ln.t + 4, head - 8, head, ln.along, "frame", tg);
        box(a0, a1, ln.t - 4, ln.t + 4, Lk, Lk + 12, ln.along, "frame", tg);
        const tin = ln.t - swing * 8, tout = ln.t + swing * 8;
        box(a0 + 8, a1 - 8, Math.min(tin, tin + swing * 3), Math.max(tin, tin + swing * 3), Lk + 95, Lk + 101, ln.along, "metal", tg + ":panic-bar");
        const hingeAtLow = Math.abs(ac - a0) < Math.abs(ac - a1);
        const ap = hingeAtLow ? a1 - 14 : a0 + 10; // the pull by the leaf's free edge, away from the hinge
        box(ap, ap + 4, Math.min(tout, tout + swing * 4), Math.max(tout, tout + swing * 4), Lk + 80, Lk + 140, ln.along, "metal", tg + ":pull");
        curtainDoors.push(i);
      }
      // its doors are this glass: the elevation's curtain-door blocks are placed
      for (const sh of el.shapes) if (/Curtain/i.test(sh.family) && sh.cx > e0 - 30 && sh.cx < e1 + 30) usedShapes.add(sh);
      // the wall grid's cells along the line are opened: the plan's walls there are the curtain's own jambs only
      curtains.push(`${pl.name} ${ln.along} t=${ln.t.toFixed(0)} a ${A0.toFixed(0)}..${A1.toFixed(0)} y ${y0.toFixed(0)}..${y1.toFixed(0)} mullions ${vx.length} transoms ${hy.length} (${el.name})`);
      break;
    }
  }
});
report.curtains = curtains;
let facePanels = 0, gapPanels = 0;
for (const el of elevs) {
  if (!el.map || el.map.score < 3) continue;
  const { axis, s, b } = el.map;
  const fromHigh = axis === "Y" ? s === 1 : s === -1;
  for (const sh of el.shapes) {
    if (usedShapes.has(sh) || sh.top - sh.bottom < 40) continue;
    const pl = sh.cy >= ROOF ? P[4]! : P[Math.max(0, LEVELS.filter((l) => l <= sh.cy).length - 1)]!;
    const a = (sh.cx - b) / s;
    const g = pl.walls;
    const [lo, hi] = axis === "X" ? [g.y0, g.y0 + g.ny * G.CELL] : [g.x0, g.x0 + g.nx * G.CELL];
    let hit: number | null = null;
    const step = fromHigh ? -G.CELL : G.CELL;
    // drawn inside a wall the elevation cuts (its lower part is a section): the window stands past that wall, on the building's
    // own wall under the storey above
    const behindCut = el.ringBoxes.some((w) => w.x0 <= sh.cx - sh.w / 2 && w.x1 >= sh.cx + sh.w / 2 && w.y0 <= sh.bottom + 5 && w.y1 >= sh.top - 5);
    const tallAt = (u: number, t: number) => {
      const [x, y] = axis === "X" ? [u, t] : [t, u];
      if (behindCut && pl === P[0] && !inFp(P[1]!, x, y)) return false;
      return isWall(pl, x, y) && (pl !== P[4] || (roofWallTop[cellOf(pl.walls, x, y)] ?? 0) >= sh.top - 5) && (pl !== P[0] || (groundWallTop[cellOf(pl.walls, x, y)] ?? 0) >= sh.top - 5);
    };
    // the plan may leave the window's gap with no block in it (the gallery's two small arches on the south): a ray between two
    // jambs at the window's width has met the face, and the gap is filled round the window
    const off = sh.w / 2 + 15;
    let inGap = false;
    for (let t = fromHigh ? hi : lo; fromHigh ? t > lo : t < hi; t += step) {
      if (tallAt(a, t)) { hit = t; break; }
      if (tallAt(a - off, t) && tallAt(a + off, t)) { hit = t; inGap = true; break; }
    }
    if (hit == null) continue;
    if (inGap) {
      // the gap's edges and the wall's depth at its jambs
      let g0 = a, g1 = a;
      while (g0 > a - off - 40 && !tallAt(g0, hit)) g0 -= G.CELL;
      while (g1 < a + off + 40 && !tallAt(g1, hit)) g1 += G.CELL;
      g0 += G.CELL / 2; g1 -= G.CELL / 2;
      let tIn = hit;
      while (tallAt(g0 - G.CELL, tIn - step) || tallAt(g1 + G.CELL, tIn - step)) { tIn -= step; if (Math.abs(tIn - hit) > 80) break; }
      const tOuter = fromHigh ? hit + G.CELL / 2 : hit - G.CELL / 2, tInner = fromHigh ? tIn - G.CELL / 2 : tIn + G.CELL / 2;
      const [w0, w1] = [Math.min(tOuter, tInner), Math.max(tOuter, tInner)];
      const L = pl.level, Ltop = pl === P[4] ? (roofWallTop[cellOf(pl.walls, axis === "X" ? g0 - G.CELL : hit, axis === "X" ? hit : g0 - G.CELL)] || ROOF + 100) : (P.indexOf(pl) < 3 ? LEVELS[P.indexOf(pl) + 1]! : ROOF);
      const gprof: Prof = { kind: sh.kind, cA: a, w: sh.w, bottom: sh.bottom, top: sh.top, spring: sh.spring, r: sh.r, rOuter: sh.rOuter, cy: sh.cy, hs: sh.hs, vs: sh.vs?.map((v) => s * v), sp: sh.sp };
      const inward = fromHigh ? -1 : 1;
      const glA = Math.min(tOuter + inward * 10, tOuter + inward * 14), glB = Math.max(tOuter + inward * 10, tOuter + inward * 14);
      const along2 = axis === "X" ? "x" : "y", tag2 = `opening:elevation-gap:${sh.family}`;
      // a door's leaf in such a gap (the roof room's exit) is a solid metal leaf, not glass, unless its family says glazed
      const gapLeaf: BuildingMaterial = /Door|IntSgl|Flush|דלת/i.test(sh.family) && !/זכוכית|Glass|Curtain/i.test(sh.family) ? "darkSteel" : "glass";
      {
        // the gap's wall round the window and its glass, as true outlines
        const Lb = SW.flat("L", L), Tb = SW.flat("T", Ltop), o2 = SW.openingEdges(gprof, "g");
        const cr = [g0 - 3, g1 + 3, o2.u0, o2.u1].filter((x) => x >= g0 - 3.01 && x <= g1 + 3.01);
        const inO = (u: number) => u > o2.u0 && u < o2.u1;
        for (const poly of SW.sweep(cr, (u) => o2.curved && inO(u), (u) => SW.minusE([[Lb, Tb]], inO(u) ? [[o2.lo, o2.hi]] : [], u))) sidePrism(poly, along2, w0, w1, "stone", tag2);
        for (const poly of SW.sweep([Math.max(g0, o2.u0), Math.min(g1, o2.u1)], () => o2.curved, (u) => SW.intersectE([[Lb, Tb]], [o2.lo, o2.hi], u))) sidePrism(poly, along2, glA, glB, gapLeaf, tag2);
      }
      barCount += frameBars(gprof, L, Ltop, glA, glB, along2, tag2);
      elevBuilt.push({ along: along2, a, t: (w0 + w1) / 2, y0: sh.bottom, y1: sh.kind === "round" ? sh.cy + sh.r : sh.top });
      gapPanels++;
      continue;
    }
    const face = fromHigh ? hit + G.CELL / 2 : hit - G.CELL / 2, o = fromHigh ? 1 : -1;
    const prof: Prof = { kind: sh.kind, cA: a, w: sh.w, bottom: sh.bottom, top: sh.top, spring: sh.spring, r: sh.r, rOuter: sh.rOuter, cy: sh.cy, hs: sh.hs, vs: sh.vs?.map((v) => s * v), sp: sh.sp };
    const reach = sh.kind === "rect" ? sh.w / 2 : Math.max(sh.r, sh.rOuter);
    const N = sh.kind === "rect" ? 6 : 18;
    const along = axis === "X" ? "x" : "y";
    const tag = `opening:elevation:${sh.family}`;
    // each slice on the face its own column meets: a wall that bends or runs aslant (the lower block's front) is not one line
    const faceAt = (u: number) => {
      for (let t = fromHigh ? hi : lo; fromHigh ? t > lo : t < hi; t += step) if (tallAt(u, t)) return fromHigh ? t + G.CELL / 2 : t - G.CELL / 2;
      return face;
    };
    // on a straight face (the face the same across the window) the glass and surround are true outlines; an aslant wall keeps
    // its slices, each on its own column's face
    const faces = [-1, -0.5, 0, 0.5, 1].map((f) => { const v = faceAt(a + f * reach * 0.95); return Math.abs(v - face) > 120 ? face : v; });
    if (Math.max(...faces) - Math.min(...faces) <= 5) {
      const fu = faces[2]!, Lb = SW.flat("L", -1e6), Tb = SW.flat("T", 1e6), o2 = SW.openingEdges(prof, "f"), sr2 = SW.surroundEdges(prof, "f");
      for (const poly of SW.sweep([o2.u0, o2.u1], () => o2.curved, (u) => SW.intersectE([[Lb, Tb]], [o2.lo, o2.hi], u))) sidePrism(poly, along, Math.min(fu - 2 * o, fu + 3 * o), Math.max(fu - 2 * o, fu + 3 * o), "glass", tag);
      if (sr2) for (const poly of SW.sweep([sr2.u0, sr2.u1, o2.u0, o2.u1], () => true, (u) => SW.minusE([[sr2.lo, sr2.hi]], u > o2.u0 && u < o2.u1 ? [[o2.lo, o2.hi]] : [], u))) sidePrism(poly, along, Math.min(fu, fu + 5 * o), Math.max(fu, fu + 5 * o), "jerusalemStone", tag + ":surround");
      barCount += frameBars(prof, -1e9, 1e9, Math.min(face, face + 2 * o), Math.max(face, face + 2 * o), along, tag);
      elevBuilt.push({ along, a, t: face, y0: sh.bottom, y1: sh.kind === "round" ? sh.cy + sh.r : sh.top });
      facePanels++;
      continue;
    }
    for (let k = 0; k < N; k++) {
      const u0 = a - reach + (2 * reach * k) / N, u1 = a - reach + (2 * reach * (k + 1)) / N, um = (u0 + u1) / 2;
      let fu = faceAt(um);
      if (Math.abs(fu - face) > 120) fu = face;
      const op = openingAt(prof, um);
      // the glass stands a hair proud of the cell's edge, so an aslant wall's own surface does not hide it
      if (op) box(u0, u1, Math.min(fu - 2 * o, fu + 3 * o), Math.max(fu - 2 * o, fu + 3 * o), op[0], op[1], along, "glass", tag);
      const sr = surroundAt(prof, um);
      if (sr) {
        const parts: Array<[number, number]> = op ? [[sr[0], op[0]], [op[1], sr[1]]] : [[sr[0], sr[1]]];
        for (const [y0, y1] of parts) box(u0, u1, Math.min(fu, fu + 5 * o), Math.max(fu, fu + 5 * o), y0, y1, along, "jerusalemStone", tag + ":surround");
      }
    }
    barCount += frameBars(prof, -1e9, 1e9, Math.min(face, face + 2 * o), Math.max(face, face + 2 * o), along, tag);
    elevBuilt.push({ along, a, t: face, y0: sh.bottom, y1: sh.kind === "round" ? sh.cy + sh.r : sh.top });
    facePanels++;
  }
}
// The plan openings left with no wall gap: each accounted for where another reader built it — a door in the curtain wall's
// glass, a pane of the gallery's front, or the window the elevation draws on that face at that storey. What none built is
// reported as left.
{
  const resolved: string[] = [], left: string[] = [];
  for (const { k, i, name } of noGapInsts) {
    const X = (i.box.x0 + i.box.x1) / 2, Y = (i.box.y0 + i.box.y1) / 2, L = P[k]!.level, Lt = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
    if (curtainDoors.includes(i)) { resolved.push(`${name} → a door in the curtain wall`); continue; }
    // the same Revit element (its id in the block's name) in a storey below's plan: drawn again in this plan, built there
    const idOf = (n: string) => n.match(/-(\d{6,8})-/)?.[1] ?? null;
    const id = idOf(i.name);
    const below = id ? P.slice(0, k).findIndex((pl2) => pl2.insts.some((o) => o.family === i.family && idOf(o.name) === id)) : -1;
    if (below >= 0) { resolved.push(`${name} → the same element (id ${id}) as ${P[below]!.name}'s, built there`); continue; }
    const segD = (f: { along: "x" | "y"; line: number; a0: number; a1: number }) => { const [a, t] = f.along === "x" ? [X, Y] : [Y, X]; return Math.hypot(Math.max(0, f.a0 - a, a - f.a1), t - f.line); };
    if (k === 3 && fronts.some((f) => segD(f) < 60)) { resolved.push(`${name} → the gallery front's panes`); continue; }
    const eb = elevBuilt.find((e) => { const [a, t] = e.along === "x" ? [X, Y] : [Y, X]; return Math.abs(a - e.a) < 80 && Math.abs(t - e.t) < 120 && e.y0 < Lt - 20 && e.y1 > L + 20; });
    if (eb) { resolved.push(`${name} → the elevation's window on that face`); continue; }
    left.push(name);
  }
  report.openingsResolved = resolved;
  report.openingsLeft = left;
}
report.facePanels = facePanels;
report.gapPanels = gapPanels;
report.looseTaken = looseTaken;
report.looseArches = elevs.map((el) => `${el.name}: ${el.shapes.filter((sh) => sh.family.startsWith("loose")).map((sh) => `${sh.cx.toFixed(0)} ${sh.bottom.toFixed(0)}..${sh.top.toFixed(0)} ${usedShapes.has(sh) ? "plan" : "face"}`).join(", ")}`);
report.frameBars = barCount;

// ---------- furniture and fixtures: every block on A_FURN / A_FIXT_SANT, its own footprint, a height by kind
const FURN: Array<[RegExp, number, BuildingMaterial]> = [
  [/Church_Pew|ספסל/i, 90, "timber"], [/ארון קודש/, 260, "walnut"], [/בימה/, 110, "timber"], [/Table|שולחן/i, 75, "timber"],
  [/Chair|כסא|כיסא/i, 85, "timber"], [/Shelf|ספרי|Book|ארון/i, 200, "walnut"], [/WC|Toilet|אסלה/i, 40, "ceramic"], [/Sink|כיור|Lavatory/i, 85, "ceramic"],
  [/Shower|מקלחת/i, 5, "ceramic"], [/Urinal/i, 60, "ceramic"], [/מקווה|Mikve/i, 10, "ceramic"],
];
let furn = 0, furnOut = 0, furnVoid = 0;
const hallGuess: string[] = [];
let bookcases = 0;
// each storey's arks: the benches face them
const aronsBy = P.slice(0, 4).map((pl) => pl.insts.filter((i) => /ארון קודש/.test(i.family)).map((i) => ({ x: (i.box.x0 + i.box.x1) / 2, y: (i.box.y0 + i.box.y1) / 2 })));
const furnKinds: Record<string, number> = {};
P.slice(0, 4).forEach((pl) => {
  for (const i of pl.insts) {
    if (!/A_FURN|A_FIXT_SANT|A-FURN/.test(i.layer) || isOpening(i.family)) continue;
    const kind = FURN.find(([re]) => re.test(i.family));
    const sant = /SANT/.test(i.layer);
    const h = kind ? kind[1] : sant ? 80 : 75;
    const mat: BuildingMaterial = kind ? kind[2] : sant ? "ceramic" : "timber";
    const b = i.box;
    if (b.x1 - b.x0 > 1200 || b.y1 - b.y0 > 1200) continue;
    if (!inFp(pl, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)) { furnOut++; continue; } // a block drawn outside the building (a legend)
    // the gallery's plan draws the beit midrash below, seen through the void: its benches, ark and bimah are the storey below's
    // (a block the same as the storey below's is the hall seen through only near the void: the stacked toilets are both storeys')
    const nearVoid = (x: number, y: number, r: number) => { for (let dx = -r; dx <= r; dx += 25) for (let dy = -r; dy <= r; dy += 25) { const c = cellOf(P[0]!.walls, x + dx, y + dy); if (c >= 0 && voidMask[c]) return true; } return false; };
    if (pl === P[3] && (!gallery[cellOf(P[0]!.walls, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)] || voidMask[cellOf(P[0]!.walls, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)] || nearVoid((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 300) && P[2]!.insts.some((o) => o.family === i.family && Math.abs(o.box.x0 - b.x0) < 3 && Math.abs(o.box.y0 - b.y0) < 3 && Math.abs(o.box.x1 - b.x1) < 3))) { furnVoid++; continue; }
    // built as the thing it is (furnish.mts), turned as the plan turns it; its back toward its wall, a bench's away from the ark
    const fr = FU.frameOf(i);
    if (fr) {
      const arks = aronsBy[P.indexOf(pl)] ?? [];
      const toWall = (dir: Pt, half: number): 1 | -1 => {
        for (let k = 0; k <= 80; k += 5) for (const sg of [1, -1] as const) if (isWall(pl, fr.c.x + dir.x * sg * (half + k), fr.c.y + dir.y * sg * (half + k))) return sg;
        return 1;
      };
      const back = (axis: "u" | "v"): 1 | -1 => {
        const dir = axis === "u" ? fr.u : fr.v, half = (axis === "u" ? fr.w : fr.d) / 2;
        if (/Church_Pew|ספסל|Pulpit|Podium/i.test(i.family) && arks.length) {
          const a = arks.sort((p, q) => Math.hypot(p.x - fr.c.x, p.y - fr.c.y) - Math.hypot(q.x - fr.c.x, q.y - fr.c.y))[0]!;
          return (a.x - fr.c.x) * dir.x + (a.y - fr.c.y) * dir.y > 0 ? -1 : 1;
        }
        return toWall(dir, half);
      };
      let fam = i.family;
      // a block the family names nothing ("Furniture 1") in a hall of benches with no named ark: one long against a wall is the
      // ark, one square among the benches the bimah (the beit midrash's, drawn as Revit generic models)
      if (/^Furniture \d/.test(fam) && !arks.length && pl.insts.some((o) => /Church_Pew/.test(o.family))) {
        const longS = Math.max(fr.w, fr.d), shortS = Math.min(fr.w, fr.d), sa: "u" | "v" = fr.w >= fr.d ? "v" : "u";
        const sdir = sa === "u" ? fr.u : fr.v;
        let wallNear = false;
        const ldir = sa === "u" ? fr.v : fr.u;
        // along its length too: a window may open in the wall behind its middle
        for (const f of [-0.35, 0, 0.35]) for (let k = 0; k <= 30 && !wallNear; k += 5) for (const sg of [1, -1]) if (isWall(pl, fr.c.x + ldir.x * f * longS + sdir.x * sg * (shortS / 2 + k), fr.c.y + ldir.y * f * longS + sdir.y * sg * (shortS / 2 + k))) wallNear = true;
        if (wallNear && longS >= 200) fam = "ארון קודש (generic)";
        else if (!wallNear && longS >= 120 && longS <= 320 && shortS >= 120) fam = "בימה (generic)";
        hallGuess.push(`${pl.name} ${i.family} → ${fam}`);
      }
      // the sheet's "פינה לארונות ספרים": the shallow variable closets (≤ 35 cm) the beit midrash's storey stands by its benches are
      // its bookcases — open shelves of sefarim, not closed cupboards
      if (/Closet/.test(fam) && Math.min(fr.w, fr.d) <= 35 && pl.insts.some((o) => /Church_Pew/.test(o.family) && Math.hypot((o.box.x0 + o.box.x1) / 2 - fr.c.x, (o.box.y0 + o.box.y1) / 2 - fr.c.y) < 500)) {
        fam = "ארון ספרים (" + fam + ")";
        bookcases++;
      }
      const { parts, kind } = FU.partsOf(fam, i.layer, fr, back);
      prims.push(...FU.toPrims(fr, pl.level, parts, `furniture:${kind}:${i.family}`));
      furn++;
      furnKinds[i.family] = (furnKinds[i.family] ?? 0) + 1;
      continue;
    }
    const [x0, z1] = M(b.x0, b.y0), [x1, z0] = M(b.x1, b.y1);
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (pl.level + h / 2) / 100, z: (z0 + z1) / 2 }, size: { x: Math.max(0.03, x1 - x0), y: h / 100, z: Math.max(0.03, z1 - z0) }, material: mat, tag: `furniture:${i.family}` });
    furn++;
    furnKinds[i.family] = (furnKinds[i.family] ?? 0) + 1;
  }
});
report.hallGuess = hallGuess;
report.bookcases = bookcases;
report.furniture = { count: furn, outsideSkipped: furnOut, seenThroughVoid: furnVoid, kinds: furnKinds };
report.elevationShapesUnplaced = elevs.map((e) => ({
  name: e.name,
  unplaced: e.shapes.filter((s) => !usedShapes.has(s)).map((s) => `${s.family} e=${s.cx.toFixed(0)} y=${s.bottom.toFixed(0)}..${s.top.toFixed(0)}`),
}));

/** The drive across the near sidewalk into the parking, along the street from STREET.A (cm): a lamp stands clear of it. */
let driveS: [number, number] | null = null;
// ---------- ground: the four elevations' earth (C-TOPO hatch) give the ground line along each side; between them the heights
// are blended by distance to each side. Inside the storeys the ground stays under the lowest floor standing there.
// the paving under all, but open over the pits (the mikveh's pools go down through it)
{
  const pit = stairOpen.get(0);
  if (!pit) prims.push({ type: "box", centre: { x: (bx.x0 + bx.x1) / 200, y: -0.08, z: -(bx.y0 + bx.y1) / 200 }, size: { x: (bx.x1 - bx.x0) / 100 + 40, y: 0.16, z: (bx.y1 - bx.y0) / 100 + 40 }, material: "paving", tag: "ground" });
  else {
    const g0 = P[0]!.walls, X0 = g0.x0, X1 = g0.x0 + g0.nx * G.CELL, Y0 = g0.y0, Y1 = g0.y0 + g0.ny * G.CELL, E = 2000;
    for (const [a0, a1, b0, b1] of [[X0 - E, X1 + E, Y0 - E, Y0], [X0 - E, X1 + E, Y1, Y1 + E], [X0 - E, X0, Y0, Y1], [X1, X1 + E, Y0, Y1]] as const) box(a0, a1, b0, b1, -16, 0, "x", "paving", "ground");
    for (const r of G.rects(g0, pit.map((v) => (v ? 0 : 1)) as unknown as Uint8Array)) box(r.x0, r.x1, r.y0, r.y1, -16, 0, "x", "paving", "ground");
  }
  // the earth under the paving, as the sheets hatch it: an elevation's camera sees under the ground line, and saw sky there
  {
    const g0 = P[0]!.walls, X0 = g0.x0, X1 = g0.x0 + g0.nx * G.CELL, Y0 = g0.y0, Y1 = g0.y0 + g0.ny * G.CELL, E = 5000;
    for (const [a0, a1, b0, b1] of [[X0 - E, X1 + E, Y0 - E, Y0], [X0 - E, X1 + E, Y1, Y1 + E], [X0 - E, X0, Y0, Y1], [X1, X1 + E, Y0, Y1]] as const) box(a0, a1, b0, b1, -400, -16, "x", "soil", "ground:earth");
    const solid = pit ? (pit.map((v) => (v ? 0 : 1)) as unknown as Uint8Array) : new Uint8Array(g0.nx * g0.ny).fill(1);
    for (const r of G.rects(g0, solid)) box(r.x0, r.x1, r.y0, r.y1, -400, -16, "x", "soil", "ground:earth");
  }
  // the street: a 3 m sidewalk on each side, raised 15 cm with its kerb, an 8 m road between, laid over the plaza's paving
  {
    const c = { x: STREET.A.x + STREET.d.x * -1300, y: STREET.A.y + STREET.d.y * -1300 }, R = 7000;
    const strip = (o0: number, o1: number, y0: number, y1: number, material: BuildingMaterial, tag: string, a0 = -R, a1 = R) => {
      if (a1 - a0 < 1) return;
      const pt = (a: number, o: number) => ({ x: c.x + STREET.d.x * a + STREET.n.x * o, y: c.y + STREET.d.y * a + STREET.n.y * o });
      prims.push({ type: "prism", ring: ringM([pt(a0, o0), pt(a1, o0), pt(a1, o1), pt(a0, o1)]), y0: y0 / 100, y1: y1 / 100, material, tag });
    };
    // the drive into the parking (its "סימון חניה" bays): the near sidewalk's kerb dropped across the bays' width and a metre
    // each side, the sidewalk's road half stepped down toward it — a car drives over it, it does not climb a 15 cm kerb
    const bayPts = P[0]!.pieces.filter((p) => p.path[0] && /סימון חניה/.test(p.path[0]) && p.pts).flatMap((p) => p.pts!);
    const along = bayPts.map((q) => (q.x - c.x) * STREET.d.x + (q.y - c.y) * STREET.d.y);
    const drive = bayPts.length ? [Math.min(...along) - 100, Math.max(...along) + 100] as const : null;
    const [d0, d1] = drive ?? [R, R];
    strip(0, 300, -2, 15, "paving", "street:sidewalk", -R, d0);
    strip(0, 300, -2, 15, "paving", "street:sidewalk", d1, R);
    // the ramp: from 1.2 m off the plot's line the sidewalk slopes down to the dropped kerb, in 2 cm steps (a prism's top is
    // flat: twelve fine strips read as one slope); at its two ends the same fall across the sidewalk, flared over a metre
    strip(0, 120, -2, 15, "paving", "street:sidewalk", d0, d1);
    const RAMP = 12, rampH = (j: number) => 15 - ((15 - 3) * (j + 0.5)) / RAMP;
    for (let j = 0; j < RAMP; j++) {
      const o0 = 120 + ((282 - 120) * j) / RAMP, o1 = 120 + ((282 - 120) * (j + 1)) / RAMP;
      strip(o0, o1, -2, rampH(j), "paving", "street:sidewalk:drive", d0 + 100 * (1 - (j + 1) / RAMP), d1 - 100 * (1 - (j + 1) / RAMP));
      // the flares: the ramp's step meets the full sidewalk with its own height over what the flare leaves
      strip(o0, o1, -2, 15, "paving", "street:sidewalk", d0, d0 + 100 * (1 - (j + 1) / RAMP));
      strip(o0, o1, -2, 15, "paving", "street:sidewalk", d1 - 100 * (1 - (j + 1) / RAMP), d1);
    }
    strip(0, 18, -2, 15.5, "concrete", "street:kerb");
    strip(282, 300, -2, 15.5, "concrete", "street:kerb", -R, d0);
    strip(282, 300, -2, 15.5, "concrete", "street:kerb", d1, R);
    strip(282, 300, -2, 3, "concrete", "street:kerb:dropped", d0, d1);
    if (drive) { report.drive = { a0: d0.toFixed(0), a1: d1.toFixed(0), m: ((d1 - d0) / 100).toFixed(1) }; driveS = [d0 - 1300, d1 - 1300]; }
    strip(300, 1100, -2, 0.6, "asphalt", "street:road");
    strip(1082, 1100, -2, 15.5, "concrete", "street:kerb");
    strip(1100, 1400, -2, 15, "paving", "street:sidewalk");
    strip(686, 702, 0.6, 0.7, "parkingLine", "street:lane");
    report.street = { from: STREET.A, dir: STREET.d };
  }
}
{
  const wb = { x0: bx.x0 + 300, x1: bx.x1 - 300, y0: bx.y0 + 300, y1: bx.y1 - 300 }; // the walls' own box
  type Prof = { g: Map<number, number>; lo: number; hi: number };
  const profOf = (el: Elev, ps: DxfPiece[]): Prof => {
    const g = new Map<number, number>();
    for (const p of ps) {
      if (!p.rings || !/C-TOPO/.test(p.layer)) continue;
      for (const r of p.rings) for (let i = 0; i < r.length; i++) {
        const a = r[i]!, b = r[(i + 1) % r.length]!;
        const n = Math.max(1, Math.ceil(Math.abs(b.x - a.x) / 10));
        for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n; const c = Math.round(x / 10); if (y > (g.get(c) ?? -1e9)) g.set(c, y); }
      }
    }
    const cs = [...g.keys()];
    return { g, lo: Math.min(...cs), hi: Math.max(...cs) };
  };
  const sides = ELEVS.map((n, i) => ({ el: elevs[i]!, prof: profOf(elevs[i]!, G.readPieces(path.join(dir, n + ".dxf"))) })).filter((x) => x.el.map && x.prof.g.size);
  const at = (pr: Prof, e: number) => {
    let c = Math.round(e / 10);
    c = Math.max(pr.lo, Math.min(pr.hi, c));
    for (let d = 0; d < 40; d++) { const v = pr.g.get(c + d) ?? pr.g.get(c - d); if (v != null) return v; }
    return 0;
  };
  // the site carries on past the plot (the hill on the west, the street on the east) far enough that no view sees its rim
  const pad = 3000, dxCm = 25;
  const X0 = wb.x0 - pad, X1 = wb.x1 + pad, Y0 = wb.y0 - pad, Y1 = wb.y1 + pad;
  const nx = Math.ceil((X1 - X0) / dxCm) + 1, nz = Math.ceil((Y1 - Y0) / dxCm) + 1;
  // model z = −Y: the grid's row j runs from z0 = −Y1 down in Y
  const heights: number[] = new Array(nx * nz);
  const floorUnder = (X: number, Y: number) => { for (let k = 0; k < 4; k++) if (inFp(P[k]!, X, Y)) return LEVELS[k]!; return null; };
  const profiles: Record<string, string> = {};
  const dugDoors = new Set<string>();
  // where the elevation that sees a door face on draws no earth in front of it (a gap in its C-TOPO hatch), the ground is cut
  // along the whole line of sight to the door's sill: a sunk path, not a pit the bank hides
  const trench = doorPads.map((dp) => {
    for (const sd of sides) {
      const m = sd.el.map!;
      if ((m.axis === "Y") !== (dp.along === "y")) continue;
      const ec = Math.round((m.s * (dp.a0 + dp.a1) / 2 + m.b) / 10);
      if (ec <= sd.prof.lo || ec >= sd.prof.hi) continue;
      if (sd.prof.g.has(ec) || sd.prof.g.has(ec - 2) || sd.prof.g.has(ec + 2)) continue;
      const fromHigh = m.axis === "Y" ? m.s === 1 : m.s === -1;
      return fromHigh ? 1 : -1;
    }
    return 0;
  });
  report.doorTrenches = trench.filter((t) => t !== 0).length;
  for (const sd of sides) profiles[sd.el.name] = `e ${sd.prof.lo * 10}..${sd.prof.hi * 10}: ground ${Math.min(...sd.prof.g.values()).toFixed(0)}..${Math.max(...sd.prof.g.values()).toFixed(0)} cm`;
  const raw = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const X = X0 + i * dxCm, Y = Y1 - j * dxCm;
    let sw = 0, sv = 0;
    for (const sd of sides) {
      const m = sd.el.map!;
      const e = m.s * (m.axis === "X" ? X : Y) + m.b;
      // the side's line: east +X, west −X (axis Y); north −Y, south +Y (axis X) — the viewer's side of the map
      const fromHigh = m.axis === "Y" ? m.s === 1 : m.s === -1;
      const d = m.axis === "Y" ? (fromHigh ? Math.max(0, wb.x1 - X) : Math.max(0, X - wb.x0)) : fromHigh ? Math.max(0, wb.y1 - Y) : Math.max(0, Y - wb.y0);
      // past the end of what a sheet draws (the north sheet's bank stops at the plot's corner) it says nothing: not its last
      // value carried on over the street
      const past = Math.max(0, sd.prof.lo * 10 - e, e - sd.prof.hi * 10);
      const w = past > 100 ? 1e-6 / ((d / 100) ** 2 + 0.25) : 1 / ((d / 100) ** 2 + 0.25);
      sw += w; sv += w * at(sd.prof, e);
    }
    raw[j * nx + i] = sw ? sv / sw : 0;
  }
  // the blend of four sheets is blocky where one side's bank meets another's level ground (a 1 m step beside a street corner,
  // a sliver between two wings): the ground eased over 1.5 m, twice, before the building's own cuts are made in it
  // (only the ground outside the building is averaged: the blend under a wing is no ground, and drew the west bank down)
  const under = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (floorUnder(X0 + i * dxCm, Y1 - j * dxCm) != null) under[j * nx + i] = 1;
  for (let pass = 0; pass < 2; pass++) for (const horiz of [true, false]) {
    const src = raw.slice(), R = 6;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (under[j * nx + i]) continue;
      let a = 0, c = 0;
      for (let d = -R; d <= R; d++) { const ii = horiz ? i + d : i, jj = horiz ? j : j + d; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || under[jj * nx + ii]) continue; a += src[jj * nx + ii]!; c++; }
      if (c) raw[j * nx + i] = a / c;
    }
  }
  // in front of a face, as far as its sheet draws the ground, the ground is no higher than the sheet's own line at the face: a
  // sheet draws the earth where it meets the building, and the blend carried the west hill round the corner as a mound
  // standing in front of the north face's lower storeys (the elevation showed earth over its windows). It eases back to the
  // blend from 10 m out.
  let faceClamped = 0;
  // the retaining wall's V (diagSite): a place is beyond it when, going south (+Y) from it, the wall comes before 25 m
  const diagMask = new Uint8Array(P[0]!.walls.nx * P[0]!.walls.ny);
  G.fillRings({ ...P[0]!.walls, a: diagMask }, diagSite());
  const beyondWall = (X: number, Y: number) => {
    const c0 = cellOf(P[0]!.walls, X, Y);
    if (c0 >= 0 && diagMask[c0]) return false;
    for (let d = 0; d < 2500; d += G.CELL) { const c = cellOf(P[0]!.walls, X, Y + d); if (c < 0) continue; if (diagMask[c]) return true; if (inFp(P[0]!, X, Y + d)) return false; }
    return false;
  };
  const secProf = sides.find((sd) => /מזרחית/.test(sd.el.name) && sd.el.map!.axis === "Y") ?? null;
  let beyondSet = 0;
  const bMask = new Uint8Array(nx * nz);
  const faceCap = (X: number, Y: number) => {
    let cap = Infinity;
    for (const sd of sides) {
      const m = sd.el.map!;
      const e = m.s * (m.axis === "X" ? X : Y) + m.b;
      if (e < sd.prof.lo * 10 || e > sd.prof.hi * 10) continue;
      const fromHigh = m.axis === "Y" ? m.s === 1 : m.s === -1;
      const d = m.axis === "Y" ? (fromHigh ? X - wb.x1 : wb.x0 - X) : fromHigh ? Y - wb.y1 : wb.y0 - Y;
      if (d < 0) continue;
      cap = Math.min(cap, at(sd.prof, e) + 5 + Math.max(0, d - 1000) * 0.4);
    }
    return cap;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const X = X0 + i * dxCm, Y = Y1 - j * dxCm;
    let h = raw[j * nx + i]!;
    const cap = faceCap(X, Y);
    if (h > cap) { h = cap; faceClamped++; }
    // beyond the plot's diagonal retaining wall (north of its V, off the street) the ground is the one the east sheet's
    // section draws there — the public garden's earth at about +1.0..1.35 against the wall — not the blend of four sheets,
    // which left it at street level with a mound where the hill's bank met the street
    if (secProf && beyondWall(X, Y)) {
      const m = secProf.el.map!;
      const v = at(secProf.prof, m.s * Y + m.b);
      const off = STREET.off(X, Y);
      // eased to the street over the last metre before it
      h = off > -150 ? v + (Math.min(-10, v) - v) * Math.min(1, (off + 150) / 100) : v;
      beyondSet++;
      bMask[j * nx + i] = 1;
    }
    if (STREET.off(X, Y) > -50) h = Math.min(h, -10);
    const f = floorUnder(X, Y);
    if (f != null) h = Math.min(h, f - 10);
    // under a storey, out of the ground floor's footprint and open to the street (the parking under the shtiblach): its floor is
    // the lowest ground the elevations draw there, not the bank the blend carries in
    if (f != null && f > 0) {
      const c0 = cellOf(P[0]!.walls, X, Y);
      if (c0 >= 0 && EXPOSED[0]![c0]) h = Math.min(h, ...sides.map((sd) => at(sd.prof, sd.el.map!.s * (sd.el.map!.axis === "X" ? X : Y) + sd.el.map!.b)));
    }
    for (let q = 0; q < doorPads.length; q++) {
      const dp = doorPads[q]!, tr = trench[q]!;
      const [u, t] = dp.along === "x" ? [X, Y] : [Y, X];
      const d = t - dp.t;
      if (u >= dp.a0 && u <= dp.a1 && (Math.abs(d) <= 180 || (tr !== 0 && d * tr > 0 && Math.abs(d) <= 1500)) && h > dp.sill - 2) { h = dp.sill - 2; dugDoors.add(`${dp.along}${dp.a0.toFixed(0)}@${dp.t.toFixed(0)}`); }
    }
    // under a pit (the mikveh's pools) the ground goes down below its floor, a terrain step's reach round it too, so the
    // ground's slope between two samples never shows inside the pool
    let pb = 0;
    for (let oy = -dxCm; oy <= dxCm; oy += G.CELL * 2) for (let ox = -dxCm; ox <= dxCm; ox += G.CELL * 2) { const c = cellOf(P[0]!.walls, X + ox, Y + oy); if (c >= 0 && pitBase[c]! < pb) pb = pitBase[c]!; }
    heights[j * nx + i] = (pb < 0 ? pb - 10 : Math.max(-10, h)) / 100;
  }
  // a lone rise smaller than a room (a sliver the blend leaves between two wings, a pile at a door's jamb) is no bank: paving
  {
    const seen = new Uint8Array(nx * nz); let dropped = 0;
    for (let s0 = 0; s0 < nx * nz; s0++) {
      if (seen[s0] || heights[s0]! <= 0.3) continue;
      const comp: number[] = [s0]; seen[s0] = 1;
      for (let q = 0; q < comp.length; q++) {
        const c = comp[q]!, ci = c % nx, cj = (c - ci) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const c2 = jj * nx + ii; if (!seen[c2] && heights[c2]! > 0.3) { seen[c2] = 1; comp.push(c2); }
        }
      }
      if (comp.length < 400) { for (const c of comp) heights[c] = -0.1; dropped++; }
    }
    report.terrainIslandsDropped = dropped;
  }
  // the garden's earth beyond the wall ends where the wall ends: past it (toward the street) it eases down 1:2 rather than
  // standing as a cliff along the wall's line — on open ground only (not in the court, the building or the street)
  {
    const R = 12, src = heights.slice(); let eased = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (bMask[k]) continue;
      const X = X0 + i * dxCm, Y = Y1 - j * dxCm;
      const c0 = cellOf(P[0]!.walls, X, Y);
      if (inFp(P[0]!, X, Y) || (c0 >= 0 && diagMask[c0]) || STREET.off(X, Y) > -50) continue;
      let best = src[k]!;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k2 = jj * nx + ii; if (!bMask[k2]) continue;
        const v = src[k2]! - 0.5 * Math.hypot(di, dj) * dxCm / 100;
        if (v > best) best = v;
      }
      if (best > src[k]! + 0.01) { heights[k] = best; eased++; }
    }
    report.gardenEased = eased;
  }
  // the hill eases down to the paving over its outer 20 m: no cliff at the grid's rim in a view, no sheet of earth hanging
  // over a void in front of an elevation's camera
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const edge = Math.min(i, nx - 1 - i, j, nz - 1 - j) * dxCm, f = Math.max(0, Math.min(1, (edge - 200) / 1500)), k = j * nx + i;
    const sm = f * f * (3 - 2 * f);
    heights[k] = -0.1 + (heights[k]! + 0.1) * sm;
  }
  // the grid's rim, 45 m out, drops to the paving
  for (let i = 0; i < nx; i++) { heights[i] = -0.1; heights[(nz - 1) * nx + i] = -0.1; }
  for (let j = 0; j < nz; j++) { heights[j * nx] = -0.1; heights[j * nx + nx - 1] = -0.1; }
  prims.push({ type: "terrain", x0: X0 / 100, z0: -Y1 / 100, dx: dxCm / 100, nx, nz, heights, material: "soil", tag: "site:ground" });
  report.terrain = { faceClamped, beyondWall: beyondSet, nx, nz, maxM: heights.reduce((a, b) => Math.max(a, b), -1e9).toFixed(2), profiles, dugDoors: [...dugDoors] };
}

// ---------- model + floors
const pts: Array<[number, number]> = [];
// the building's own outline frames the views: not the street laid 70 m each way past it
for (const p of prims) if (p.type === "prism" && !p.side && /^wall:/.test(p.tag ?? "")) pts.push(...p.ring);
const xs = pts.map(([x]) => x), zs = pts.map(([, z]) => z);
const extent = { x: Math.min(...xs), z: Math.min(...zs), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), yMin: 0, yMax: 20.5 };
const outlineOf = (pl: Plan): Array<[number, number]> => {
  let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9;
  const g = pl.walls;
  for (let k = 0; k < n; k++) if (pl.fp[k]) {
    const i = k % g.nx, j = (k - i) / g.nx;
    const x = g.x0 + i * G.CELL, y = g.y0 + j * G.CELL;
    X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y);
  }
  return [M(X0, Y0), M(X1, Y0), M(X1, Y1), M(X0, Y1)];
};
const floors = P.slice(0, 4).map((pl, k) => ({ id: `floor-${k}`, level: pl.level / 100, height: 4.08, units: [], shift: { x: 0, y: 0 }, outline: outlineOf(pl), roof: false, registration: 1, sheetWidth: 1, sheetHeight: 1 }));
fs.mkdirSync(out, { recursive: true });
// ---- what the plans draw on the roof and in the ceilings ----
{
  // the towers' crown: the stone posts round the two middle towers' tops (roof A-GENM "Chimney_Stone_Piece"), proud of the
  // parapet's face; their height is the face-on elevation's hatch over each (the east sheet: 18.45..19.17 under the coping)
  let posts = 0, postsDefault = 0;
  for (const i of P[4]!.insts.filter((i) => /Chimney_Stone/i.test(i.name))) {
    const b = i.box, alongX = b.x1 - b.x0 > b.y1 - b.y0;
    let y0 = 1845, y1 = 1917, found = false;
    for (const el of elevs) {
      if (!el.map || el.map.score < 3 || (el.map.axis === "X") !== alongX) continue;
      const [a0, a1] = alongX ? [b.x0, b.x1] : [b.y0, b.y1];
      const e0 = Math.min(el.map.s * a0, el.map.s * a1) + el.map.b, e1 = Math.max(el.map.s * a0, el.map.s * a1) + el.map.b;
      const w = el.ringBoxes.find((r) => Math.abs(r.x0 - e0) < 4 && Math.abs(r.x1 - e1) < 4 && r.y0 > ROOF && r.y1 - r.y0 > 30);
      if (w) { y0 = w.y0; y1 = w.y1; found = true; break; }
    }
    if (!found) postsDefault++;
    box(b.x0, b.x1, b.y0, b.y1, y0, y1, "x", "jerusalemStone", "roof:crown-post");
    posts++;
  }
  // the fire hose cabinets (A_EQPM, 80 wide, 80 high, 30 deep) of every storey: their box without the door's swing
  let cabinets = 0;
  P.forEach((pl, k) => {
    for (const i of pl.insts.filter((i) => /Fire Hose Cabinet/i.test(i.name))) {
      const pts = i.pieces.filter((q) => !q.arc).flatMap((q) => q.pts ?? []);
      if (!pts.length) continue;
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const [X0, X1, Y0, Y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      box(X0, X1, Y0, Y1, pl.level + 100, pl.level + 180, "x", "metal", `equipment:fire-cabinet:${pl.name}`);
      // its glazed door's red frame, a centimetre proud of the face that is open
      cabinets++;
    }
  });
  // the ceilings' air: the diffusers the plans draw on E-LITE-EQPM ("ceiling light, rectangle/round – air ..."). A plan shows
  // every one under its cut, so each first appears on the plan over its storey: the one first on plan k is in storey k−1's
  // ceiling, the slab's underside there. Round ones are 6" or 8" necks (30 / 36 cm faces), the linear ones their slot's width.
  const seenDev: string[] = [];
  const devAt: Array<{ k: number; x: number; y: number }> = [];
  let diffusers = 0, diffusersOpen = 0;
  P.forEach((pl, k) => {
    if (k === 0) return;
    const ceil = (k < 4 ? LEVELS[k]! : ROOF) - 30;
    for (const p of pl.pieces) {
      if (!p.insert || p.path.length !== 0 || !/E-LITE/.test(p.layer) || !p.at) continue;
      const key = `${p.insert.replace(/-\d{5,}.*$/, "").replace(/-V\d+-.*$/, "")}@${p.at.x.toFixed(0)},${p.at.y.toFixed(0)}`;
      if (seenDev.includes(key)) continue;
      seenDev.push(key);
      const c = cellOf(P[0]!.walls, p.at.x, p.at.y);
      if (!inFp(P[k]!, p.at.x, p.at.y) || (k === 3 && c >= 0 && voidMask[c])) { diffusersOpen++; continue; }
      const n = p.insert, rot = Math.abs((p.m as { b?: number } | undefined)?.b ?? 0) > 0.5;
      if (/עגול/.test(n)) {
        const r = /8_/.test(n) ? 18 : 15;
        const ring = Array.from({ length: 20 }, (_, j) => { const a = (j / 20) * 2 * Math.PI; return M(p.at!.x + r * Math.cos(a), p.at!.y + r * Math.sin(a)); });
        prims.push({ type: "prism", ring, y0: (ceil - 2) / 100, y1: ceil / 100, material: "metal", tag: `hvac:diffuser:${pl.name}` });
        const ring2 = ring.map(([x, z]) => [p.at!.x / 100 + (x - p.at!.x / 100) * 0.55, -p.at!.y / 100 + (z + p.at!.y / 100) * 0.55] as [number, number]);
        prims.push({ type: "prism", ring: ring2, y0: (ceil - 3) / 100, y1: (ceil - 2) / 100, material: "darkSteel", tag: `hvac:diffuser:${pl.name}` });
      } else {
        const w = /אויר חוזר 40/.test(n) ? 40 : /רוחב 20/.test(n) ? 20 : /מיזוג 95/.test(n) ? 20 : 10;
        const len = /אויר חוזר 40/.test(n) ? 60 : /מיזוג 95/.test(n) ? 95 : 120;
        const [hx, hy] = rot ? [w / 2, len / 2] : [len / 2, w / 2];
        box(p.at.x - hx - 2, p.at.x + hx + 2, p.at.y - hy - 2, p.at.y + hy + 2, ceil - 2, ceil, "x", "metal", `hvac:slot:${pl.name}`);
        box(p.at.x - hx, p.at.x + hx, p.at.y - hy, p.at.y + hy, ceil - 3, ceil - 2, "x", "darkSteel", `hvac:slot:${pl.name}`);
      }
      diffusers++;
      devAt.push({ k: k - 1, x: p.at.x, y: p.at.y });
    }
  });
  // the plans' other blocks no reader took: the shafts' service cabinet doors (A_DOOR, "RvZ_Service Cabinet Door"), the folding
  // partitions (A_WALL_PRTN "מחיצה מתקפלת"), the stairs' tactile warning strips (A-GENM "משטח אזהרה") and the safe rooms'
  // filtration unit (A-DETL-MBND "צ_א_4 ממד"). Their plan places are the sheet's; their heights where the type does not name one
  // are estimated (report.blocksBuilt)
  const blocksBuilt = { ventSleeves: 0, suspendedCeilings: 0, serviceDoors: 0, foldingPartitions: 0, warningStrips: 0, filterUnits: 0, estimated: [] as string[] };
  {
    const seenB = new Set<string>();
    P.forEach((pl, k) => {
      const L = pl.level, Lnext = k < 3 ? LEVELS[k + 1]! : k === 3 ? ROOF : 2050;
      for (const i of pl.insts) {
        const b = i.box;
        // the roof plan's own blocks here are only the warning strips at the stairs' top (its others are the storey below's)
        if (k === 4 && !/משטח אזהרה/.test(i.family)) continue;
        if (b.x1 - b.x0 > 1e6) continue;
        const key = `${i.family}@${b.x0.toFixed(0)},${b.y0.toFixed(0)},${k}`;
        if (seenB.has(key)) continue;
        seenB.add(key);
        // a cumulative plan draws a lower storey's block again: only the storey whose floor it stands on keeps it
        if (k > 0 && P[k - 1]!.insts.some((o) => o.family === i.family && Math.abs(o.box.x0 - b.x0) < 3 && Math.abs(o.box.y0 - b.y0) < 3) && !inFp(pl, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)) continue;
        const tag = `block:${pl.name}:${i.family.slice(0, 40)}`;
        if (/Service Cabinet Door/i.test(i.family)) {
          const m = /-\s*(\d+)(?:_(\d+))?\s*$/.exec(i.family), W = m ? +m[1]! : b.x1 - b.x0, H = m?.[2] ? +m[2]! : 210;
          // the leaves close on the wall's face: the bbox's long edge with a wall just behind it
          const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
          const mid = alongX ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2;
          const wallAt = (t: number) => (alongX ? isWall(pl, mid, t) : isWall(pl, t, mid));
          const lo = alongX ? b.y0 : b.x0, hi = alongX ? b.y1 : b.x1;
          const face = wallAt(lo - 6) ? lo : wallAt(hi + 6) ? hi : hi - lo < 6 ? (lo + hi) / 2 : lo;
          const dir = face === lo ? 1 : -1, t0 = face === lo ? face : face - 3, t1 = face === lo ? face + 3 : face;
          const a0 = mid - W / 2, a1 = mid + W / 2, bottom = H < 150 ? L + 90 : L;
          box(a0, a1, t0, t1, bottom, bottom + H, alongX ? "x" : "y", "metal", tag);
          // the frame's shadow line and the handles
          box(a0, a1, dir === 1 ? t1 : t0 - 0.5, dir === 1 ? t1 + 0.5 : t0, bottom + H - 2, bottom + H, alongX ? "x" : "y", "darkSteel", tag);
          for (const s of W >= 60 ? [mid - 4, mid + 3] : [a1 - 8]) box(s, s + 1.2, dir === 1 ? t1 : t0 - 2, dir === 1 ? t1 + 2 : t0, bottom + H / 2 - 8, bottom + H / 2 + 8, alongX ? "x" : "y", "darkSteel", tag);
          blocksBuilt.serviceDoors++;
          if (H < 150) blocksBuilt.estimated.push(`${pl.name} ${i.family}: sill +90 (not given)`);
        } else if (/מחיצה מתקפלת/.test(i.family)) {
          box(b.x0, b.x1, b.y0, b.y1, L, Lnext - 30, "x", "timber", tag);
          blocksBuilt.foldingPartitions++;
        } else if (/משטח אזהרה/.test(i.family)) {
          box(b.x0, b.x1, b.y0, b.y1, L + 0.2, L + 0.9, "x", "stoneDark", tag);
          blocksBuilt.warningStrips++;
        } else if (/Tovna_Mamad_Zinor8/.test(i.family)) {
          // the safe room's 8" air pipe through its wall: a round grille at the end the plan draws it ("Ext" on the facade, "Int"
          // in the room), at +2.40 (the height is not given)
          const pipeY = b.y1 - b.y0 >= b.x1 - b.x0, along: "x" | "y" = pipeY ? "x" : "y";
          const u = pipeY ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2, e0 = pipeY ? b.y0 : b.x0, e1 = pipeY ? b.y1 : b.x1;
          const solid = (t: number) => (pipeY ? isWall(pl, u, t) : isWall(pl, t, u));
          // the grille's face: the pipe's end that stands in the open (outside for Ext, the room for Int)
          const end = !solid(e1 + 6) ? e1 : !solid(e0 - 6) ? e0 : null;
          if (end == null) continue;
          const dir = end === e1 ? 1 : -1, cy = L + 240, r = 13;
          const poly: Array<[number, number]> = Array.from({ length: 20 }, (_, j) => { const a = (j / 20) * 2 * Math.PI; return [u + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]; });
          sidePrism(poly, along, dir === 1 ? end : end - 2.5, dir === 1 ? end + 2.5 : end, "metal", tag);
          const inner: Array<[number, number]> = poly.map(([pu, py]) => [u + (pu - u) * 0.7, cy + (py - cy) * 0.7]);
          sidePrism(inner, along, dir === 1 ? end + 2.5 : end - 3, dir === 1 ? end + 3 : end - 2.5, "darkSteel", tag);
          blocksBuilt.ventSleeves++;
          blocksBuilt.estimated.push(`${pl.name} ${i.family}: grille at +2.40 (not given)`);
        } else if (/צ_א_4|מערכת מודלרית/.test(i.family)) {
          box(b.x0, b.x1, b.y0, b.y1, L + 120, L + 195, "x", "metal", tag);
          blocksBuilt.filterUnits++;
          blocksBuilt.estimated.push(`${pl.name} ${i.family}: +1.20..+1.95 (not given)`);
        }
      }
    });
  }
  // the one suspended ceiling the plans draw (A-CLNG-SUSP, floor 1's west end): a plasterboard plate on its outline, at +2.90 (its
  // height is not given)
  for (const p of P[1]!.pieces) {
    if (p.layer !== "A-CLNG-SUSP" || p.path.length) continue;
  }
  {
    const pts = P[1]!.pieces.filter((p) => p.layer === "A-CLNG-SUSP" && p.path.length === 0 && p.pts).flatMap((p) => p.pts!);
    if (pts.length) {
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      box(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), LEVELS[1]! + 290, LEVELS[1]! + 292, "x", "ceiling", "inside:ceiling:suspended");
      blocksBuilt.suspendedCeilings++;
      blocksBuilt.estimated.push("M-floor1 A-CLNG-SUSP: +2.90 (not given)");
    }
  }
  // the lower block's terrace: floor 1's A-FLOR-PATT hatched strips (10 cm, a U along the south face) are an upstand on the
  // terrace, outside the storey's own floor; the sheet gives no height — 30 cm (estimated)
  let upstands = 0;
  for (const p of P[1]!.pieces) {
    if (!p.rings || p.path.length || !/A-FLOR-PATT/.test(p.layer)) continue;
    for (const r of p.rings) {
      const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
      const w = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const len = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (w > 15 || len < 50 || inFp(P[1]!, cx, cy)) continue;
      // not built: the side sheet draws the terrace's edge as its cornice (+3.58..+3.98) and nothing standing over it — a 30 cm
      // upstand guessed here stood out of the face as a shelf
      upstands++;
    }
  }
  if (upstands) blocksBuilt.estimated.push(`M-floor1 terrace strips ×${upstands}: not built (the sheet draws no upstand)`);
  let liftSills = 0;
  P.slice(0, 4).forEach((pl) => {
    const doors = prims.filter((q) => q.tag === `opening:${pl.name}:BW Sliding Door - Adjustable:lift`);
    if (!doors.length) return;
    for (const p of pl.pieces) {
      if (!p.rings || p.path.length || !/A-GENM/.test(p.layer)) continue;
      for (const r of p.rings) {
        const xs = r.map((q) => q.x), ys = r.map((q) => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (x1 - x0 < 60 || y1 - y0 > 40) continue;
        const near = doors.some((q) => q.type === "box" && Math.abs(q.centre.x * 100 - (x0 + x1) / 2) < 120 && Math.abs(-q.centre.z * 100 - (y0 + y1) / 2) < 60);
        if (!near) continue;
        box(x0, x1, y0, y1, pl.level, pl.level + 1, "x", "metal", `opening:${pl.name}:lift:sill`);
        liftSills++;
      }
    }
  });
  report.liftSills = liftSills;
  report.blocksBuilt = blocksBuilt;
  // the parking (חניה לבית הכנסת): the ground plan's two bays are "סימון חניה" blocks (their outline and the chevron in it), painted
  // on the floor; the east elevation draws a car in each (Lexus LS430 blocks, G-IMPT), nosed in from the street
  const parking = { bays: 0, lines: 0, cars: 0, carsFrom: [] as string[] };
  {
    const bays = new Map<string, { segs: Array<[Pt, Pt]>; x0: number; x1: number; y0: number; y1: number }>();
    for (const p of P[0]!.pieces) {
      const b = p.path[0];
      if (!b || !/סימון חניה/.test(b) || !p.pts || p.pts.length < 2) continue;
      let e = bays.get(b); if (!e) { e = { segs: [], x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }; bays.set(b, e); }
      for (let j = 0; j + 1 < p.pts.length; j++) e.segs.push([p.pts[j]!, p.pts[j + 1]!]);
      for (const q of p.pts) { e.x0 = Math.min(e.x0, q.x); e.x1 = Math.max(e.x1, q.x); e.y0 = Math.min(e.y0, q.y); e.y1 = Math.max(e.y1, q.y); }
    }
    for (const e of bays.values()) {
      parking.bays++;
      for (const [a, b] of e.segs) {
        const L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 5) continue;
        const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, vx = -uy * 5, vy = ux * 5;
        const ring = [[a.x + vx, a.y + vy], [b.x + vx, b.y + vy], [b.x - vx, b.y - vy], [a.x - vx, a.y - vy]].map(([x, y]) => M(x!, y!));
        prims.push({ type: "prism", ring, y0: 0.001, y1: 0.006, material: "parkingLine", tag: "parking:marking" });
        parking.lines++;
      }
    }
    // the cars: an elevation's car block, its centre along the face matched to the bay it stands in
    const bayList = [...bays.values()];
    for (const el of ["חזית מזרחית", "חזית מערבית", "חזית צפונית", "חזית דרומית"]) {
      const file = path.join(dir, `${el}.dxf`);
      if (!fs.existsSync(file)) continue;
      const cars = new Map<string, number[]>();
      for (const p of G.readPieces(file)) {
        const top = p.path[0]; if (!top || !/Lexus|car|Car_|רכב|Vehicle/i.test(top) || !p.pts) continue;
        const b = cars.get(top) ?? [1e9, -1e9, 1e9, -1e9];
        for (const q of p.pts) { b[0] = Math.min(b[0]!, q.x); b[1] = Math.max(b[1]!, q.x); b[2] = Math.min(b[2]!, q.y); b[3] = Math.max(b[3]!, q.y); }
        cars.set(top, b);
      }
      const m = elevs.find((x) => x.name === el)?.map;
      for (const [name, b] of cars) {
        if (!m) continue;
        const ec = (b[0]! + b[1]!) / 2, plan = (ec - m.b) / m.s; // the face's e back to the plan's X or Y
        const bay = bayList.find((y) => (m.axis === "Y" ? plan >= y.y0 && plan <= y.y1 : plan >= y.x0 && plan <= y.x1));
        if (!bay) continue;
        const cx = (bay.x0 + bay.x1) / 2, cy = (bay.y0 + bay.y1) / 2, alongX = bay.x1 - bay.x0 >= bay.y1 - bay.y0;
        const [mx, mz] = M(cx, cy);
        // nosed in: its front away from the street (the street is east of the plot)
        prims.push({ type: "car", at: { x: mx, y: 0, z: mz }, rotY: alongX ? -Math.PI / 2 : 0, colour: [0x2b2f36, 0xb9bcc0][parking.cars % 2]!, tag: "parking:car" });
        parking.cars++;
        parking.carsFrom.push(`${el}: ${name.slice(0, 40)} → bay ${bay.x0.toFixed(0)}..${bay.x1.toFixed(0)} × ${bay.y0.toFixed(0)}..${bay.y1.toFixed(0)}`);
      }
    }
  }
  report.parking = parking;
  // the lighting. The sheets draw no light fitting (E-LITE holds only the air), apart from one block: the Baccarat chandelier the
  // ground plan places (A-GENM). So this is estimated, and reported as such: downlights in every ceiling, the Baccarat type hung in
  // the beit midrash's height, a lantern over each outside door and the street's lamps.
  const lighting = { downlights: 0, chandeliers: 0, chandelierAtBlock: 0, lanterns: 0, lanternsCovered: 0, streetLamps: 0, perStorey: [] as number[] };
  {
    const g0 = P[0]!.walls;
    const ringAround = (x: number, y: number, r: number, nSeg = 16) => Array.from({ length: nSeg }, (_, j) => { const a = (j / nSeg) * 2 * Math.PI; return M(x + r * Math.cos(a), y + r * Math.sin(a)); });
    const disc = (x: number, y: number, r: number, y0: number, y1: number, material: BuildingMaterial, tag: string, nSeg = 16) =>
      prims.push({ type: "prism", ring: ringAround(x, y, r, nSeg), y0: y0 / 100, y1: y1 / 100, material, tag });
    const band = (x: number, y: number, r0: number, r1: number, y0: number, y1: number, material: BuildingMaterial, tag: string) =>
      prims.push({ type: "prism", ring: ringAround(x, y, r1, 28), holes: [ringAround(x, y, r0, 28).reverse()], y0: y0 / 100, y1: y1 / 100, material, tag });
    /** A plan rectangle turned to (ux, uy): `len` along it from (x, y), `wid` across. */
    const bar = (x: number, y: number, ux: number, uy: number, len: number, wid: number, y0: number, y1: number, material: BuildingMaterial, tag: string) => {
      const vx = -uy * (wid / 2), vy = ux * (wid / 2);
      const ring = [[x + vx, y + vy], [x + ux * len + vx, y + uy * len + vy], [x + ux * len - vx, y + uy * len - vy], [x - vx, y - vy]].map(([a, b]) => M(a!, b!));
      prims.push({ type: "prism", ring, y0: y0 / 100, y1: y1 / 100, material, tag });
    };
    // the partitions (toilets' cubicles, light walls) are not in the wall grid: a light keeps off them too
    const partMask = P.map((pl) => {
      const m = new Uint8Array(g0.nx * g0.ny);
      for (const q of pl.partitions) {
        const xs = q.ring.map((p) => p.x), ys = q.ring.map((p) => p.y);
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += G.CELL) for (let y = Math.min(...ys); y <= Math.max(...ys); y += G.CELL) {
          const c = cellOf(g0, x, y);
          if (c >= 0 && inside({ x, y }, q.ring)) m[c] = 1;
        }
      }
      return m;
    });
    const solidAt = (k: number, x: number, y: number) => { const c = cellOf(g0, x, y); return c < 0 || P[k]!.walls.a[c] === 1 || partMask[k]![c] === 1; };
    const clear = (k: number, x: number, y: number, r: number) => !solidAt(k, x, y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].every(([dx, dy]) => !solidAt(k, x + dx! * r, y + dy! * r));
    const sight = (k: number, ax: number, ay: number, bx: number, by: number) => {
      const L = Math.hypot(bx - ax, by - ay);
      for (let s = 5; s < L; s += 5) if (solidAt(k, ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L)) return false;
      return true;
    };
    const STEP = 60, SPACING = 230;
    for (let k = 0; k < 4; k++) {
      const pl = P[k]!, above = P[k + 1]!, ceil = (k < 3 ? LEVELS[k + 1]! : ROOF) - 30;
      const openAbove = stairOpen.get(k < 3 ? LEVELS[k + 1]! : ROOF), openHere = stairOpen.get(LEVELS[k]!);
      const nearOpen = (x: number, y: number) => [openAbove, openHere].some((o) => o && [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]].some(([dx, dy]) => { const c = cellOf(g0, x + dx!, y + dy!); return c >= 0 && o[c] === 1; }));
      const placed: Array<[number, number]> = [];
      for (let y = g0.y0 + STEP / 2; y < g0.y0 + g0.ny * G.CELL; y += STEP) for (let x = g0.x0 + STEP / 2; x < g0.x0 + g0.nx * G.CELL; x += STEP) {
        const c = cellOf(g0, x, y);
        const hall = k === 2 && voidMask[c] === 1; // the beit midrash's height: its ceiling is the roof's
        // a covered space open to the street (the parking under the shtiblach) has its ceiling too: the storey over it decides
        if (c < 0 || (!pl.fp[c] && !(k === 0 && pl.outside[c] === 0 && above.fp[c])) || voidMask[c] && k === 3) continue;
        if (!hall && !above.fp[c]) continue; // no storey over it: a terrace's open sky
        if (!clear(k, x, y, 45) || nearOpen(x, y)) continue;
        if (devAt.some((d) => d.k === k && Math.hypot(d.x - x, d.y - y) < 50)) continue;
        if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < SPACING && sight(k, px, py, x, y))) continue;
        placed.push([x, y]);
        const tag = `light:downlight:${pl.name}`, cz = hall ? ROOF - 30 : ceil;
        disc(x, y, 11, cz - 1, cz, "metal", tag);
        box(x - 8, x + 8, y - 8, y + 8, cz - 1.6, cz - 0.6, "x", "lightPanel", tag);
      }
      lighting.perStorey.push(placed.length);
      lighting.downlights += placed.length;
    }

    // the Baccarat chandelier (BAC050009: 88 × 78 cm in the block): a canopy, its stem, two tiers of crystal on a ring of candle arms
    const chandelier = (x: number, y: number, ceil: number, bottom: number, tag: string) => {
      const top = bottom + 78;
      disc(x, y, 12, ceil - 7, ceil, "metal", tag);
      disc(x, y, 1.6, top, ceil - 7, "metal", tag, 8);
      disc(x, y, 9, bottom + 6, top, "glass", tag);
      disc(x, y, 20, bottom, bottom + 7, "glass", tag);
      // the crystal: hanging drops on three rings, each tier hung from a thin brass ring — drops lit by the candles read as the
      // block's glitter; solid glass bands read as a dark drum
      const tiers: Array<[number, number, number, number]> = [[42, bottom + 10, bottom + 38, 28], [31.5, bottom + 44, bottom + 66, 22], [20.5, bottom + 68, top, 14]];
      for (const [r, d0, d1, nd] of tiers) {
        band(x, y, r - 1.2, r + 1.2, d1 - 1.5, d1, "metal", tag);
        for (let j = 0; j < nd; j++) {
          const a = (j / nd) * 2 * Math.PI, dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r;
          const len = j % 2 ? (d1 - d0) * 0.75 : d1 - d0;
          disc(dx, dy, 1.1, d1 - len, d1 - 1.5, "glass", tag, 6);
          disc(dx, dy, 1.8, d1 - len - 3, d1 - len, "lightPanel" as BuildingMaterial, `${tag}:drop`, 6);
        }
      }
      disc(x, y, 42, bottom + 38, bottom + 40, "metal", tag, 28);
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * 2 * Math.PI + Math.PI / 8, ux = Math.cos(a), uy = Math.sin(a);
        bar(x, y, ux, uy, 38, 2.5, bottom + 40, bottom + 42.5, "metal", tag);
        const bx = x + ux * 37, by = y + uy * 37;
        box(bx - 2, bx + 2, by - 2, by + 2, bottom + 42.5, bottom + 51, "x", "lightPanel", tag);
      }
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * 2 * Math.PI, bx = x + Math.cos(a) * 26, by = y + Math.sin(a) * 26;
        box(bx - 1.8, bx + 1.8, by - 1.8, by + 1.8, bottom + 66, bottom + 73, "x", "lightPanel", tag);
      }
      lighting.chandeliers++;
    };
    // the one the ground plan places
    for (const p of P[0]!.pieces) {
      if (!p.insert || !/Baccarat/i.test(p.insert) || !p.at || p.path.length !== 0) continue;
      // the block's own lines lie away from its insertion point: its place is their middle
      const own = P[0]!.pieces.filter((q) => q.path[0] === p.insert && q.pts).flatMap((q) => q.pts!);
      if (!own.length) continue;
      const bx = (Math.min(...own.map((q) => q.x)) + Math.max(...own.map((q) => q.x))) / 2, by = (Math.min(...own.map((q) => q.y)) + Math.max(...own.map((q) => q.y))) / 2;
      if (!inFp(P[0]!, bx, by) || !inFp(P[1]!, bx, by)) continue;
      chandelier(bx, by, LEVELS[1]! - 30, LEVELS[1]! - 30 - 150, `light:chandelier:${P[0]!.name}`);
      lighting.chandelierAtBlock++;
    }
    // the beit midrash's height (the void over it, ceiling under the roof): the same type on a 4.5 m grid, clear of the void's edge
    {
      const pts: Array<[number, number]> = [];
      let sx = 0, sy = 0, nv = 0;
      for (let c = 0; c < voidMask.length; c++) if (voidMask[c]) { const x = g0.x0 + ((c % g0.nx) + 0.5) * G.CELL, y = g0.y0 + (Math.floor(c / g0.nx) + 0.5) * G.CELL; sx += x; sy += y; nv++; }
      const isVoid = (x: number, y: number) => { const c = cellOf(g0, x, y); return c >= 0 && voidMask[c] === 1; };
      if (nv) {
        const cx = sx / nv, cy = sy / nv;
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
          const x = cx + i * 450, y = cy + j * 450;
          if (isVoid(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => isVoid(x + dx! * 170, y + dy! * 170))) pts.push([x, y]);
        }
        if (!pts.length) pts.push([cx, cy]);
      }
      for (const [x, y] of pts) chandelier(x, y, ROOF - 30, 1160, "light:chandelier:hall");
    }

    // a lantern over each outside door: a dark bronze box on the wall's face, its glass lit
    const lanternAt: Array<[number, number, number]> = [];
    for (const d of doorHeads) {
      // the ground's doors only: an upper storey's outside door (the tower's, on its landings) opens on the stair's glazing, not a path
      if (d.k !== 0) continue;
      const X = d.along === "x" ? d.a : d.t, Y = d.along === "x" ? d.t : d.a;
      // a door onto a covered space (the parking under floor 1) gets no lantern: it is lit by that space's ceiling, and the
      // lantern showed through the north face's middle arch
      { const ox = d.along === "x" ? X : X + d.out * 60, oy = d.along === "x" ? Y + d.out * 60 : Y, c = cellOf(g0, ox, oy);
        if (c >= 0 && P[1]!.fp[c] === 1 && !courtOf().court[c]) { lighting.lanternsCovered++; continue; } }
      if (lanternAt.some(([x, y, top]) => Math.hypot(x - X, y - Y) < 120 && Math.abs(top - d.top) < 50)) continue;
      lanternAt.push([X, Y, d.top]);
      const tag = `light:lantern:${P[d.k]!.name}`;
      const [t0, t1] = d.out === 1 ? [d.t, d.t + 14] : [d.t - 14, d.t];
      const [l0, l1] = d.out === 1 ? [d.t + 14, d.t + 15.5] : [d.t - 15.5, d.t - 14];
      box(d.a - 14, d.a + 14, t0, t1, d.top + 16, d.top + 56, d.along, "darkSteel", tag);
      box(d.a - 10, d.a + 10, l0, l1, d.top + 21, d.top + 51, d.along, "lightPanel", `${tag}:lamp:lens`);
      lighting.lanterns++;
    }

    // the street's lamps: a pole on each sidewalk's kerb every 25 m, staggered across the road, its arm over the road
    for (const [off, toRoad, shift] of [[255, 1, 0], [1145, -1, 1250]] as const) {
      for (let s0 = -8000 + shift; s0 <= 5600; s0 += 2500) {
        // none in the drive into the parking: a pole that falls in it stands just past its south end instead
        const s = off === 255 && driveS && s0 > driveS[0] - 60 && s0 < driveS[1] + 60 ? driveS[1] + 80 : s0;
        if (s !== s0) report.lampMoved = `${(s0 / 100).toFixed(1)} → ${(s / 100).toFixed(1)} m (out of the parking's drive)`;
        const x = STREET.A.x + STREET.d.x * s + STREET.n.x * off, y = STREET.A.y + STREET.d.y * s + STREET.n.y * off;
        const ux = STREET.n.x * toRoad, uy = STREET.n.y * toRoad, tag = "street:lamp";
        disc(x, y, 13, 15, 60, "darkSteel", tag, 12);
        disc(x, y, 7, 60, 720, "darkSteel", tag, 12);
        bar(x, y, ux, uy, 150, 7, 705, 713, "darkSteel", tag);
        const hx = x + ux * 150, hy = y + uy * 150;
        bar(hx - ux * 30, hy - uy * 30, ux, uy, 60, 26, 692, 712, "darkSteel", tag);
        box(hx - 16, hx + 16, hy - 16, hy + 16, 690, 692, "x", "lightPanel", `${tag}:lamp:lens`);
        lighting.streetLamps++;
      }
    }
  }
  report.lighting = lighting;
  // the plans' rails (A-FLOR-HRAL) away from any stair's flights: a guard rail where the plan draws it (floor 1's, round the
  // ground stair's opening). Its height is not drawn: 1.05 m, the code's least. Each run once (the plan draws its two edges)
  {
    const stairBoxes = ((report.stairs as { stairs?: Array<{ box: string }> })?.stairs ?? []).map((st) => /X(-?\d+)\.\.(-?\d+) Y(-?\d+)\.\.(-?\d+)/.exec(st.box)).filter((m): m is RegExpExecArray => !!m).map((m) => [+m[1]!, +m[2]!, +m[3]!, +m[4]!] as const);
    const near = (q: Pt) => stairBoxes.some(([x0, x1, y0, y1]) => q.x > x0 - 80 && q.x < x1 + 80 && q.y > y0 - 80 && q.y < y1 + 80);
    let runs = 0;
    for (let k = 1; k < 5; k++) {
      const pl = P[k]!, L = pl.level, done: Array<{ ax: "x" | "y"; t: number; a0: number; a1: number }> = [];
      for (const p of pl.pieces) {
        if (p.layer !== "A-FLOR-HRAL" || !p.pts || p.pts.every(near)) continue;
        for (let j = 0; j + 1 < p.pts.length; j++) {
          const A = p.pts[j]!, B = p.pts[j + 1]!;
          const ax: "x" | "y" | null = Math.abs(A.y - B.y) < 1 ? "x" : Math.abs(A.x - B.x) < 1 ? "y" : null;
          if (!ax) continue;
          const [a0, a1] = ax === "x" ? [Math.min(A.x, B.x), Math.max(A.x, B.x)] : [Math.min(A.y, B.y), Math.max(A.y, B.y)];
          const t = ax === "x" ? A.y : A.x;
          if (a1 - a0 < 20) continue;
          if (done.some((d) => d.ax === ax && Math.abs(d.t - t) < 9 && d.a0 < a1 - 5 && a0 < d.a1 - 5)) continue;
          done.push({ ax, t, a0, a1 });
          const tag = `rail:guard:${pl.name}`;
          box(a0, a1, t - 3, t + 3, L + 100, L + 105, ax, "metal", tag);
          box(a0, a1, t - 1.5, t + 1.5, L + 8, L + 12, ax, "metal", tag);
          for (let u = a0 + 6; u < a1 - 3; u += 12) box(u - 0.8, u + 0.8, t - 0.8, t + 0.8, L + 12, L + 100, ax, "metal", tag);
          runs++;
        }
      }
    }
    report.guardRails = { runs, height: "1.05 (estimated)" };
  }
  report.systems = { crownPosts: posts, crownPostsDefaultHeight: postsDefault, fireCabinets: cabinets, diffusers, diffusersOverOpen: diffusersOpen,
    notBuilt: ["S-BEAM: lintels over the north arches and the east windows, inside the wall", "A-CLNG-SUSP: one small suspended ceiling of the ground storey, height not given", "light fixtures: the plans draw none but the ground's Baccarat block (E-LITE-EQPM holds only the air diffusers) — the lighting built is estimated (report.lighting)"] };
}
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify({ name: "דמשק אליעזר", primitives: prims, extent, north: { x: 0, z: 1 }, palette: { limestone: true, courseM: 0.26, golden: true } }));
fs.writeFileSync(path.join(out, "state.json"), JSON.stringify({ floors }));
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 7000));
console.log("primitives", prims.length);
