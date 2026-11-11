/**
 * Aviezri synagogue ("אבי עזרי", Rivki Broyer, sheets of 10.11.2026): the eTransmit's three DWGs read into one frame.
 *
 * Files (ODA → DXF): main = "אבי עזרי_להדמיה" (elevations, the sheets' furniture and dimensions), f000 = "basis/avi azri_ 0.00"
 * (the beit-midrash storey, +3.30), f100 = "basis/avi azri_+1" (the women's-gallery storey, +7.04).
 *
 * Frame ("rel", cm): each storey file moved so its outer walls (Rb_kir_hootz) start at 0,0 — both storeys share the same
 * outline exactly (31.45 × 30.63 m), so that is also their registration. The main file's furniture is drawn over each storey's
 * xref insert inside that sheet's viewport: it is moved by the same insert.
 *
 * Model: x = X/100, z = −Y/100, y up, metres from the existing kindergarten floor (±0.00).
 * Orientation, from the sheets' names fitted to the plan's openings (rule 1.20): plan up (+Y) = EAST, plan left (−X) = NORTH.
 *   "חזית מערבית" = the plan's bottom face (Y min): X = x − 12474 (six 91 cm windows on 124 cm centres match to the cm)
 *   "חזית צפונית" = the plan's left face (X min):  Y = x + 1009 (four 130 cm windows match to the cm; drawn mirrored as seen)
 *   "חזית מזרחית" = the plan's top face (Y max):   X = 9422 − x (two 130 cm windows, the ark arch on the hall's middle)
 */
import fs from "node:fs";
import path from "node:path";
import { flattenDxf, readDxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

export const F1_ORIGIN = { x: 10783.981456917649, y: -1677.6390204971538 }; // f000 outer-wall min corner
export const F2_ORIGIN = { x: 259.3633358203142, y: -3094.7514404909252 }; // f100 outer-wall min corner
/** The xref inserts the sheets' viewports show (identity rotation): main = raw + insert */
const INS_F1 = { x: -6545.778361680252, y: -961.180268604714 };
const INS_F2 = { x: -1792.7120625215377, y: 455.9321513890282 };
const VP_F1 = { cx: 6063, cy: -1079, w: 4642, h: 3293 };
const VP_F2 = { cx: 224, cy: -1094, w: 4642, h: 3293 };

export type Sheet = { id: "west" | "north" | "east"; title: string; box: [number, number, number, number];
  /** plan coordinate (rel cm) along the face from the sheet's x */ along: (x: number) => number;
  /** the face: which plan axis it runs along, and on which side the outside is */ axis: "x" | "y"; side: -1 | 1 };
export const ELEV_Y0 = -11519; // ±0.00 on all three sheets (cm, main file)
export const SHEETS: Sheet[] = [
  { id: "west", title: "חזית מערבית", box: [12100, 15900, -11800, -10000], along: (x) => x - 12474, axis: "x", side: -1 },
  { id: "north", title: "חזית צפונית", box: [-1400, 2400, -11800, -10000], along: (x) => x + 1009, axis: "y", side: -1 },
  { id: "east", title: "חזית מזרחית", box: [6000, 9800, -11800, -10000], along: (x) => 9422 - x, axis: "x", side: 1 },
];

const readPieces = (file: string) => flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(file)))!);
const moved = (p: DxfPiece, dx: number, dy: number): DxfPiece => {
  const m = (q: Pt): Pt => ({ x: q.x + dx, y: q.y + dy });
  return {
    ...p,
    ...(p.pts ? { pts: p.pts.map(m) } : {}),
    ...(p.rings ? { rings: p.rings.map((r) => r.map(m)) } : {}),
    ...(p.arc ? { arc: { ...p.arc, c: m(p.arc.c) } } : {}),
    ...(p.circle ? { circle: { ...p.circle, c: m(p.circle.c) } } : {}),
    ...(p.at ? { at: m(p.at) } : {}),
    ...(p.strokes ? { strokes: p.strokes.map(([a, b]) => [m(a), m(b)] as [Pt, Pt]) } : {}),
    ...(p.m ? { m: { ...p.m, e: p.m.e + dx, f: p.m.f + dy } } : {}),
  };
};
export const anchor = (p: DxfPiece): Pt | null => p.at ?? p.arc?.c ?? p.circle?.c ?? p.pts?.[0] ?? p.rings?.[0]?.[0] ?? null;
const inVp = (p: DxfPiece, vp: typeof VP_F1) => { const a = anchor(p); return !!a && Math.abs(a.x - vp.cx) < vp.w / 2 && Math.abs(a.y - vp.cy) < vp.h / 2; };

export type Read = { f1: DxfPiece[]; f2: DxfPiece[]; main: DxfPiece[]; elev: Map<Sheet["id"], DxfPiece[]>; counts: Record<string, number> };
export function readAviezri(dir: string): Read {
  const main = readPieces(path.join(dir, "main.dxf"));
  const f000 = readPieces(path.join(dir, "f000.dxf"));
  const f100 = readPieces(path.join(dir, "f100.dxf"));
  // main → rel: main − insert − origin
  const ovl1 = main.filter((p) => inVp(p, VP_F1)).map((p) => ({ ...moved(p, -INS_F1.x - F1_ORIGIN.x, -INS_F1.y - F1_ORIGIN.y), overlay: true }));
  const ovl2 = main.filter((p) => inVp(p, VP_F2)).map((p) => ({ ...moved(p, -INS_F2.x - F2_ORIGIN.x, -INS_F2.y - F2_ORIGIN.y), overlay: true }));
  const f1 = [...f000.map((p) => moved(p, -F1_ORIGIN.x, -F1_ORIGIN.y)), ...ovl1];
  const f2 = [...f100.map((p) => moved(p, -F2_ORIGIN.x, -F2_ORIGIN.y)), ...ovl2];
  const elev = new Map<Sheet["id"], DxfPiece[]>();
  for (const s of SHEETS) elev.set(s.id, main.filter((p) => { const a = anchor(p); return !!a && a.x > s.box[0] && a.x < s.box[1] && a.y > s.box[2] && a.y < s.box[3]; }));
  return { f1, f2, main, elev, counts: { main: main.length, f000: f000.length, f100: f100.length, overlayF1: ovl1.length, overlayF2: ovl2.length } };
}
export const M = (q: Pt): [number, number] => [q.x / 100, -q.y / 100];
