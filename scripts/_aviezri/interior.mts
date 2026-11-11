/**
 * Aviezri — the inside, from the plans' own blocks (free). Every block instance on the two storey plans (the furniture overlay
 * from the main file and each storey's own) is read in its block's local frame and built as the thing its geometry draws: the
 * pews (their drawn seats, back and shtender), the bimot, the arks between their columns, the amudim, the rav's chair, tables
 * and their chairs, bookcases, the WCs, urinals, taps, troughs, the kitchenettes, coat hooks, floor grates, the door leaves at
 * their drawn swing, the stairs from their treads. What is not built is named in the tally with the reason.
 */
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { CELL, rects, type Grid } from "../_breuer/grid.mts";
import { instancesOf, inv, ap, ptsOf, type Inst } from "./instances.mts";
import { heb } from "./heb.mts";

type Mx = Inst["m"];
type Door = { hinge: Pt; dir: Pt; w: number; storey: string; open: Pt };
export type Storey = { id: "f1" | "f2"; ps: DxfPiece[]; floor: number; g: Grid; wall: Uint8Array; doors: Door[]; doorCell: Int32Array };
type Tally = { read: number; built: number; merged: number; dropped: number; why: string[] };
type BB = { x0: number; x1: number; y0: number; y1: number };

const isOverlay = (p: DxfPiece) => !!(p as { overlay?: boolean }).overlay;
const bbOf = (pts: Pt[]): BB => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) });
const geo = (c: DxfPiece) => c.type !== "TEXT" && c.type !== "MTEXT" && c.type !== "ATTRIB" && c.type !== "INSERT";
const STAIR_L = /^(Rb_nistar_tachton|RB_mabat_5|Rb_nistar_elyon)$/;

/** A part in a block's local frame: x0..x1, y0..y1 (local cm), z0..z1 (cm over the floor). */
type Part = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; mat: BuildingMaterial; round?: number };
const P = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: BuildingMaterial, round?: number): Part =>
  ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0, z1, mat, round });

// ---------------------------------------------------------------------------------------------------------------------
// Stairs: treads (the stair layers' blocks, both storeys' drawings joined) in rows; two rows side by side are a U stair.
// ---------------------------------------------------------------------------------------------------------------------
export type Stair = { rows: Array<{ treads: BB[]; axis: "x" | "y"; cross: [number, number] }>; landing: BB | null; landingDrawn: boolean; foot: BB[]; order: string };
export function readStairs(storeys: Storey[], say: (s: string) => void): Stair[] {
  const treads: BB[] = [], lands: BB[] = [], upper = new Set<string>();
  for (const st of storeys) for (const it of instancesOf(st.ps)) {
    if (it.overlay || !it.children.length) continue;
    const ls = new Set(it.children.filter(geo).map((c) => c.layer));
    if (!ls.size || ![...ls].every((l) => STAIR_L.test(l))) continue;
    const pts = it.children.filter(geo).flatMap(ptsOf); if (!pts.length) continue;
    const b = bbOf(pts); const w = b.x1 - b.x0, d = b.y1 - b.y0;
    if (Math.min(w, d) < 5 || Math.max(w, d) > 400) continue;
    const key = (q: BB) => `${Math.round(q.x0 / 3)}:${Math.round(q.y0 / 3)}:${Math.round(q.x1 / 3)}:${Math.round(q.y1 / 3)}`;
    // a tread drawn "hidden above" on the lower storey belongs to the upper flight
    if (st.id === "f1" && [...ls].every((l) => l === "Rb_nistar_elyon")) upper.add(key(b));
    const list = Math.min(w, d) >= 100 ? lands : treads;
    if (!list.some((q) => key(q) === key(b))) list.push(b);
  }
  // rows: treads of the same cross range, stacked along the other axis
  const rows = new Map<string, { treads: BB[]; axis: "x" | "y"; cross: [number, number] }>();
  for (const t of treads) {
    const axis: "x" | "y" = t.x1 - t.x0 < t.y1 - t.y0 ? "x" : "y"; // the axis the flight climbs along (the tread's short side)
    const cross: [number, number] = axis === "x" ? [t.y0, t.y1] : [t.x0, t.x1];
    const k = `${axis}:${Math.round(cross[0] / 4)}:${Math.round(cross[1] / 4)}`;
    const r = rows.get(k) ?? { treads: [], axis, cross }; r.treads.push(t); rows.set(k, r);
  }
  const lo = (b: BB, a: "x" | "y") => (a === "x" ? b.x0 : b.y0), hi = (b: BB, a: "x" | "y") => (a === "x" ? b.x1 : b.y1);
  for (const r of rows.values()) r.treads.sort((a, b) => lo(a, r.axis) - lo(b, r.axis));
  const used = new Set<string>(), out: Stair[] = [];
  const rs = [...rows.entries()].filter(([, r]) => r.treads.length >= 3);
  for (const [k, r] of rs) {
    if (used.has(k)) continue; used.add(k);
    const group = [r];
    for (const [k2, r2] of rs) if (!used.has(k2) && r2.axis === r.axis && (Math.abs(r2.cross[0] - r.cross[1]) <= 15 || Math.abs(r.cross[0] - r2.cross[1]) <= 15)) { used.add(k2); group.push(r2); }
    const all = group.flatMap((g) => g.treads), fb = bbOf(all.flatMap((b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]));
    const landing = lands.filter((L) => L.x0 <= fb.x1 + 10 && L.x1 >= fb.x0 - 10 && L.y0 <= fb.y1 + 10 && L.y1 >= fb.y0 - 10);
    const land = landing.length ? bbOf(landing.flatMap((b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }])) : null;
    // the lower flight: the row the lower storey draws below its cut (not "hidden above")
    const key = (q: BB) => `${Math.round(q.x0 / 3)}:${Math.round(q.y0 / 3)}:${Math.round(q.x1 / 3)}:${Math.round(q.y1 / 3)}`;
    const up = (g: (typeof group)[number]) => g.treads.filter((t) => upper.has(key(t))).length / g.treads.length;
    group.sort((a, b) => up(a) - up(b) || b.cross[0] - a.cross[0]);
    const order = group.length > 1 && up(group[0]!) === up(group[1]!) ? "the first flight is assumed (the plans draw both alike)" : "the first flight is the one the lower plan draws below its cut";
    out.push({ rows: group, landing: land, landingDrawn: !!land, foot: [...all, ...(land ? [land] : [])], order });
    void hi;
  }
  say(`stairs: ${out.length} (${out.map((s) => s.rows.map((r) => r.treads.length).join("+")).join(", ")} treads)`);
  return out;
}
export const inFoot = (s: Stair[], X: number, Y: number) => s.some((st) => st.foot.some((b) => X >= b.x0 && X <= b.x1 && Y >= b.y0 && Y <= b.y1));

