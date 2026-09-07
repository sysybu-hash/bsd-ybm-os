import type { FloorplanBbox } from "@/lib/projects/floorplan-layout";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * Turns wall segments into measured rooms.
 *
 * Two things the vector geometry does not carry: what a room is called, and how
 * many page units make a metre. The names come from the existing extractor,
 * matched onto a rectangle by position — asking a model to name a room is
 * exactly what it is reliable at. The scale comes from the dimension strings the
 * sheet already prints, which OCR reads today.
 */

export type WallRun = {
  orientation: "h" | "v";
  /** Constant coordinate: y for a horizontal run, x for a vertical one. */
  at: number;
  from: number;
  to: number;
};

export type RoomRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Filled pixel count — the true area, which a bounding box overstates for an L-shape. */
  areaUnits?: number;
  name?: string;
  kind?: string;
  /** Metres, once a scale is known. */
  widthM?: number;
  heightM?: number;
  areaM2?: number;
};

/**
 * Collapses raw segments into wall runs, merging collinear pieces.
 *
 * A CAD wall arrives as many short strokes on the same line — the דירה 16 sheet
 * yields ~35,000 segments for a flat with a few dozen walls — so overlapping and
 * touching pieces on one line are joined before anything downstream sees them.
 */
export function buildWallRuns(walls: VectorSegment[], tolerance = 1.2): WallRun[] {
  const groups: Record<"h" | "v", WallRun[]> = { h: [], v: [] };
  for (const s of walls) {
    const horizontal = Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1);
    const orientation = horizontal ? "h" : "v";
    groups[orientation].push({
      orientation,
      at: horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2,
      from: horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2),
      to: horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2),
    });
  }

  const runs: WallRun[] = [];
  for (const orientation of ["h", "v"] as const) {
    // Cluster by proximity, not by rounding into buckets: two pieces of one wall
    // at y=40 and y=40.4 land either side of a bucket edge and never merge.
    const items = groups[orientation].sort((p, q) => p.at - q.at);
    let line: WallRun[] = [];
    const flush = () => {
      if (line.length === 0) return;
      line.sort((p, q) => p.from - q.from);
      const at = line.reduce((sum, r) => sum + r.at, 0) / line.length;
      let cur = { orientation, at, from: line[0]!.from, to: line[0]!.to };
      for (let i = 1; i < line.length; i++) {
        const next = line[i]!;
        if (next.from <= cur.to + tolerance) cur.to = Math.max(cur.to, next.to);
        else {
          runs.push(cur);
          cur = { orientation, at, from: next.from, to: next.to };
        }
      }
      runs.push(cur);
      line = [];
    };
    for (const item of items) {
      // Measured against the line's first member, not its previous one. Chaining
      // off the previous member let 508, 509, 510, 511 join hand to hand into a
      // single group spanning far more than the tolerance, and the averaged `at`
      // then landed on no real wall: the exterior wall at y=510 on דירה 14
      // disappeared into such a chain, which is the notch the flood fill was
      // escaping through and why the living room rendered with no floor.
      if (line.length > 0 && item.at - line[0]!.at > tolerance) flush();
      line.push(item);
    }
    flush();
  }
  return runs;
}

/**
 * Page units per metre, from the dimensions the sheet prints.
 *
 * Israeli sales sheets label rooms in centimetres (272, 406, 355). Each such
 * number sits beside a wall run of the matching length, so the ratio between the
 * two is the scale. Taking the median across every match keeps one mislabelled
 * pair from moving the answer.
 */
