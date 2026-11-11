/**
 * Breuer 21 (Bnei Brak) — reading the execution DXF into storeys in one frame.
 * Every storey tab of the main drawing is a copy of the same plot boundary block ("גבולות מעודכנים") at a different place; its
 * insert point is the storey's origin. Drawing units are cm (the header's mm is wrong): model x = local x / 100, model z = −local y / 100.
 */
import fs from "node:fs";
import { flattenDxf, readDxfDrawing, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

export type StoreyId = "מרתף" | "שיפוע" | "ק" | "א" | "ב" | "ג" | "ד" | "ה" | "ו" | "פ" | "גג";
/** Floor levels (m, ±0.00 = +28.45) from the sections' level marks; heights to the next floor. */
export const STOREYS: Array<{ id: StoreyId; level: number; height: number }> = [
  { id: "מרתף", level: -6.75, height: 3.75 },
  { id: "שיפוע", level: -3.0, height: 3.0 },
  { id: "ק", level: 0, height: 3.15 },
  { id: "א", level: 3.15, height: 3.15 },
  { id: "ב", level: 6.3, height: 3.15 },
  { id: "ג", level: 9.45, height: 3.15 },
  { id: "ד", level: 12.6, height: 3.15 },
  { id: "ה", level: 15.75, height: 3.15 },
  { id: "ו", level: 18.9, height: 3.15 },
  { id: "פ", level: 22.05, height: 3.15 },
  { id: "גג", level: 25.2, height: 3.0 },
];
export const ABS_ZERO = 28.45;

export type Storey = { id: StoreyId; level: number; height: number; origin: Pt; pieces: DxfPiece[] };

export function readBreuer(file: string) {
  const d: DxfDrawing = readDxfDrawing(fs.readFileSync(file))!;
  const all = flattenDxf(d);
  const anchor = (p: DxfPiece) => p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c ?? p.rings?.[0]?.[0];
  const storeys: Storey[] = [];
  for (const s of STOREYS) {
    const lay = d.layouts.find((l) => l.name === s.id);
    const vp = lay?.viewports[0];
    if (!vp) throw new Error(`no layout tab ${s.id}`);
    const inVp = (q?: Pt) => !!q && Math.abs(q.x - vp.centre.x) <= vp.width / 2 && Math.abs(q.y - vp.centre.y) <= vp.height / 2;
    const bound = all.find((p) => p.type === "INSERT" && p.insert === "גבולות מעודכנים" && inVp(p.at));
    if (!bound) throw new Error(`no plot boundary on ${s.id}`);
    const o = { x: bound.m!.e, y: bound.m!.f };
    const pieces = all.filter((p) => inVp(anchor(p)));
    storeys.push({ ...s, origin: o, pieces });
  }
  return { drawing: d, all, storeys };
}

/** A storey-local point (cm) to model plan (x, z) in metres. */
export const toModel = (o: Pt, p: Pt): [number, number] => [(p.x - o.x) / 100, -(p.y - o.y) / 100];
