import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { dilate, emptyMask, erode, label, type Mask } from "@/lib/projects/building/raster";

/**
 * The openings of a floor: every gap between two runs of one wall line.
 *
 * A plan draws a window or a door by stopping the wall, so a gap between two
 * bands that stand on the same line, with no other wall across it, is an
 * opening. Which kind is settled by where it stands: on the floor's outline
 * it is glazing — a curtain wall where it is wider than any window — and
 * inside it is a doorway.
 */
export type PlanOpening = {
  orientation: "h" | "v";
  /** The hole in plan, metres from the plan's corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  exterior: boolean;
  kind: "window" | "curtain" | "doorway";
  /** Which side is outside, for an exterior opening: +1 toward larger x or y. */
  outward?: 1 | -1;
};

export type Footprint = { mask: Mask; cm: number };

/** The floor's outline: its walls closed across every opening, and filled. */
export function footprintOf(walls: PlanWalls, reachM = 6): Footprint {
  const r = Math.round((reachM * 100) / walls.cm / 2);
  const closed = erode(dilate(walls.mask, r), r);
  const outside = label(closed, 0);
  const mask = emptyMask(closed.cols, closed.rows);
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = closed.data[i] || !outside.touchesEdge[outside.ids[i]!] ? 1 : 0;
  }
  return { mask, cm: walls.cm };
}

export function findOpenings(
  walls: PlanWalls,
  footprint: Footprint,
  options?: { minM?: number; maxM?: number; curtainFromM?: number },
): PlanOpening[] {
  const minM = options?.minM ?? 0.4;
  const maxM = options?.maxM ?? 12;
  const curtainFrom = options?.curtainFromM ?? 6;
  const out: PlanOpening[] = [];
  const inside = (x: number, y: number) => {
    const px = Math.round((x * 100) / footprint.cm);
    const py = Math.round((y * 100) / footprint.cm);
    const { cols, rows, data } = footprint.mask;
    return px >= 0 && py >= 0 && px < cols && py < rows && data[py * cols + px] === 1;
  };
  const crosses = (x: number, y: number, w: number, h: number) =>
    walls.bands.some((b) => b.x < x + w - 0.02 && b.x + b.w > x + 0.02 && b.y < y + h - 0.02 && b.y + b.h > y + 0.02);

  for (const orientation of ["h", "v"] as const) {
    const bands = walls.bands.filter((b) => b.orientation === orientation);
    // Along: the coordinate the wall runs in; across: its thickness.
    const along = (b: (typeof bands)[number]) => (orientation === "h" ? [b.x, b.x + b.w] : [b.y, b.y + b.h]) as [number, number];
    const across = (b: (typeof bands)[number]) => (orientation === "h" ? [b.y, b.y + b.h] : [b.x, b.x + b.w]) as [number, number];
    for (const a of bands) {
      const [, aEnd] = along(a);
      const [a0, a1] = across(a);
      let best: { b: (typeof bands)[number]; gap: number } | null = null;
      for (const b of bands) {
        if (b === a) continue;
        const [bStart] = along(b);
        const gap = bStart - aEnd;
        if (gap < minM || gap > maxM) continue;
        const [b0, b1] = across(b);
        const overlap = Math.min(a1, b1) - Math.max(a0, b0);
        if (overlap < 0.6 * Math.min(a1 - a0, b1 - b0)) continue;
        if (!best || gap < best.gap) best = { b, gap };
      }
      if (!best) continue;
      const [b0, b1] = across(best.b);
      const t0 = Math.max(a0, b0);
      const t1 = Math.min(a1, b1);
      const rect =
        orientation === "h"
          ? { x: aEnd, y: t0, w: best.gap, h: t1 - t0 }
          : { x: t0, y: aEnd, w: t1 - t0, h: best.gap };
      if (crosses(rect.x, rect.y, rect.w, rect.h)) continue;
      // Either side of the hole, a little way out.
      const mid = orientation === "h" ? rect.x + rect.w / 2 : rect.y + rect.h / 2;
      const off = (t1 - t0) / 2 + 0.4;
      const centre = (t0 + t1) / 2;
      const lo = orientation === "h" ? inside(mid, centre - off) : inside(centre - off, mid);
      const hi = orientation === "h" ? inside(mid, centre + off) : inside(centre + off, mid);
      const exterior = lo !== hi;
      out.push({
        orientation,
        ...rect,
        exterior,
        kind: exterior ? (best.gap >= curtainFrom ? "curtain" : "window") : "doorway",
        ...(exterior ? { outward: (lo ? 1 : -1) as 1 | -1 } : {}),
      });
    }
  }
  return out;
}
