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

/**
 * A room's floor with its small enclosed holes filled.
 *
 * The room flood stops at the sheet's heavy ink, and the room's own printed
 * name is heavy ink: every letter of "ח. שינה" left a hole in the floor the
 * shape of the letter, and the render showed the room's name cut out of its
 * floorboards. A hole wholly surrounded by the room and smaller than maxHole
 * (drawing units squared) is floor. A column or a shaft is bigger, and is
 * drawn by its own wall body anyway.
 */
export function fillEnclosedHoles(rows: SpanRow[], maxHole: number, pitch?: number): SpanRow[] {
  if (rows.length < 3 || !(maxHole > 0)) return rows;
  const step = pitch && pitch > 0 ? pitch : rowPitch(rows);
  const sorted = [...rows].sort((a, b) => a.y - b.y);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const row of sorted) for (const [a, b] of row.spans) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); }
  if (!(x1 > x0)) return rows;
  const cols = Math.ceil((x1 - x0) / step) + 2;
  const y0 = sorted[0]!.y;
  const lines = Math.round((sorted[sorted.length - 1]!.y - y0) / step) + 1;
  if (cols * lines > 4_000_000) return rows;
  // 1 = floor, 0 = not; one column of margin on every side is outside.
  const grid = new Uint8Array(cols * (lines + 2));
  const at = (c: number, r: number) => (r + 1) * cols + c;
  for (const row of sorted) {
    const r = Math.round((row.y - y0) / step);
    for (const [a, b] of row.spans) {
      const c0 = Math.max(1, Math.round((a - x0) / step) + 1);
      const c1 = Math.min(cols - 2, Math.round((b - x0) / step));
      for (let c = c0; c <= c1; c++) grid[at(c, r)] = 1;
    }
  }
  // Everything empty that the outside reaches is not a hole.
  const outside = new Uint8Array(grid.length);
  const stack: number[] = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const c = i % cols;
    const neighbours = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols];
    for (const n of neighbours) {
      if (n < 0 || n >= grid.length || outside[n] || grid[n]) continue;
      outside[n] = 1;
      stack.push(n);
    }
  }
  // Each enclosed empty patch, filled when it is small.
  const seen = new Uint8Array(grid.length);
  const cellArea = step * step;
  let filled = false;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] || outside[i] || seen[i]) continue;
    const patch: number[] = [];
    const todo = [i];
    seen[i] = 1;
    while (todo.length) {
      const j = todo.pop()!;
      patch.push(j);
      const c = j % cols;
      for (const n of [c > 0 ? j - 1 : -1, c < cols - 1 ? j + 1 : -1, j - cols, j + cols]) {
        if (n < 0 || n >= grid.length || grid[n] || outside[n] || seen[n]) continue;
        seen[n] = 1;
        todo.push(n);
      }
    }
    if (patch.length * cellArea <= maxHole) {
      for (const j of patch) grid[j] = 1;
      filled = true;
    }
  }
  if (!filled) return rows;
  const out: SpanRow[] = [];
  for (let r = 0; r < lines; r++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && grid[at(c, r)] === 1;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        spans.push([x0 + (start - 1) * step, x0 + (c - 1) * step]);
        start = -1;
      }
    }
    if (spans.length) out.push({ y: y0 + r * step, spans });
  }
  return out;
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
export function outlineEdges(rects: Rect[], tolerance = 1e-6): Edge[] {
  type Sided = Edge & { rect: number };
  const all: Sided[] = [];
  rects.forEach((r, rect) => {
    all.push({ orientation: "h", at: r.y, from: r.x, to: r.x + r.w, rect });
    all.push({ orientation: "h", at: r.y + r.h, from: r.x, to: r.x + r.w, rect });
    all.push({ orientation: "v", at: r.x, from: r.y, to: r.y + r.h, rect });
    all.push({ orientation: "v", at: r.x + r.w, from: r.y, to: r.y + r.h, rect });
  });
  // What is left of each edge once every stretch another rectangle sits
  // against is taken out — two rectangles of unequal widths share only part
  // of an edge, and the shared part is inside.
  const out: Edge[] = [];
  for (const e of all) {
    let pieces: Array<[number, number]> = [[e.from, e.to]];
    for (const o of all) {
      if (o.rect === e.rect || o.orientation !== e.orientation || Math.abs(o.at - e.at) > tolerance) continue;
      pieces = pieces.flatMap(([a, b]) => {
        if (o.to <= a + tolerance || o.from >= b - tolerance) return [[a, b] as [number, number]];
        const left: Array<[number, number]> = [];
        if (o.from > a + tolerance) left.push([a, o.from]);
        if (o.to < b - tolerance) left.push([o.to, b]);
        return left;
      });
    }
    for (const [from, to] of pieces) if (to - from > tolerance) out.push({ orientation: e.orientation, at: e.at, from, to });
  }
  return out.sort((a, b) => a.orientation.localeCompare(b.orientation) || a.at - b.at || a.from - b.from);
}