export function calibrateScale(
  runs: WallRun[],
  dimensionStrings: string[],
): { unitsPerMetre: number; samples: number } | null {
  const centimetres = dimensionStrings
    .map((d) => Number(String(d).replace(/[^\d.]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 60 && n <= 1500);
  if (centimetres.length === 0 || runs.length === 0) return null;

  const lengths = runs.map((r) => r.to - r.from).filter((n) => n > 8);
  if (lengths.length === 0) return null;

  // A candidate scale is judged by how many DISTINCT printed dimensions it
  // explains, not by how many (dimension, run) pairs land near it. Counting
  // pairs rewards low ratios, because short runs pair with every dimension and
  // pile up there: that read דירה 16 at 9.3 units/m and made the flat 2,111 m².
  // Under a scale of s, a dimension of `cm` should appear as a run of
  // cm/100 * s units; a scale is only as good as the number of dimensions for
  // which such a run actually exists.
  const candidates: number[] = [];
  for (const cm of centimetres) {
    for (const len of lengths) {
      const ratio = len / (cm / 100);
      if (ratio >= 8 && ratio <= 400) candidates.push(ratio);
    }
  }
  if (candidates.length === 0) return null;

  const sortedLengths = [...lengths].sort((a, b) => a - b);
  const hasRunNear = (target: number, tol: number) => {
    let lo = 0;
    let hi = sortedLengths.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = sortedLengths[mid]!;
      if (Math.abs(v - target) <= tol) return true;
      if (v < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  };

  let bestScale = 0;
  let bestMatched = 0;
  for (const scale of candidates) {
    let matched = 0;
    for (const cm of centimetres) {
      const expected = (cm / 100) * scale;
      if (hasRunNear(expected, Math.max(1.5, expected * 0.02))) matched++;
    }
    if (matched > bestMatched) {
      bestMatched = matched;
      bestScale = scale;
    }
  }

  // Fewer than four explained dimensions is coincidence, not calibration.
  if (bestMatched < 4 || bestScale <= 0) return null;
  return { unitsPerMetre: bestScale, samples: bestMatched };
}

/**
 * Scale from the gross area the sheet prints, which is the constraint that
 * actually pins it down.
 *
 * Matching printed dimensions against wall runs looks appealing and does not
 * work: a sheet yields a few hundred run lengths, dense enough that almost any
 * scale "explains" most dimensions, and the vote reads דירה 16 at 12.5 units/m
 * for a 1,168 m² flat. The gross area is one number, printed on every sales
 * sheet and already extracted, and it fixes the scale outright — enclosed area
 * in units over the printed area in metres, square-rooted.
 *
 * Terraces are outside the gross figure, so only interior regions are summed.
 */
export function calibrateScaleFromArea(
  rooms: RoomRect[],
  grossAreaM2: number,
): { unitsPerMetre: number; samples: number } | null {
  if (!(grossAreaM2 > 10) || rooms.length === 0) return null;
  const unitArea = rooms.reduce((sum, r) => sum + (r.areaUnits ?? r.w * r.h), 0);
  if (!(unitArea > 0)) return null;
  const unitsPerMetre = Math.sqrt(unitArea / grossAreaM2);
  if (!(unitsPerMetre > 4) || unitsPerMetre > 500) return null;
  return { unitsPerMetre, samples: rooms.length };
}

/**
 * Finds enclosed rooms by painting the walls and flood-filling what is left.
 *
 * A gridline approach was tried first and did not survive contact with a real
 * sheet: fixture and furniture edges that slip past the wall filter add spurious
 * gridlines, and דירה 16's 153 horizontal and 125 vertical runs fragmented into
 * 6,600 cells of which 56 were even room-sized. Painting the walls into a raster
 * and flooding the gaps does not care how the lines were split, and it handles
 * the L-shaped rooms a grid cannot describe.
 *
 * Walls are drawn slightly thick so that door openings — real gaps in the CAD
 * geometry — do not leak one room into the next.
 */
export function findRoomRegions(
  runs: WallRun[],
  page: { width: number; height: number },
  options?: { wallThickness?: number; minAreaUnits?: number },
): RoomRect[] {
  const W = Math.max(1, Math.ceil(page.width));
  const H = Math.max(1, Math.ceil(page.height));
  const thickness = options?.wallThickness ?? 3;
  const minArea = options?.minAreaUnits ?? 900;

  const wall = new Uint8Array(W * H);
  const paint = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dy = -thickness; dy <= thickness; dy++) {
      for (let dx = -thickness; dx <= thickness; dx++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) wall[py * W + px] = 1;
      }
    }
  };
  for (const run of runs) {
    const steps = Math.ceil(run.to - run.from);
    for (let t = 0; t <= steps; t++) {
      const along = run.from + t;
      if (run.orientation === "h") paint(along, run.at);
      else paint(run.at, along);
    }
  }

  const seen = new Uint8Array(W * H);
  const rooms: RoomRect[] = [];
  const stack: number[] = [];

  // The page border seeds the exterior, so everything outside the flat is
  // consumed by one region that is then discarded for touching the edge.
  for (let start = 0; start < W * H; start++) {
    if (wall[start] || seen[start]) continue;
    let minX = W;
    let minY = H;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    let touchesEdge = false;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % W;
      const y = (idx - x) / W;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;

      if (x > 0 && !wall[idx - 1] && !seen[idx - 1]) { seen[idx - 1] = 1; stack.push(idx - 1); }
      if (x < W - 1 && !wall[idx + 1] && !seen[idx + 1]) { seen[idx + 1] = 1; stack.push(idx + 1); }
      if (y > 0 && !wall[idx - W] && !seen[idx - W]) { seen[idx - W] = 1; stack.push(idx - W); }
      if (y < H - 1 && !wall[idx + W] && !seen[idx + W]) { seen[idx + W] = 1; stack.push(idx + W); }
    }

    if (touchesEdge || area < minArea) continue;
    rooms.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, areaUnits: area });
  }

  rooms.sort((a, b) => (b.areaUnits ?? 0) - (a.areaUnits ?? 0));
  return rooms;
}

