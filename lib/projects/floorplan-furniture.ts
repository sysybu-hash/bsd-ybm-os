import { isAxisAligned, segmentLength, type VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * The furniture the sheet actually draws, read out of the CAD.
 *
 * Every count this project argued about — how many beds, how many stools, is
 * there a bed in the ממ"ד — was a vision model looking at a picture and
 * answering differently each time. The sheet draws a bed as a closed rectangle
 * 93 by 218 units at a known place, and it says so identically every run.
 *
 * On דירה 14 this finds five beds at 93x218 and 218x93, wardrobes and counters
 * at 36-52 cm deep, and a bath — from geometry, with no model involved.
 */

export type FurnitureKind = "bed" | "storage" | "counter" | "fixture" | "unknown";

export type FurniturePiece = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: FurnitureKind;
  widthCm: number;
  depthCm: number;
};

type Edge = { at: number; a: number; b: number };

/**
 * Closed axis-aligned rectangles, which is how a CAD draws a piece of furniture.
 *
 * Two parallel edges that start and end together, with an edge closing each end.
 * Requiring all four means a hatch line or a dimension tick cannot qualify.
 */
export function findRectangles(
  segments: VectorSegment[],
  options: { unitsPerMetre: number; minSideM?: number; maxSideM?: number; tolerance?: number },
): Array<{ x: number; y: number; w: number; h: number }> {
  const upm = options.unitsPerMetre;
  const min = (options.minSideM ?? 0.3) * upm;
  const max = (options.maxSideM ?? 3.2) * upm;
  const tol = options.tolerance ?? 3;

  const horizontal: Edge[] = [];
  const vertical: Edge[] = [];
  for (const s of segments) {
    if (!isAxisAligned(s) || segmentLength(s) < min * 0.5) continue;
    if (Math.abs(s.y2 - s.y1) < Math.abs(s.x2 - s.x1)) {
      horizontal.push({ at: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) });
    } else {
      vertical.push({ at: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) });
    }
  }

  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < horizontal.length; i++) {
    for (let j = i + 1; j < horizontal.length; j++) {
      const top = horizontal[i]!;
      const bottom = horizontal[j]!;
      const depth = Math.abs(bottom.at - top.at);
      if (depth < min || depth > max) continue;
      // The two edges must be the same edge of the same object, not two things
      // that happen to line up: they start and end together.
      if (Math.abs(top.a - bottom.a) > tol * 3 || Math.abs(top.b - bottom.b) > tol * 3) continue;
      const x0 = Math.max(top.a, bottom.a);
      const x1 = Math.min(top.b, bottom.b);
      const width = x1 - x0;
      if (width < min || width > max) continue;
      const y0 = Math.min(top.at, bottom.at);
      const y1 = Math.max(top.at, bottom.at);
      const closes = (at: number) =>
        vertical.some((s) => Math.abs(s.at - at) < tol && s.a <= y0 + tol && s.b >= y1 - tol);
      if (closes(x0) && closes(x1)) out.push({ x: x0, y: y0, w: width, h: depth });
    }
  }
  return out;
}

/**
 * Drops the stair, which is a stack of rectangles and not a stack of furniture.
 *
 * The building stair on דירה 14 comes back as eleven rectangles sharing an x,
 * 93 cm wide, their heights stepping 247, 226, 205, 184 down to 58 — the treads,
 * each closed by the same pair of stringers. A flat does not contain eleven
 * nested wardrobes on one spot, and the internal staircase that had to be
 * repaired out of an earlier still came from exactly this.
 */
export function dropNested(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  minStack = 3,
): Array<{ x: number; y: number; w: number; h: number }> {
  const drop = new Set<number>();
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!;
    const sharing = rects.filter(
      (b, k) => k !== i && Math.abs(b.x - a.x) < 4 && Math.abs(b.w - a.w) < 8,
    );
    if (sharing.length + 1 >= minStack) drop.add(i);
  }
  return rects.filter((_, i) => !drop.has(i));
}

/** Keeps the largest rectangle wherever several describe one object. */
export function dedupeRectangles(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  cell = 4,
): Array<{ x: number; y: number; w: number; h: number }> {
  const seen = new Set<string>();
  const out: typeof rects = [];
  for (const r of [...rects].sort((a, b) => b.w * b.h - a.w * a.h)) {
    const key = `${Math.round(r.x / cell)},${Math.round(r.y / cell)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Names a rectangle from its size in centimetres.
 *
 * An Israeli single bed is 90x200 and draws at about 93x218 with its frame; a
 * wardrobe or a kitchen run is 36-60 deep and long; a bath is about 70x160.
 * Anything else is left unknown rather than guessed at — an unnamed block in the
 * right place is honest, and a bed invented in the wrong place is what this
 * pipeline has been apologising for all along.
 */
export function classifyPiece(widthCm: number, depthCm: number): FurnitureKind {
  const long = Math.max(widthCm, depthCm);
  const short = Math.min(widthCm, depthCm);
  if (short >= 80 && short <= 110 && long >= 185 && long <= 230) return "bed";
  if (short >= 60 && short <= 80 && long >= 140 && long <= 180) return "fixture";
  if (short >= 30 && short <= 62 && long >= 90 && long <= 320) return "storage";
  if (short >= 55 && short <= 75 && long >= 55 && long <= 75) return "fixture";
  if (short >= 80 && short <= 140 && long >= 140 && long <= 260) return "counter";
  return "unknown";
}

export function findFurniture(
  segments: VectorSegment[],
  unitsPerMetre: number,
): FurniturePiece[] {
  const rects = dedupeRectangles(dropNested(findRectangles(segments, { unitsPerMetre })));
  return rects.map((r) => {
    const widthCm = (r.w / unitsPerMetre) * 100;
    const depthCm = (r.h / unitsPerMetre) * 100;
    return { ...r, widthCm, depthCm, kind: classifyPiece(widthCm, depthCm) };
  });
}