/**
 * The rows with every part narrower than twice the radius taken off: eroded
 * by the radius, then grown back by it. A terrace flooded through the gap
 * between a facade and its sills ran on down the wall in a strip; the strip
 * goes and the terrace stands as drawn.
 */
export function openRows(rows: SpanRow[], radius: number, pitch?: number, closeFirst = 0): SpanRow[] {
  if (rows.length === 0 || !(radius > 0)) return rows;
  const step = pitch && pitch > 0 ? pitch : rowPitch(rows);
  const sorted = [...rows].sort((a, b) => a.y - b.y);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const row of sorted) for (const [a, b] of row.spans) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); }
  const cols = Math.ceil((x1 - x0) / step) + 1;
  const y0 = sorted[0]!.y;
  const lines = Math.round((sorted[sorted.length - 1]!.y - y0) / step) + 1;
  if (cols * lines > 4_000_000) return rows;
  const grid = new Uint8Array(cols * lines);
  for (const row of sorted) {
    const r = Math.round((row.y - y0) / step);
    for (const [a, b] of row.spans) for (let c = Math.round((a - x0) / step); c < Math.round((b - x0) / step); c++) grid[r * cols + c] = 1;
  }
  const k = Math.max(1, Math.round(radius / step));
  const pass = (src: Uint8Array, keep: (count: number, size: number) => boolean) => {
    const out = new Uint8Array(src.length);
    for (let r = 0; r < lines; r++) {
      for (let c = 0; c < cols; c++) {
        let n = 0;
        let size = 0;
        for (let dr = -k; dr <= k; dr++) {
          for (let dc = -k; dc <= k; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            size++;
            if (rr >= 0 && rr < lines && cc >= 0 && cc < cols && src[rr * cols + cc]) n++;
          }
        }
        out[r * cols + c] = keep(n, size) ? 1 : 0;
      }
    }
    return out;
  };
  // Closed first where asked: a terrace's paving lines leave hairline gaps
  // in its flood, and eroding through them took 17's whole terrace away.
  let base = grid;
  if (closeFirst > 0) {
    const kc = Math.max(1, Math.round(closeFirst / step));
    // Past the grid counts as set when eroding back: the dilation was cut at
    // the grid's edge, and eroding it again took a strip off every side.
    const passK = (src: Uint8Array, kk: number, keep: (count: number, size: number) => boolean, outside = 0) => {
      const out = new Uint8Array(src.length);
      for (let r = 0; r < lines; r++) {
        for (let c = 0; c < cols; c++) {
          let n = 0;
          let size = 0;
          for (let dr = -kk; dr <= kk; dr++) {
            for (let dc = -kk; dc <= kk; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              size++;
              if (rr >= 0 && rr < lines && cc >= 0 && cc < cols ? src[rr * cols + cc] : outside) n++;
            }
          }
          out[r * cols + c] = keep(n, size) ? 1 : 0;
        }
      }
      return out;
    };
    base = passK(passK(grid, kc, (n) => n > 0), kc, (n, size) => n === size, 1);
  }
  const eroded = pass(base, (n, size) => n === size);
  const opened = pass(eroded, (n) => n > 0);
  const out: SpanRow[] = [];
  for (let r = 0; r < lines; r++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && opened[r * cols + c] === 1 && base[r * cols + c] === 1;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        spans.push([x0 + start * step, x0 + c * step]);
        start = -1;
      }
    }
    if (spans.length) out.push({ y: y0 + r * step, spans });
  }
  return out;
}