// ---------------------------------------------------------------------------------------------------------------------
export function buildInterior(ctx: {
  storeys: Storey[]; stairs: Stair[]; voidRegions: Set<number>; claimed: Map<Storey, Uint8Array>;
  levels: { f1: number; f2: number }; slab: number; roofOf: (X: number, Y: number) => number;
  prims: Primitive[]; T: (k: string) => Tally; say: (s: string) => void;
}) {
  const { storeys, stairs, voidRegions, claimed, levels, slab, roofOf, prims, T, say } = ctx;
  const F2 = storeys.find((s) => s.id === "f2")!;
  const tag = (k: string) => `inside:furniture:${k}`;
  // a local part placed by an instance's matrix: its middle through m, its size along m's axes, turned as m turns
  const place = (m: Mx, level: number, parts: Part[], kind: string) => {
    const su = Math.hypot(m.a, m.b), sv = Math.hypot(m.c, m.d), rotY = Math.atan2(m.b, m.a);
    for (const p of parts) {
      if (p.x1 - p.x0 < 0.2 || p.y1 - p.y0 < 0.2 || p.z1 - p.z0 < 0.2) continue;
      const c = ap(m, { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 });
      prims.push({ type: "box", centre: { x: c.x / 100, y: level + (p.z0 + p.z1) / 200, z: -c.y / 100 }, size: { x: ((p.x1 - p.x0) * su) / 100, y: (p.z1 - p.z0) / 100, z: ((p.y1 - p.y0) * sv) / 100 }, material: p.mat, tag: tag(kind), ...(Math.abs(rotY) > 1e-4 ? { rotY } : {}), ...(p.round ? { round: p.round / 100 } : {}) });
    }
  };
  const ID: Mx = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const placeWorld = (level: number, parts: Part[], kind: string) => place(ID, level, parts, kind);
  const cyl = (X: number, Y: number, level: number, r: number, z0: number, z1: number, mat: BuildingMaterial, kind: string) =>
    prims.push({ type: "cylinder", centre: { x: X / 100, y: level + (z0 + z1) / 200, z: -Y / 100 }, radius: r / 100, height: (z1 - z0) / 100, material: mat, tag: tag(kind) });

  const count = new Map<string, number>(), notBuilt: string[] = [], assume = new Set<string>();
  const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  const consumed = new Set<DxfPiece>();

  for (const st of storeys) {
    const lv = st.floor;
    const g = st.g;
    const wallAt = (X: number, Y: number) => { const i = Math.floor((X - g.x0) / CELL), j = Math.floor((Y - g.y0) / CELL); return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? true : !!st.wall[j * g.nx + i] || !!g.line[j * g.nx + i] || !!g.outside[j * g.nx + i]; };
    const insts = instancesOf(st.ps);
    const tables: Array<{ c: Pt; it: Inst }> = [];
    for (const it of insts) {
      const ins = st.ps.find((p) => p.insert === it.name && p.m === it.m);
      if (ins && consumed.has(ins)) { it.children.forEach((c) => consumed.add(c)); continue; }
      const kids = it.children, own = kids.filter(geo);
      if (!own.length) continue;
      const mi = inv(it.m);
      const loc = (c: DxfPiece) => bbOf(ptsOf(c).map((q) => ap(mi, q)));
      const all = bbOf(own.flatMap((c) => ptsOf(c).map((q) => ap(mi, q))));
      const W = all.x1 - all.x0, D = all.y1 - all.y0;
      const layers = new Set(own.map((c) => c.layer));
      const direct = kids.filter((c) => c.path.length === it.path.length + 1);
      const texts = direct.filter((c) => c.text).map((c) => heb(c.text!)).join(" ");
      const hasIns = direct.some((c) => c.insert);
      const nested = (name: string) => insts.filter((q) => q !== it && q.path.length === it.path.length + 1 && q.path[it.path.length] === it.name && q.name === name && kids.some((c) => c.insert === name && c.m === q.m));
      const take = (kind: string) => { kids.forEach((c) => consumed.add(c)); bump(kind); if (process.env.IDBG) console.log("IDBG", st.id, it.name, kind, it.path.join(">"), it.m.e.toFixed(0), it.m.f.toFixed(0)); };
      const closedRects = own.filter((c) => c.pts && c.closed && !c.rings).map((c) => ({ c, b: loc(c) }));
      const only = (re: RegExp) => [...layers].every((l) => re.test(l));

      // ---- annotation, structure and openings: read elsewhere or not things ----
      if (only(/midot|text|miflasim|Defpoints/i)) { take("note"); continue; }
      if (only(/^Rb_h_kayam$/) && W <= 80 && D <= 40) { take("note"); continue; } // a level tag's box
      if (only(STAIR_L)) { take("stair-tread"); continue; }
      if (only(/kir_pnim|kir_hootz|ptachim|h_mitar|mabat_2|nistar|mabat_3|mabat_5|^0$/i) && ![...layers].some((l) => /rihut|sanitary|tzeva/i.test(l))) {
        take([...layers].some((l) => /ptachim/i.test(l)) ? (kids.some((c) => c.arc && c.arc.r >= 50) ? "door" : "window") : "wall"); continue;
      }

      // ---- named blocks of the furniture library ----
      if (it.name === "Bima XL") {
        // platform, its rail round the four sides (open at the side steps), the two side steps, the reading table, a lectern
        const parts: Part[] = [P(-115, 115, 10, 240, 0, 45, "timber"), P(-113, 113, 12, 238, 45, 46, "floorOak")];
        for (const [y0, y1] of [[0, 10], [240, 250]] as const) parts.push(P(-125, 125, y0, y1, 0, 100, "walnut", 1), P(-127, 127, y0 - 1, y1 + 1, 100, 106, "walnut", 2));
        for (const x of [-1, 1]) for (const [y0, y1] of [[0, 65], [185, 250]] as const) parts.push(P(x * 115, x * 125, y0, y1, 0, 100, "walnut", 1), P(x * 114, x * 126, y0, y1, 100, 106, "walnut", 2));
        for (const x of [-1, 1]) parts.push(P(x * 115, x * 146, 65, 185, 0, 15, "timber"), P(x * 115, x * 130, 65, 185, 15, 30, "timber"));
        parts.push(P(-110, 110, 195, 240, 45, 145, "walnut"), P(-112, 112, 193, 242, 145, 149, "velvet", 1), P(-50, 50, 12, 70, 45, 150, "walnut"), P(-52, 52, 10, 72, 150, 154, "velvet", 1));
        place(it.m, lv, parts, "bimah"); take("bimah"); continue;
      }
      if (/Bima XS/.test(it.name)) {
        place(it.m, lv, [P(-55, 51, -95, 0, 0, 100, "walnut"), P(-57, 53, -97, 2, 100, 104, "velvet", 1), P(-55, 51, -163, -108, 0, 18, "timber")], "bimah-small");
        take("bimah-small"); continue;
      }
      if (/Amud chazan/.test(it.name)) {
        place(it.m, lv, [P(-32, 34, -66, 0, 0, 102, "walnut"), P(-34, 36, -68, 2, 102, 106, "walnut", 1), P(-28, 30, -64, -6, 106, 110, "velvet", 1), P(-30, 32, -112, -72, 0, 15, "timber"), P(-32, 34, 0, 28, 0, 95, "walnut"), P(-28, 30, 27, 29, 40, 90, "upholsteryAccent")], "amud");
        take("amud"); continue;
      }
      if (it.name === "rav") {
        place(it.m, lv, [P(-23, 23, -52, -9, 0, 44, "walnut"), P(-23, 23, -52, -9, 44, 52, "velvet", 3), P(-30, 30, -9, 0, 0, 135, "walnut", 2), P(-24, 24, -11, -9, 55, 125, "velvet", 2),
          P(-33, -23, -55, -9, 0, 68, "walnut", 2), P(23, 33, -55, -9, 0, 68, "walnut", 2), P(-18, 18, -94, -64, 0, 108, "walnut"), P(-20, 20, -96, -62, 108, 112, "walnut", 1)], "rav-chair");
        take("rav-chair"); continue;
      }
      if (/ארון קודש/.test(texts) || nested("amood_a").length) {
        // the ark between its two columns: the doors' X (h_mitar) gives the ark, the columns (amood_a) its front
        const diag = own.filter((c) => /h_mitar/.test(c.layer)).map(loc);
        const ark = diag.length ? bbOf(diag.flatMap((b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }])) : { x0: -60, x1: 60, y0: 0, y1: D * 0.8 };
        const cols = nested("amood_a").map((q) => ap(mi, { x: q.m.e, y: q.m.f }));
        const front = cols.length && cols[0]!.y < (ark.y0 + ark.y1) / 2 ? -1 : 1;
        const Fy = front > 0 ? ark.y1 + 2 : ark.y0 - 2, By = front > 0 ? all.y0 : all.y1;
        const H = 250;
        const parts: Part[] = [P(ark.x0, ark.x1, By, Fy, 0, H, "walnut"), P(ark.x0 + 10, ark.x1 - 10, Fy, Fy + front * 2.5, 25, H - 20, "velvet"),
          P(ark.x0 + 10, ark.x1 - 10, Fy + front * 2.5, Fy + front * 3, 25, 37, "upholsteryAccent"), P(ark.x0 + 10, ark.x1 - 10, Fy + front * 2.5, Fy + front * 3, H - 40, H - 32, "upholsteryAccent"),
          P(-14, 14, Fy + front * 2.5, Fy + front * 3, 150, 190, "upholsteryAccent"), P(ark.x0 + 6, ark.x1 - 6, Fy + front * 3, Fy + front * 6, H - 20, H - 16, "metal")];
        // the side cabinets the block draws beside the ark
        for (const r of closedRects.filter((r) => /rihut/.test(r.c.layer) && r.b.x1 - r.b.x0 >= 40 && (r.b.x1 <= ark.x0 + 2 || r.b.x0 >= ark.x1 - 2))) parts.push(P(r.b.x0, r.b.x1, r.b.y0, r.b.y1, 0, 200, "walnut"), P(r.b.x0, r.b.x1, r.b.y0, r.b.y1, 200, 204, "walnut", 1));
        parts.push(P(all.x0, all.x1, By, front > 0 ? all.y1 : all.y0, 290, 320, "walnut", 1), P(ark.x0, ark.x1, By, Fy, H, 290, "walnut"), P(-30, 30, Fy, Fy + front * 4, 262, 286, "metal"));
        place(it.m, lv, parts, "ark");
        for (const q of cols) { const w = ap(it.m, q); cyl(w.x, w.y, lv, 8.5, 20, 280, "stone", "ark-column"); }
        for (const q of cols) place(it.m, lv, [P(q.x - 11.5, q.x + 11.5, q.y - 11, q.y + 11, 0, 20, "stone"), P(q.x - 11.5, q.x + 11.5, q.y - 11, q.y + 11, 280, 290, "stone")], "ark-column");
        take("ark"); assume.add("ark 2.5 m, its columns and crown to 3.2 m (heights not printed)"); continue;
      }
      if (it.name === "ch3") {
        // a chair: its seat (the inner outline), its back on the side away from the table it stands at
        // the block draws its chair turned inside itself: the chair’s own frame is its seat outline’s longest edge, in the world
        const seatPc = own.reduce((p, q) => { const A = loc(p), B = loc(q); return (B.x1 - B.x0) * (B.y1 - B.y0) < (A.x1 - A.x0) * (A.y1 - A.y0) ? q : p; });
        const wp = ptsOf(seatPc);
        // the chair's square: the longest straight edge of any of its outlines (the closing edge counts)
        let best = { l: 0, t: 0 };
        for (const c of own) { const q = ptsOf(c); for (let k = 0; k < q.length; k++) { const A = q[k]!, B = q[(k + 1) % q.length]!; const l = Math.hypot(B.x - A.x, B.y - A.y); if (l > best.l) best = { l, t: Math.atan2(B.y - A.y, B.x - A.x) }; } }
        const cen = { x: wp.reduce((q, v) => q + v.x, 0) / wp.length, y: wp.reduce((q, v) => q + v.y, 0) / wp.length };
        const fm: Mx = { a: Math.cos(best.t), b: Math.sin(best.t), c: -Math.sin(best.t), d: Math.cos(best.t), e: cen.x, f: cen.y };
        const fi = inv(fm), s = bbOf(own.flatMap((c) => ptsOf(c)).map((q) => ap(fi, q)));
        const tb = tables.reduce<{ c: Pt; d: number } | null>((acc, t) => { const d = Math.hypot(t.c.x - cen.x, t.c.y - cen.y); return !acc || d < acc.d ? { c: t.c, d } : acc; }, null);
        const away = tb ? ap(fi, { x: cen.x + (cen.x - tb.c.x), y: cen.y + (cen.y - tb.c.y) }) : { x: 1, y: 0 };
        const ax = Math.abs(away.x) > Math.abs(away.y) ? "x" : "y", sg = (ax === "x" ? away.x : away.y) > 0 ? 1 : -1;
        const x0 = s.x0, x1 = s.x1, y0 = s.y0, y1 = s.y1;
        const parts: Part[] = [P(x0, x1, y0, y1, 42, 46, "walnut", 1), P(x0 + 1, x1 - 1, y0 + 1, y1 - 1, 46, 48, "upholstery", 1)];
        for (const [px, py] of [[x0 + 2, y0 + 2], [x1 - 4, y0 + 2], [x0 + 2, y1 - 4], [x1 - 4, y1 - 4]] as const) parts.push(P(px, px + 2.5, py, py + 2.5, 0, 42, "darkSteel"));
        parts.push(ax === "x" ? (sg > 0 ? P(x1 - 3, x1, y0, y1, 46, 88, "walnut", 1) : P(x0, x0 + 3, y0, y1, 46, 88, "walnut", 1)) : (sg > 0 ? P(x0, x1, y1 - 3, y1, 46, 88, "walnut", 1) : P(x0, x1, y0, y0 + 3, 46, 88, "walnut", 1)));
        place(fm, lv, parts, "chair"); take("chair"); continue;
      }
      if (direct.some((c) => c.insert === "ch3")) {
        // a table with its chairs (the chairs are their own ch3 blocks, built next)
        const top = closedRects.filter((r) => /rihut/.test(r.c.layer)).sort((a, b) => (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0))[0]?.b;
        if (top) {
          tables.push({ c: ap(it.m, { x: (top.x0 + top.x1) / 2, y: (top.y0 + top.y1) / 2 }), it });
          const parts: Part[] = [P(top.x0, top.x1, top.y0, top.y1, 72, 76, "walnut"), P(top.x0 + 6, top.x1 - 6, top.y0 + 6, top.y1 - 6, 64, 72, "walnut")];
          for (const [px, py] of [[top.x0 + 5, top.y0 + 5], [top.x1 - 10, top.y0 + 5], [top.x0 + 5, top.y1 - 10], [top.x1 - 10, top.y1 - 10]] as const) parts.push(P(px, px + 5, py, py + 5, 0, 64, "darkSteel"));
          place(it.m, lv, parts, "table");
          // the chair outlines drawn in the table block itself (not ch3) are the same chairs: consumed, not built twice
          own.forEach((c) => consumed.add(c)); bump("table");
        }
        continue; // its ch3 chairs come next in the walk
      }

      // a container of other blocks is not itself a thing: its blocks are read on their own
      if (hasIns && !direct.some((c) => c.insert === "berez p")) continue;
      // ---- pews: a row of drawn seats with a back strip and the shtender in front ----
      const seats = closedRects.filter((r) => /rihut/.test(r.c.layer) && r.c.pts!.length > 8 && r.b.x1 - r.b.x0 >= 36 && r.b.x1 - r.b.x0 <= 56 && r.b.y1 - r.b.y0 >= 36 && r.b.y1 - r.b.y0 <= 56);
      if (seats.length && D >= 95 && D <= 115 && only(/rihut|tzeva/i)) {
        const full = closedRects.filter((r) => r.b.x1 - r.b.x0 >= W - 2);
        const desk = full.find((r) => r.b.y1 - r.b.y0 >= 30 && r.b.y1 - r.b.y0 <= 50)?.b;
        const back = full.find((r) => r.b.y1 - r.b.y0 <= 4)?.b;
        if (desk && back) {
          const s = desk.y0 < back.y0 ? -1 : 1; // the sitter faces the desk: toward s
          const sy0 = Math.min(...seats.map((r) => r.b.y0)), sy1 = Math.max(...seats.map((r) => r.b.y1));
          const parts: Part[] = [P(all.x0 + 4, all.x1 - 4, sy0, sy1, 38, 43, "walnut", 1), P(back.x0, back.x1, Math.min(back.y0, back.y0 - s), Math.max(back.y1, back.y1 - s), 0, 94, "walnut", 1)];
          for (const r of seats) parts.push(P(r.b.x0 + 1, r.b.x1 - 1, r.b.y0 + 1, r.b.y1 - 1, 43, 48, "pewCushion", 2), P(r.b.x0 + 2, r.b.x1 - 2, s < 0 ? back.y0 - 4 : back.y1, s < 0 ? back.y0 : back.y1 + 4, 52, 88, "pewCushion", 2));
          for (const r of closedRects.filter((r) => r.b.x1 - r.b.x0 <= 8 && r.b.y1 - r.b.y0 >= 30)) parts.push(P(r.b.x0, r.b.x1, r.b.y0, r.b.y1 + (s > 0 ? 0 : 0), 0, 68, "walnut", 1));
          parts.push(P(all.x0 + 4, all.x1 - 4, sy0 + 4, sy1 - 4, 0, 38, "walnut")); // the apron under the seat
          // the shtender: its closed front away from the sitter, the sloped top read flat, a book shelf inside, two sides
          const fy = s > 0 ? desk.y1 : desk.y0;
          parts.push(P(desk.x0, desk.x1, fy - s * 2, fy, 0, 78, "walnut"), P(desk.x0, desk.x1, desk.y0, desk.y1, 74, 78, "walnut", 1), P(desk.x0, desk.x1, desk.y0 + 2, desk.y1 - 2, 48, 50, "walnut"),
            P(desk.x0, desk.x0 + 2.5, desk.y0, desk.y1, 0, 78, "walnut"), P(desk.x1 - 2.5, desk.x1, desk.y0, desk.y1, 0, 78, "walnut"), P(desk.x0, desk.x1, s > 0 ? desk.y0 : desk.y1 - 2, s > 0 ? desk.y0 + 2 : desk.y1, 78, 81, "walnut"));
          place(it.m, lv, parts, "pew"); take("pew"); count.set("pew-seat", (count.get("pew-seat") ?? 0) + seats.length); continue;
        }
      }
      // ---- bookcase along a wall: a 28–40 cm body with a 2 cm front strip ----
      if (only(/rihut|tzeva/i) && Math.min(W, D) >= 25 && Math.min(W, D) <= 45 && Math.max(W, D) >= 150) {
        const alongX = W > D, deep = alongX ? D : W;
        // its back: the long side nearer a wall
        const probe = (side: -1 | 1) => { let n = 0; for (let t = 0.1; t < 1; t += 0.1) { const lp = alongX ? { x: all.x0 + W * t, y: side < 0 ? all.y0 - 6 : all.y1 + 6 } : { x: side < 0 ? all.x0 - 6 : all.x1 + 6, y: all.y0 + D * t }; const w = ap(it.m, lp); if (wallAt(w.x, w.y)) n++; } return n; };
        const bs = probe(-1) >= probe(1) ? -1 : 1;
        const parts: Part[] = []; const H = 220;
        const R = (a0: number, a1: number, d0: number, d1: number, z0: number, z1: number, mat: BuildingMaterial, r?: number) => {
          const [b0, b1] = bs < 0 ? [(alongX ? all.y0 : all.x0) + d0, (alongX ? all.y0 : all.x0) + d1] : [(alongX ? all.y1 : all.x1) - d1, (alongX ? all.y1 : all.x1) - d0];
          parts.push(alongX ? P(a0, a1, b0, b1, z0, z1, mat, r) : P(b0, b1, a0, a1, z0, z1, mat, r));
        };
        const A0 = alongX ? all.x0 : all.y0, A1 = alongX ? all.x1 : all.y1, L = A1 - A0;
        R(A0, A1, 0, 2, 0, H, "walnut"); R(A0, A1, 0, deep, 0, 8, "walnut"); R(A0, A1, 0, deep + 1, H - 3, H, "walnut", 1);
        const bays = Math.max(1, Math.round(L / 90));
        for (let k = 0; k <= bays; k++) { const a = A0 + (L * k) / bays; R(Math.max(A0, a - 1.2), Math.min(A1, a + 1.2), 0, deep, 0, H, "walnut"); }
        const BIND: BuildingMaterial[] = ["velvet", "darkSteel", "walnut", "upholstery", "velvet", "darkSteel", "upholsteryAccent"];
        let seed = Math.round(L * 7 + deep * 13 + it.m.e);
        const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
        for (let z = 8; z + 30 <= H - 3; z += 36) {
          R(A0, A1, 0, deep - 1, z, z + 2, "walnut");
          for (let k = 0; k < bays; k++) {
            const a0 = A0 + (L * k) / bays + 2, a1 = A0 + (L * (k + 1)) / bays - 2;
            for (let a = a0; a < a1 - 2;) { const w = Math.min(a1 - a, 3 + rnd() * 4), h = 22 + rnd() * 9; if (rnd() > 0.06) R(a, a + w - 0.3, 3, Math.min(deep - 4, 24), z + 2, z + 2 + h, BIND[Math.floor(rnd() * BIND.length)]!); a += w; }
          }
        }
        place(it.m, lv, parts, "bookcase"); take("bookcase"); assume.add("bookcases 2.2 m high with open shelves (their height and fronts are not printed)"); continue;
      }
      // ---- a slatted strip (hatch lines every 8 cm, ~20 cm deep) beside a trough or a counter: a floor grate ----
      if (only(/tzeva/i) && Math.min(W, D) >= 15 && Math.min(W, D) <= 26 && own.length >= 10) {
        place(it.m, lv, [P(all.x0, all.x1, all.y0, all.y1, 0, 1.2, "darkSteel")], "grate"); take("grate");
        assume.add("the ~20 cm slatted strips beside troughs and the kitchenette read as floor grates (no legend)"); continue;
      }
      // ---- sanitary ----
      if (layers.has("_Defpoints") && W >= 70 && W <= 95 && D >= 120) {
        // a hung WC: its in-wall cistern's panel (the hatched strip), the bowl, its seat, the flush plate
        const pan = closedRects.find((r) => r.b.y1 - r.b.y0 <= 20 && r.b.x1 - r.b.x0 >= 70)?.b ?? { x0: -42, x1: 43, y0: -15, y1: 0 };
        const s = (all.y0 + all.y1) / 2 < (pan.y0 + pan.y1) / 2 ? -1 : 1; // the bowl stands toward the block's middle, off its panel
        const near = s < 0 ? pan.y0 : pan.y1;
        place(it.m, lv, [P(pan.x0, pan.x1, pan.y0, pan.y1, 0, 110, "ceramic"), P(-18, 18, near, near + s * 53, 26, 42, "ceramic", 12), P(-17, 17, near + s * 2, near + s * 50, 42, 45, "ceramic", 12), P(-11, 11, near, near + s * 1, 95, 110, "metal")], "wc");
        take("wc"); continue;
      }
      if (it.name === "rb_sherutei gvarim") {
        place(it.m, lv, [P(-19, 19, -32, 0, 48, 105, "ceramic", 8), P(-3, 3, -6, 0, 105, 125, "metal")], "urinal");
        take("urinal"); T("interior").why.push("each urinal's drawn 60×120 cm use zone is a clearance, not a thing: not built"); continue;
      }
      if (it.name === "berez p" || (kids.some((c) => c.insert === "berez p") && W <= 30 && D <= 30)) {
        const b = it.name === "berez p" ? all : bbOf(kids.filter((c) => c.insert === "berez p").flatMap((c) => ptsOf(c).map((q) => ap(mi, q))));
        void b; place(it.m, lv, [P(all.x0, all.x1, all.y0, all.y1, 100, 106, "metal", 1)], "tap"); take("tap"); continue;
      }
      if (/sink kitchen/.test(it.name)) {
        const bowl = closedRects.filter((r) => /sanitary/.test(r.c.layer)).sort((a, b) => (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0))[0]?.b ?? all;
        place(it.m, lv, [P(bowl.x0, bowl.x1, bowl.y0, bowl.y1, 90.2, 90.6, "stainless"), P(all.x0 + 2, all.x0 + 6, (bowl.y0 + bowl.y1) / 2 - 2, (bowl.y0 + bowl.y1) / 2 + 2, 90, 118, "metal")], "kitchen-sink");
        take("kitchen-sink"); continue;
      }
      if (layers.has("Rb_sanitary") && layers.has("_Defpoints")) {
        const bowl = closedRects.filter((r) => /sanitary/.test(r.c.layer)).sort((a, b) => (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0))[0]?.b;
        if (bowl) { place(it.m, lv, [P(bowl.x0, bowl.x1, bowl.y0, bowl.y1, 70, 86, "ceramic", 6)], "basin"); take("basin"); continue; }
      }
      if (only(/rihut/i) && W >= 65 && W <= 95 && D >= 65 && D <= 95 && own.some((c) => c.type === "LINE")) {
        const body = bbOf(own.filter((c) => c.type === "LINE").flatMap((c) => ptsOf(c).map((q) => ap(mi, q))));
        place(it.m, lv, [P(body.x0, body.x1, body.y0, body.y1, 0, 185, "stainless", 1)], "fridge"); take("fridge");
        assume.add("the 80×75 cm box by each kitchenette read as a fridge (no legend)"); continue;
      }
      if (only(/t-inst/i)) {
        place(it.m, lv, [P(all.x0, all.x1, all.y0, all.y1, 0, 0.8, "darkSteel")], "drain"); take("drain");
        T("interior").why.push(`"${texts}": an installation note, built as its floor drain's plate`); continue;
      }
      if (/sanitary/.test([...layers].join(" ")) && W <= 30 && D > 100) continue; // a group of taps: its taps come next
      if ([...layers].some((l) => /rihut|sanitary|tzeva/i.test(l))) {
        // a container of other blocks is not itself a thing; a block with drawing of its own that nothing above reads is reported
        const ownLoose = own.filter((c) => !consumed.has(c) && c.path.length === it.path.length + 1);
        if (ownLoose.length && !kids.some((c) => c.insert)) notBuilt.push(`${st.id} ${it.name} ${W.toFixed(0)}×${D.toFixed(0)} at ${it.m.e.toFixed(0)},${it.m.f.toFixed(0)} [${[...layers].join(" ")}]`);
      }
    }

    // ---- the furniture drawn loose (not as a block): troughs, counters, hooks, small cabinets ----
    const loose = st.ps.filter((p) => !consumed.has(p) && /^(Rb_rihut\.|Rb_sanitary)$/.test(p.layer) && p.pts && !p.insert && !p.text);
    const lb = loose.map((p) => ({ p, b: bbOf(p.pts!) }));
    const inside = (a: BB, b: BB) => a.x0 >= b.x0 - 1 && a.x1 <= b.x1 + 1 && a.y0 >= b.y0 - 1 && a.y1 <= b.y1 + 1 && (a.x1 - a.x0) * (a.y1 - a.y0) < (b.x1 - b.x0) * (b.y1 - b.y0);
    const worldParts = (b: BB, z0: number, z1: number, mat: BuildingMaterial, r?: number) => P(b.x0, b.x1, b.y0, b.y1, z0, z1, mat, r);
    for (const { p, b } of lb) {
      if (consumed.has(p)) continue;
      const w = b.x1 - b.x0, d = b.y1 - b.y0, mn = Math.min(w, d), mx = Math.max(w, d);
      if (p.layer === "Rb_sanitary") {
        if (lb.some((o) => o.p !== p && o.p.layer === "Rb_sanitary" && inside(b, o.b))) continue; // a basin: built with its trough
        if (mn >= 15) {
          // a trough (or its end shelf): a stone counter on the wall with its basins sunk in it
          const basins = lb.filter((o) => o.p !== p && o.p.layer === "Rb_sanitary" && inside(o.b, b));
          placeWorld(lv, [worldParts(b, 76, 86, "quartz", 1), ...basins.map((o) => worldParts(o.b, 86, 86.4, "ceramic")), worldParts({ x0: b.x0 + 2, x1: b.x1 - 2, y0: b.y0 + 2, y1: b.y1 - 2 }, 66, 76, "quartz")], "trough");
          consumed.add(p); basins.forEach((o) => consumed.add(o.p)); bump("trough"); continue;
        }
      } else {
        if (p.closed && mx <= 12) { placeWorld(lv, [worldParts(b, 160, 166, "metal", 1)], "hook"); consumed.add(p); bump("hook"); continue; }
        if (p.closed && mn >= 50 && mn <= 70 && mx >= 150) { placeWorld(lv, [worldParts(b, 0, 86, "cabinet"), worldParts({ x0: b.x0 - 1, x1: b.x1 + 1, y0: b.y0 - 1, y1: b.y1 + 1 }, 86, 90, "quartz")], "kitchen"); consumed.add(p); bump("kitchen-counter"); continue; }
        if (p.closed && mn >= 20 && mx <= 50) { placeWorld(lv, [worldParts(b, 0, 86, "cabinet")], "cabinet"); consumed.add(p); bump("cabinet"); assume.add("the 27×40 cm boxes at the troughs' ends built as low cabinets"); continue; }
        if (!p.closed && p.pts!.length === 3) {
          // a kitchenette's L: each leg's counter runs back to the wall behind it (probed on the grid), and the corner between
          const [A, B, C] = p.pts as [Pt, Pt, Pt];
          const depthTo = (a: Pt, b: Pt) => {
            const ux = b.x - a.x, uy = b.y - a.y, L = Math.hypot(ux, uy), nx = -uy / L, ny = ux / L, mxp = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            let best: { n: Pt; t: number } | null = null;
            for (const sg of [1, -1]) for (let t = 5; t <= 90; t += 5) if (wallAt(mxp.x + nx * sg * t, mxp.y + ny * sg * t)) { if (!best || t < best.t) best = { n: { x: nx * sg, y: ny * sg }, t }; break; }
            return best;
          };
          const legs: BB[] = [];
          for (const [a, b2] of [[A, B], [B, C]] as const) {
            const q = depthTo(a, b2); if (!q) continue;
            const far = [a, b2].map((v) => ({ x: v.x + q.n.x * q.t, y: v.y + q.n.y * q.t }));
            legs.push(bbOf([a, b2, ...far]));
          }
          if (legs.length === 2) legs.push(bbOf([{ x: Math.min(legs[0]!.x0, legs[1]!.x0), y: Math.min(legs[0]!.y0, legs[1]!.y0) }, { x: Math.max(legs[0]!.x1, legs[1]!.x1), y: Math.max(legs[0]!.y1, legs[1]!.y1) }].map((v) => v)) as BB);
          // the corner box is the union's box clipped to the legs' depth: keep only where both legs' depth bands meet
          const parts: Part[] = [];
          for (const L2 of legs.slice(0, 2)) parts.push(worldParts(L2, 0, 86, "cabinet"), worldParts(L2, 86, 90, "quartz"));
          if (legs.length === 3) { const [l1, l2] = legs as [BB, BB, BB]; const cx = l1.x1 - l1.x0 < l1.y1 - l1.y0 ? l1 : l2, cy = cx === l1 ? l2 : l1; const corner = { x0: cx.x0, x1: cx.x1, y0: cy.y0, y1: cy.y1 }; parts.push(worldParts(corner, 0, 86, "cabinet"), worldParts(corner, 86, 90, "quartz")); }
          placeWorld(lv, parts, "kitchen"); consumed.add(p); bump("kitchen-counter"); continue;
        }
      }
      if (mx > 3) notBuilt.push(`${st.id} loose ${p.layer} ${w.toFixed(0)}×${d.toFixed(0)} at ${b.x0.toFixed(0)},${b.y0.toFixed(0)}`);
    }

    // ---- the door leaves, open as each plan swings them ----
    for (const d of st.doors) {
      const ux = d.open.x - d.hinge.x, uy = d.open.y - d.hinge.y, L = Math.hypot(ux, uy);
      if (L < 40) continue;
      const m: Mx = { a: ux / L, b: uy / L, c: -uy / L, d: ux / L, e: d.hinge.x, f: d.hinge.y };
      place(m, lv, [P(2, L - 2, -2, 2, 1, 212, "walnut"), P(L - 12, L - 10, -5, 5, 100, 103, "metal")], "door-leaf");
      bump("door-leaf");
    }
  }

  // ---- floors and ceilings ----
  const wet = (st: Storey) => { const s = new Set<number>(); for (const p of prims) { if (!/inside:furniture:(wc|urinal)/.test(p.tag ?? "") || p.type !== "box") continue; if (Math.abs(p.centre.y - st.floor - 0.5) > 1) continue; const X = p.centre.x * 100, Y = -p.centre.z * 100; const i = Math.floor((X - st.g.x0) / CELL), j = Math.floor((Y - st.g.y0) / CELL); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const r = st.g.region[(j + dj) * st.g.nx + i + di]; if (r && st.g.regionDepth[r]! > 7) s.add(r); } } return s; };
  for (const st of storeys) {
    const g = st.g, cl = claimed.get(st)!, W = wet(st);
    const room = (k: number) => !g.outside[k] && !cl[k] && !st.wall[k] && !(st.id === "f2" && voidRegions.has(g.region[k]!)) && g.region[k]! > 0 && g.regionDepth[g.region[k]!]! > 7;
    for (const q of rects(g, room, (k) => (W.has(g.region[k]!) ? 1 : 0))) {
      const xa = (g.x0 + q.i0 * CELL) / 100, xb = (g.x0 + q.i1 * CELL) / 100, za = -(g.y0 + q.j1 * CELL) / 100, zb = -(g.y0 + q.j0 * CELL) / 100;
      prims.push({ type: "box", centre: { x: (xa + xb) / 2, y: st.floor + 0.004, z: (za + zb) / 2 }, size: { x: xb - xa, y: 0.008, z: zb - za }, material: q.key ? "floorWet" : "floorPorcelain", tag: `inside:floor:${st.id}` });
    }
    // ceilings: under the gallery storey's slab for the lower storey, under the roofs for the upper (the void's under the hall's roof)
    const g2 = F2.g;
    for (const q of rects(g, (k) => {
      if (g.outside[k] || cl[k]) return false;
      const X = g.x0 + ((k % g.nx) + 0.5) * CELL, Y = g.y0 + (Math.floor(k / g.nx) + 0.5) * CELL;
      if (inFoot(stairs, X, Y)) return false;
      if (st.id === "f1") { const i = Math.floor((X - g2.x0) / CELL), j = Math.floor((Y - g2.y0) / CELL), kk = j * g2.nx + i; return !voidRegions.has(g2.region[kk]!); }
      return true;
    }, (k) => { if (st.id === "f1") return 0; const X = g.x0 + ((k % g.nx) + 0.5) * CELL, Y = g.y0 + (Math.floor(k / g.nx) + 0.5) * CELL; return Math.round(roofOf(X, Y) * 100); })) {
      const top = st.id === "f1" ? levels.f2 - slab : q.key / 100 - slab;
      const xa = (g.x0 + q.i0 * CELL) / 100, xb = (g.x0 + q.i1 * CELL) / 100, za = -(g.y0 + q.j1 * CELL) / 100, zb = -(g.y0 + q.j0 * CELL) / 100;
      prims.push({ type: "box", centre: { x: (xa + xb) / 2, y: top - 0.01, z: (za + zb) / 2 }, size: { x: xb - xa, y: 0.02, z: zb - za }, material: "ceiling", tag: `inside:ceiling:${st.id}` });
    }
  }

  // ---- the stairs ----
  const rise = levels.f2 - levels.f1;
  for (const s of stairs) {
    const rows = s.rows, axis = rows[0]!.axis;
    const lo = (b: BB) => (axis === "x" ? b.x0 : b.y0), hi = (b: BB) => (axis === "x" ? b.x1 : b.y1);
    const fb = bbOf(s.foot.flatMap((b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]));
    // the landing: drawn, or at the flights' end whose free floor beyond is shorter (the stair's back wall)
    let land = s.landing;
    if (!land) {
      const g = storeys[0]!.g, st0 = storeys[0]!;
      const mid = axis === "x" ? (fb.y0 + fb.y1) / 2 : (fb.x0 + fb.x1) / 2;
      const free = (from: number, dir: 1 | -1) => { for (let t = 5; t < 400; t += 5) { const v = from + dir * t; const [X, Y] = axis === "x" ? [v, mid] : [mid, v]; const i = Math.floor((X - g.x0) / CELL), j = Math.floor((Y - g.y0) / CELL); if (st0.wall[j * g.nx + i] || g.line[j * g.nx + i]) return t; } return 400; };
      const fLo = free(axis === "x" ? fb.x0 : fb.y0, -1), fHi = free(axis === "x" ? fb.x1 : fb.y1, 1);
      // a landing is at least as deep as its flight is wide: the end with room for one, the shorter such (its back wall)
      const wide = Math.abs(rows[0]!.cross[1] - rows[0]!.cross[0]);
      const loEnd = fLo >= wide - 10 && (fHi < wide - 10 || fLo <= fHi) ? true : fHi >= wide - 10 ? false : fLo >= fHi;
      const depth = Math.min(loEnd ? fLo : fHi, wide);
      say(`  stair at ${fb.x0.toFixed(0)},${fb.y0.toFixed(0)}: free ${fLo} below, ${fHi} above → landing ${loEnd ? "below" : "above"} ${depth} cm`);
      land = loEnd
        ? (axis === "x" ? { x0: fb.x0 - depth, x1: fb.x0, y0: fb.y0, y1: fb.y1 } : { x0: fb.x0, x1: fb.x1, y0: fb.y0 - depth, y1: fb.y0 })
        : (axis === "x" ? { x0: fb.x1, x1: fb.x1 + depth, y0: fb.y0, y1: fb.y1 } : { x0: fb.x0, x1: fb.x1, y0: fb.y1, y1: fb.y1 + depth });
      s.foot.push(land);
      assume.add(`a stair's landing placed at the end with the wall behind it (${(depth / 100).toFixed(2)} m deep; not drawn)`);
    }
    const landAtHi = lo(land) >= (axis === "x" ? fb.x0 + (fb.x1 - fb.x0) / 2 : fb.y0 + (fb.y1 - fb.y0) / 2);
    const nT = rows.reduce((a, r) => a + r.treads.length, 0), nR = nT + rows.length;
    const h = rise / nR;
    let k = 0;
    const tread = (b: BB, top: number, mat: BuildingMaterial) => prims.push({ type: "box", centre: { x: (b.x0 + b.x1) / 200, y: (levels.f1 + top) / 2, z: -(b.y0 + b.y1) / 200 }, size: { x: (b.x1 - b.x0) / 100, y: top - levels.f1, z: (b.y1 - b.y0) / 100 }, material: mat, tag: "inside:stair" });
    rows.forEach((r, ri) => {
      // the first flight climbs toward the landing, the second away from it
      const towardLand = ri === 0;
      const seq = [...r.treads].sort((a, b) => (towardLand === landAtHi ? lo(a) - lo(b) : lo(b) - lo(a)));
      for (const t of seq) { k++; tread(t, levels.f1 + k * h, "floorStone"); }
      if (ri === 0) { k++; tread(land!, levels.f1 + k * h, "floorStone"); }
    });
    // between the two flights: a balustrade (a wall in the gap the plan leaves, else a glass panel stepped with the treads)
    if (rows.length === 2) {
      const [a, b] = rows as [typeof rows[0], typeof rows[0]];
      const g0 = Math.min(a.cross[1], b.cross[1]), g1 = Math.max(a.cross[0], b.cross[0]);
      const gap = g1 - g0 >= 4 ? [g0, g1] : [Math.max(a.cross[0], b.cross[0]) - 1.5, Math.max(a.cross[0], b.cross[0]) + 1.5];
      const span = [Math.min(...rows.flatMap((r) => r.treads.map(lo))), Math.max(...rows.flatMap((r) => r.treads.map(hi)))];
      const n = 12;
      for (let q = 0; q < n; q++) {
        const u0 = span[0]! + ((span[1]! - span[0]!) * q) / n, u1 = span[0]! + ((span[1]! - span[0]!) * (q + 1)) / n;
        const um = (u0 + u1) / 2, fr = landAtHi ? (um - span[0]!) / (span[1]! - span[0]!) : (span[1]! - um) / (span[1]! - span[0]!);
        const topA = levels.f1 + rise * (fr * (a.treads.length + 1)) / nR, topB = levels.f1 + rise * (1 - (fr * (b.treads.length + 1)) / nR);
        const top = Math.max(topA, topB) + 0.95;
        const bb = axis === "x" ? { x0: u0, x1: u1, y0: gap[0]!, y1: gap[1]! } : { x0: gap[0]!, x1: gap[1]!, y0: u0, y1: u1 };
        const glass = g1 - g0 < 4;
        prims.push({ type: "box", centre: { x: (bb.x0 + bb.x1) / 200, y: (levels.f1 + top) / 2, z: -(bb.y0 + bb.y1) / 200 }, size: { x: (bb.x1 - bb.x0) / 100, y: top - levels.f1, z: (bb.y1 - bb.y0) / 100 }, material: glass ? "railGlass" : "plaster", tag: "inside:stair-rail" });
        prims.push({ type: "box", centre: { x: (bb.x0 + bb.x1) / 200, y: top + 0.025, z: -(bb.y0 + bb.y1) / 200 }, size: { x: Math.max(0.05, (bb.x1 - bb.x0) / 100), y: 0.05, z: Math.max(0.05, (bb.y1 - bb.y0) / 100) }, material: "walnut", tag: "inside:stair-rail" });
      }
    }
    // round the opening on the upper storey: a 1.05 m guard on every edge that meets its floor, but the second flight's head
    {
      const g = F2.g, top = bbOf(s.foot.flatMap((b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]));
      const r2 = rows[1];
      const floorAt = (X: number, Y: number) => { const i = Math.floor((X - g.x0) / CELL), j = Math.floor((Y - g.y0) / CELL), k = j * g.nx + i; return !g.outside[k] && !F2.wall[k] && !g.line[k]; };
      const headLo = r2 ? !landAtHi : null; // the second flight climbs away from the landing: its head is at the far end
      const edges: Array<{ b: BB; head: boolean }> = [
        { b: { x0: top.x0 - 4, x1: top.x0, y0: top.y0, y1: top.y1 }, head: axis === "x" && headLo === true },
        { b: { x0: top.x1, x1: top.x1 + 4, y0: top.y0, y1: top.y1 }, head: axis === "x" && headLo === false },
        { b: { x0: top.x0, x1: top.x1, y0: top.y0 - 4, y1: top.y0 }, head: axis === "y" && headLo === true },
        { b: { x0: top.x0, x1: top.x1, y0: top.y1, y1: top.y1 + 4 }, head: axis === "y" && headLo === false },
      ];
      for (const e of edges) {
        // along the edge, the stretch whose outside is the storey's floor (the head: only the first flight's part of it)
        const alongX = e.b.x1 - e.b.x0 > e.b.y1 - e.b.y0;
        const a0 = alongX ? e.b.x0 : e.b.y0, a1 = alongX ? e.b.x1 : e.b.y1;
        const out = (alongX ? (e.b.y0 < top.y0 ? -12 : 12) : (e.b.x0 < top.x0 ? -12 : 12));
        let run0: number | null = null;
        const flush = (to: number) => {
          if (run0 == null || to - run0 < 20) { run0 = null; return; }
          const bb = alongX ? { x0: run0, x1: to, y0: e.b.y0, y1: e.b.y1 } : { x0: e.b.x0, x1: e.b.x1, y0: run0, y1: to };
          prims.push({ type: "box", centre: { x: (bb.x0 + bb.x1) / 200, y: levels.f2 + 0.5, z: -(bb.y0 + bb.y1) / 200 }, size: { x: (bb.x1 - bb.x0) / 100, y: 1.0, z: (bb.y1 - bb.y0) / 100 }, material: "railGlass", tag: "inside:stair-guard" });
          prims.push({ type: "box", centre: { x: (bb.x0 + bb.x1) / 200, y: levels.f2 + 1.025, z: -(bb.y0 + bb.y1) / 200 }, size: { x: Math.max(0.05, (bb.x1 - bb.x0) / 100), y: 0.05, z: Math.max(0.05, (bb.y1 - bb.y0) / 100) }, material: "walnut", tag: "inside:stair-guard" });
          count.set("stair-guard", (count.get("stair-guard") ?? 0) + 1); run0 = null;
        };
        for (let a = a0; a <= a1; a += 5) {
          const mid = alongX ? (e.b.y0 + e.b.y1) / 2 : (e.b.x0 + e.b.x1) / 2;
          const [X, Y] = alongX ? [a, mid + out] : [mid + out, a];
          const inHead = e.head && r2 && a >= r2.cross[0] - 2 && a <= r2.cross[1] + 2;
          const open = floorAt(X, Y) && !inHead;
          if (open && run0 == null) run0 = a; else if (!open) flush(a);
        }
        flush(a1);
      }
    }
    assume.add(`stairs: ${s.order}; risers of ${(h * 100).toFixed(1)} cm (${nR} from +${levels.f1.toFixed(2)} to +${levels.f2.toFixed(2)})`);
    count.set("stair", (count.get("stair") ?? 0) + 1);
  }

  const t = T("interior");
  for (const [k, v] of count) { if (k === "note" || k === "wall" || k === "window" || k === "door" || k === "stair-tread") t.merged += v; else t.built += v; }
  t.why.push(...[...count].map(([k, v]) => `${k} ${v}`), ...[...assume].map((a) => `assumed: ${a}`));
  for (const n of notBuilt) { t.dropped++; t.why.push(`not built: ${n}`); }
  say(`interior: ${[...count].map(([k, v]) => `${k} ${v}`).join(", ")}; not built ${notBuilt.length}`);
  for (const n of notBuilt) say(`  not built: ${n}`);
  return { count: Object.fromEntries(count), notBuilt, assumed: [...assume] };
}
