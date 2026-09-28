import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * Built-in wardrobes, found by their hangers.
 *
 * A sales sheet draws a wardrobe as three sides — the wall is the fourth —
 * with a rail down its middle and a row of hangers across the rail. Three
 * sides are not a rectangle, so the rectangle finder never reported one, and
 * every bedroom on דירה 16 came out with bare floor where its wardrobe stands.
 *
 * The hangers are what nothing else on a sheet has: four or more short
 * strokes, 30 to 55 cm long, each crossing the same straight rail near its
 * middle. The wardrobe runs the rail's length and is a wardrobe's depth,
 * centred on the hangers.
 */
export function findWardrobes(segments: VectorSegment[], unitsPerMetre: number): FurniturePiece[] {
  const upm = unitsPerMetre;
  const tol = 0.02 * upm;
  const length = (s: VectorSegment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

  const hangers = segments.filter((s) => {
    const l = length(s);
    return l >= 0.3 * upm && l <= 0.55 * upm;
  });

  const found: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const rail of segments) {
    const alongX = Math.abs(rail.y2 - rail.y1) <= tol;
    const alongY = Math.abs(rail.x2 - rail.x1) <= tol;
    if (!alongX && !alongY) continue;
    const l = length(rail);
    if (l < 0.8 * upm || l > 3.5 * upm) continue;
    const at = alongX ? (rail.y1 + rail.y2) / 2 : (rail.x1 + rail.x2) / 2;
    const from = alongX ? Math.min(rail.x1, rail.x2) : Math.min(rail.y1, rail.y2);
    const to = alongX ? Math.max(rail.x1, rail.x2) : Math.max(rail.y1, rail.y2);

    const across = hangers.filter((h) => {
      const hl = length(h);
      // Across the rail, give or take the tilt a drawn hanger has.
      const along = alongX ? Math.abs(h.x2 - h.x1) : Math.abs(h.y2 - h.y1);
      if (along > 0.35 * hl) return false;
      const midAlong = alongX ? (h.x1 + h.x2) / 2 : (h.y1 + h.y2) / 2;
      const midAcross = alongX ? (h.y1 + h.y2) / 2 : (h.x1 + h.x2) / 2;
      return midAlong > from && midAlong < to && Math.abs(midAcross - at) <= 0.08 * upm;
    });
    if (across.length < 4) continue;

    const centre = across.reduce((sum, h) => sum + (alongX ? (h.y1 + h.y2) / 2 : (h.x1 + h.x2) / 2), 0) / across.length;
    const depth = 0.6 * upm;
    found.push(
      alongX
        ? { x: from, y: centre - depth / 2, w: to - from, h: depth }
        : { x: centre - depth / 2, y: from, w: depth, h: to - from },
    );
  }

  // A rail is drawn double, so each wardrobe is found twice.
  const merged: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const rect of found) {
    const same = merged.find((other) => {
      const ox = Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x);
      const oy = Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y);
      return ox > 0 && oy > 0 && ox * oy > 0.5 * Math.min(rect.w * rect.h, other.w * other.h);
    });
    if (same) continue;
    merged.push(rect);
  }
  return merged.map((rect) => ({
    ...rect,
    kind: "storage" as const,
    widthCm: (rect.w / upm) * 100,
    depthCm: (rect.h / upm) * 100,
  }));
}