/**
 * A paved terrace held to its paving. The flood runs on the flat's footprint
 * and stops only at wall, so a terrace edged by a thin line ran past it:
 * דירה 18's 4.6 m² terrace went on down to the bedroom wall below it. The
 * joints are drawn over the whole of the paving and nowhere else, so the
 * region is cut to their extent and a margin of half a tile. Left as it is
 * when there is no paving to go by, or when the paving is only a sample
 * drawn in one corner.
 */
export function cropToPaving(
  rows: SpanRow[],
  segments: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>,
  unitsPerMetre: number,
): SpanRow[] {
  if (rows.length === 0) return rows;
  const pitch = rowPitch(rows);
  const contains = (x: number, y: number) =>
    rows.some((row) => Math.abs(row.y - y) <= pitch / 2 && row.spans.some(([a, b]) => x >= a && x <= b));
  const joints = segments.filter((s) => {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    const length = Math.hypot(dx, dy);
    if (length < unitsPerMetre * 0.15 || length > unitsPerMetre * 2) return false;
    if (Math.min(dx, dy) > length * 0.02) return false;
    return contains((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
  });
  if (joints.length < 12) return rows;
  const margin = unitsPerMetre * 0.3;
  const x0 = Math.min(...joints.flatMap((s) => [s.x1, s.x2])) - margin;
  const x1 = Math.max(...joints.flatMap((s) => [s.x1, s.x2])) + margin;
  const y0 = Math.min(...joints.flatMap((s) => [s.y1, s.y2])) - margin;
  const y1 = Math.max(...joints.flatMap((s) => [s.y1, s.y2])) + margin;
  const area = (list: SpanRow[]) => list.reduce((t, r) => t + r.spans.reduce((u, [a, b]) => u + (b - a), 0), 0);
  const cropped = rows
    .filter((row) => row.y >= y0 && row.y <= y1)
    .map((row) => ({
      y: row.y,
      spans: row.spans
        .map(([a, b]): [number, number] => [Math.max(a, x0), Math.min(b, x1)])
        .filter(([a, b]) => b > a),
    }))
    .filter((row) => row.spans.length > 0);
  const kept = area(cropped) / Math.max(1e-9, area(rows));
  return kept < 0.35 ? rows : cropped;
}

/**
 * The rows less what the cuts cover, row by row; the rows themselves where
 * nothing is cut.
 */
export function withoutRows(rows: SpanRow[], cuts: SpanRow[][]): SpanRow[] {
  if (cuts.length === 0) return rows;
  const pitch = rows.length > 1 ? Math.abs(rows[1]!.y - rows[0]!.y) || 1 : 1;
  let changed = false;
  const out = rows
    .map((row) => {
      let spans = row.spans;
      for (const cut of cuts) {
        for (const other of cut) {
          if (Math.abs(other.y - row.y) > pitch / 2) continue;
          for (const [ca, cb] of other.spans) {
            spans = spans.flatMap(([a, b]): Array<[number, number]> => {
              if (cb <= a || ca >= b) return [[a, b]];
              changed = true;
              return [
                ...(ca > a ? [[a, ca] as [number, number]] : []),
                ...(cb < b ? [[cb, b] as [number, number]] : []),
              ];
            });
          }
        }
      }
      return { y: row.y, spans };
    })
    .filter((row) => row.spans.length > 0);
  return changed ? out : rows;
}