/** Applies a calibrated scale so every rectangle carries real metres. */
export function measureRooms(rects: RoomRect[], unitsPerMetre: number): RoomRect[] {
  if (!(unitsPerMetre > 0)) return rects;
  return rects.map((r) => {
    const widthM = r.w / unitsPerMetre;
    const heightM = r.h / unitsPerMetre;
    const filled = r.areaUnits ?? r.w * r.h;
    return {
      ...r,
      widthM: Number(widthM.toFixed(2)),
      heightM: Number(heightM.toFixed(2)),
      // The flood fill counted the real footprint, so an L-shaped room does not
      // get billed for the rectangle around it.
      areaM2: Number((filled / (unitsPerMetre * unitsPerMetre)).toFixed(2)),
    };
  });
}

/**
 * Names the measured rectangles from the extractor's rooms.
 *
 * The extractor's bboxes are too loose to build geometry from — they overlap and
 * do not tile — but they are quite good enough to say which rectangle is the
 * kitchen. Each name goes to the rectangle it overlaps most, and each rectangle
 * is claimed once.
 */
export function nameRoomRects(
  rects: RoomRect[],
  named: Array<{ name: string; kind?: string; bbox?: FloorplanBbox }>,
  page: { width: number; height: number },
): RoomRect[] {
  const out = rects.map((r) => ({ ...r }));
  const taken = new Set<number>();
  const overlap = (a: RoomRect, b: RoomRect) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };

  const candidates = named
    .filter((n) => n.bbox)
    .map((n) => ({
      name: n.name,
      kind: n.kind,
      rect: {
        x: n.bbox!.x * page.width,
        y: n.bbox!.y * page.height,
        w: n.bbox!.w * page.width,
        h: n.bbox!.h * page.height,
      } as RoomRect,
    }));

  for (const candidate of candidates) {
    let bestIndex = -1;
    let bestArea = 0;
    for (let i = 0; i < out.length; i++) {
      if (taken.has(i)) continue;
      const area = overlap(candidate.rect, out[i]!);
      if (area > bestArea) {
        bestArea = area;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestArea > 0) {
      taken.add(bestIndex);
      out[bestIndex] = { ...out[bestIndex]!, name: candidate.name, kind: candidate.kind };
    }
  }
  return out;
}
