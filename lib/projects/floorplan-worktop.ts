import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The kitchen's worktop run, measured off the line the sheet draws for it.
 *
 * A sales sheet draws a run as one line parallel to the wall, a worktop's depth
 * off it, with the hob and the sink set into it. The line is neither a closed
 * rectangle nor a curve, so no detector ever reported it: every flat's hob and
 * sink stood on bare floor in the render, and the kitchens of 16 and 22 read as
 * a living room with a stove in it.
 *
 * The run is found from what is already measured. Each hob or sink backs onto
 * a wall; on its open side, 0.42–0.75 m off the wall face as measured (a hatched
 * body can end short of the drawn face), the sheet's front line
 * passes the fitting, and the line — joined with whatever continues it across
 * a small break — is how long the run is. Where no such line is drawn, the run
 * is the cabinet under the fitting and nothing more: the sheet did not say
 * how far it goes, so it is not guessed.
 */
export function findWorktopRuns(
  segments: VectorSegment[],
  anchors: FurniturePiece[],
  walls: Rect[],
  unitsPerMetre: number,
  existing: FurniturePiece[] = [],
): FurniturePiece[] {
  const upm = unitsPerMetre;
  const tol = 0.03 * upm;
  const runs: Rect[] = [];

  for (const anchor of anchors) {
    const back = backingWall(anchor, walls, upm);
    if (!back) continue;
    const alongX = back.side === "top" || back.side === "bottom";
    // Distance of a line (at `at` across the run) off the wall face, measured
    // into the room.
    const off = (at: number) => (back.side === "top" || back.side === "left" ? at - back.face : back.face - at);
    const a0 = alongX ? anchor.x : anchor.y;
    const a1 = alongX ? anchor.x + anchor.w : anchor.y + anchor.h;

    type Line = { at: number; from: number; to: number };
    const lines: Line[] = [];
    for (const s of segments) {
      const flat = alongX ? Math.abs(s.y2 - s.y1) <= tol : Math.abs(s.x2 - s.x1) <= tol;
      if (!flat) continue;
      const at = alongX ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
      const from = alongX ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const to = alongX ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      if (to - from < 0.1 * upm) continue;
      lines.push({ at, from, to });
    }

    const front = lines
      .filter((line) => {
        const d = off(line.at);
        return d >= 0.42 * upm && d <= 0.75 * upm && line.from <= a1 + 0.1 * upm && line.to >= a0 - 0.1 * upm;
      })
      .sort((p, q) => Math.abs(off(p.at) - 0.6 * upm) - Math.abs(off(q.at) - 0.6 * upm))[0];

    let from = a0;
    let to = a1;
    let depth = 0.6 * upm;
    if (front) {
      depth = off(front.at);
      from = Math.min(from, front.from);
      to = Math.max(to, front.to);
      // The line breaks where an appliance or a corner interrupts it; the
      // pieces either side, on the same line, are the same run.
      const same = lines.filter((line) => Math.abs(line.at - front.at) <= tol);
      let grew = true;
      while (grew) {
        grew = false;
        for (const line of same) {
          if (line.to < from - 0.15 * upm || line.from > to + 0.15 * upm) continue;
          if (line.from < from || line.to > to) {
            from = Math.min(from, line.from);
            to = Math.max(to, line.to);
            grew = true;
          }
        }
      }
    }

    const run: Rect = alongX
      ? {
          x: from,
          y: back.side === "top" ? back.face : back.face - depth,
          w: to - from,
          h: depth,
        }
      : {
          x: back.side === "left" ? back.face : back.face - depth,
          y: from,
          w: depth,
          h: to - from,
        };
    runs.push(run);
  }

  // Two fittings on the same run give the same run twice, and the two basins
  // of a sink with no front line give two cabinets side by side.
  const merged: Rect[] = [];
  // Side by side means level with each other across the run and at most a
  // small gap apart along it; an L's two legs meet at a corner and stay two.
  const gap = 0.15 * upm;
  const sideBySide = (a: Rect, b: Rect) => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (oy >= 0.5 * Math.min(a.h, b.h) && ox >= -gap) || (ox >= 0.5 * Math.min(a.w, b.w) && oy >= -gap);
  };
  for (const run of runs) {
    const same = merged.find((other) => overlapShare(run, other) > 0.3 || sideBySide(run, other));
    if (same) {
      const x = Math.min(same.x, run.x);
      const y = Math.min(same.y, run.y);
      same.w = Math.max(same.x + same.w, run.x + run.w) - x;
      same.h = Math.max(same.y + same.h, run.y + run.h) - y;
      same.x = x;
      same.y = y;
    } else {
      merged.push({ ...run });
    }
  }

  // An L: two runs on walls that meet, each ending short of the other by the
  // other's depth. The square between them is the corner cabinet, and without
  // it דירה 22's hob run and sink run stood as two pieces with a hole between.
  const near = 0.12 * upm;
  const corners: Rect[] = [];
  for (const v of merged) {
    if (v.h <= v.w) continue;
    for (const h of merged) {
      if (h.w <= h.h) continue;
      const beside = Math.abs(v.x + v.w - h.x) <= near || Math.abs(h.x + h.w - v.x) <= near;
      const below = Math.abs(h.y - (v.y + v.h)) <= near || Math.abs(v.y - (h.y + h.h)) <= near;
      if (!beside || !below) continue;
      const corner = { x: v.x, y: h.y, w: v.w, h: h.h };
      if (merged.some((run) => overlapShare(run, corner) > 0.5)) continue;
      corners.push(corner);
    }
  }
  merged.push(...corners);

  return merged
    .filter((run) => !existing.some((piece) => piece.kind === "counter" && overlapShare(run, piece) > 0.5))
    .map((run) => ({
      ...run,
      kind: "counter" as const,
      widthCm: (run.w / upm) * 100,
      depthCm: (run.h / upm) * 100,
    }));
}

/**
 * The wall a fitting stands against: the nearest wall face within a quarter
 * of a metre of one of its sides, and overlapping it along that side.
 */
function backingWall(
  piece: Rect,
  walls: Rect[],
  upm: number,
): { side: "top" | "bottom" | "left" | "right"; face: number } | null {
  const reach = 0.25 * upm;
  type Side = "top" | "bottom" | "left" | "right";
  const candidates: Array<{ side: Side; face: number; gap: number }> = [];
  for (const wall of walls) {
    const spansX = Math.min(piece.x + piece.w, wall.x + wall.w) - Math.max(piece.x, wall.x) > piece.w * 0.5;
    const spansY = Math.min(piece.y + piece.h, wall.y + wall.h) - Math.max(piece.y, wall.y) > piece.h * 0.5;
    if (spansX) {
      candidates.push({ side: "top", face: wall.y + wall.h, gap: piece.y - (wall.y + wall.h) });
      candidates.push({ side: "bottom", face: wall.y, gap: wall.y - (piece.y + piece.h) });
    }
    if (spansY) {
      candidates.push({ side: "left", face: wall.x + wall.w, gap: piece.x - (wall.x + wall.w) });
      candidates.push({ side: "right", face: wall.x, gap: wall.x - (piece.x + piece.w) });
    }
  }
  const best = candidates
    .filter((c) => c.gap >= -0.05 * upm && c.gap <= reach)
    .sort((a, b) => a.gap - b.gap)[0];
  return best ? { side: best.side, face: best.face } : null;
}

/** How much of the smaller rectangle the two share. */
function overlapShare(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
}
