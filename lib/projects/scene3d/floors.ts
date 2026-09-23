import type { SpanRow } from "@/lib/projects/floorplan-solid";

/**
 * Scanline regions turned into rectangles.
 *
 * The measurement describes every floor — the flat's, each room's, each
 * terrace's — as scan rows: a y, and the runs of x it covers. That is the right
 * shape for measuring and the wrong shape for drawing. A bounding box is worse:
 * an L-shaped room is not its bounding box, and painting one puts floor outside
 * the apartment, which is what the current viewer does.
 *
 * So rows are merged into rectangles: runs that repeat down consecutive rows
 * become one rectangle. A typical flat collapses from several hundred rows to a
 * few dozen rectangles, which is also what makes the region small enough to
 * store and cheap enough to draw.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** The row pitch the measurement used, inferred from the rows themselves. */
export function rowPitch(rows: SpanRow[]): number {
  if (rows.length < 2) return 1;
  let smallest = Infinity;
  for (let i = 1; i < rows.length; i++) {
    const gap = Math.abs((rows[i]!.y ?? 0) - (rows[i - 1]!.y ?? 0));
    if (gap > 0 && gap < smallest) smallest = gap;
  }
  return Number.isFinite(smallest) ? smallest : 1;
}

/**
 * Merge scan rows into rectangles.
 *
 * A run is carried down as long as the next row repeats it exactly and follows
 * within one pitch; otherwise it is closed off. Exactness matters more than the
 * rectangle count: a run that is merged with one a pixel wider would paint
 * floor where the drawing has none.
 */
export function mergeSpanRows(rows: SpanRow[], pitch?: number): Rect[] {
  if (rows.length === 0) return [];
  const step = pitch && pitch > 0 ? pitch : rowPitch(rows);
  const sorted = [...rows].sort((a, b) => a.y - b.y);
  const out: Rect[] = [];
  /** Runs still growing downwards, keyed by "from:to". */
  let open = new Map<string, Rect>();

  for (const row of sorted) {
    const next = new Map<string, Rect>();
    for (const span of row.spans) {
      const from = span[0];
      const to = span[1];
      if (!(to > from)) continue;
      const key = `${from}:${to}`;
      const carried = open.get(key);
      if (carried && Math.abs(row.y - (carried.y + carried.h)) <= step * 0.51) {
        carried.h = row.y + step - carried.y;
        next.set(key, carried);
        open.delete(key);
        continue;
      }
      next.set(key, { x: from, y: row.y, w: to - from, h: step });
    }
    // Anything not carried into this row has ended.
    for (const rect of open.values()) out.push(rect);
    open = next;
  }
  for (const rect of open.values()) out.push(rect);
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The area those rows cover, in drawing units squared. */
export function rectsArea(rects: Rect[]): number {
  return rects.reduce((sum, r) => sum + r.w * r.h, 0);
}

/** The bounding box of a set of rectangles. */
export function rectsBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    if (r.x < x0) x0 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.x + r.w > x1) x1 = r.x + r.w;
    if (r.y + r.h > y1) y1 = r.y + r.h;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type Edge = {
  orientation: "h" | "v";
  /** The line the edge lies on: y for a horizontal edge, x for a vertical one. */
  at: number;
  from: number;
  to: number;
};

/**
 * The outside edges of a region.
 *
 * An edge of one rectangle that another rectangle sits against is interior and
 * drops out; what is left is the outline. A terrace's railing is built from
 * these, which is how the railing follows the terrace instead of boxing it in —
 * the SVG plate rails the bounding box, and therefore rails across the door.
 */
export function outlineEdges(rects: Rect[]): Edge[] {
  const counted = new Map<string, Edge & { count: number }>();
  const add = (edge: Edge) => {
    const key = `${edge.orientation}:${edge.at}:${edge.from}:${edge.to}`;
    const seen = counted.get(key);
    if (seen) seen.count += 1;
    else counted.set(key, { ...edge, count: 1 });
  };
  for (const r of rects) {
    add({ orientation: "h", at: r.y, from: r.x, to: r.x + r.w });
    add({ orientation: "h", at: r.y + r.h, from: r.x, to: r.x + r.w });
    add({ orientation: "v", at: r.x, from: r.y, to: r.y + r.h });
    add({ orientation: "v", at: r.x + r.w, from: r.y, to: r.y + r.h });
  }
  return [...counted.values()]
    .filter((edge) => edge.count === 1)
    .map(({ orientation, at, from, to }) => ({ orientation, at, from, to }))
    .sort((a, b) => a.orientation.localeCompare(b.orientation) || a.at - b.at || a.from - b.from);
}
