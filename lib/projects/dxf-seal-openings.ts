import { buildWallRuns } from "@/lib/projects/floorplan-rooms";
import {
  bridgesAcrossGaps,
  buildWallBodies,
  closeCorners,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * Closes door and window holes before a flood, without moving the walls.
 *
 * A plan draws an opening by stopping the wall. Left like that, a flood treats
 * the hole as a leak and the apartment never becomes one polygon. Drafting
 * joints (under 15 cm) and door-width gaps in a wall line are closed because
 * they are the opening, not the end of the wall. A wider hole is closed only
 * when glazing lines or a door/window block sit in it. Anything else stays
 * open, and is reported as an open gap.
 */
export type OpeningBridge = WallBody & {
  reason: "draft" | "door" | "glazing" | "block";
};

export type DxfWallSeal = {
  /** Wall bodies with corners pulled up, openings still open. */
  walls: WallBody[];
  bridges: OpeningBridge[];
  /** Corner notches: a wall end that stops short of a perpendicular wall. Mask only. */
  patches: Array<{ x: number; y: number; w: number; h: number }>;
  /** Collinear holes still open, from 20 cm to 6 m. */
  openGaps: WallBody[];
};

const inGap = (
  gap: { orientation: "h" | "v"; centre: number; thickness: number; from: number; to: number },
  x: number,
  y: number,
  reach: number,
) =>
  gap.orientation === "h"
    ? x >= gap.from - reach && x <= gap.to + reach && Math.abs(y - gap.centre) <= gap.thickness / 2 + reach
    : y >= gap.from - reach && y <= gap.to + reach && Math.abs(x - gap.centre) <= gap.thickness / 2 + reach;

export function sealDxfWallsForFlood(
  wallSegments: VectorSegment[],
  glazingSegments: VectorSegment[],
  marks: Array<{ x: number; y: number; width?: number }>,
  unitsPerMetre: number,
): DxfWallSeal {
  const snap = Math.max(1.2, unitsPerMetre * 0.03);
  // Only a short miss is pulled into the wall itself. A longer notch is a
  // patch, so a door near a corner is not swallowed by the extension.
  // A door block often sits on a line the draughtsman did not break. Cut
  // that line at the block, or the flood still sees a solid wall.
  const walls = cutOpeningsAtMarks(
    closeCorners(buildWallBodies(buildWallRuns(wallSegments, snap), { unitsPerMetre }), unitsPerMetre * 0.2),
    marks,
    unitsPerMetre * 0.8,
    unitsPerMetre * 0.8,
  );
  const draftMax = unitsPerMetre * 0.15;
  const doorMax = unitsPerMetre * 1.3;
  const windowMax = unitsPerMetre * 3.2;
  const blockReach = unitsPerMetre * 1.2;
  const glazeReach = unitsPerMetre * 0.5;
  const glaze = glazingSegments.map((s) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }));

  const bridges: OpeningBridge[] = [];
  for (const gap of bridgesAcrossGaps(walls, (g) => g.to - g.from <= windowMax)) {
    const span = gap.to - gap.from;
    const reason: OpeningBridge["reason"] | null =
      span <= draftMax
        ? "draft"
        : span <= doorMax
          ? "door"
          : glaze.some((p) => inGap(gap, p.x, p.y, glazeReach))
            ? "glazing"
            : marks.some((p) => inGap(gap, p.x, p.y, blockReach))
              ? "block"
              : null;
    if (reason) bridges.push({ ...gap, reason });
  }

  const openGaps = bridgesAcrossGaps(
    walls,
    (g) => g.to - g.from > draftMax && g.to - g.from <= unitsPerMetre * 6 && !bridges.some((b) => b.orientation === g.orientation && Math.abs(b.from - g.from) < 1 && Math.abs(b.centre - g.centre) < Math.max(b.thickness, g.thickness)),
  );
  const openings = bridges.filter((b) => b.reason !== "draft");
  return {
    walls,
    bridges,
    // A corner drawn 1.5 m short of the crossing wall still leaks. 1.7 m
    // reaches those notches. A patch that would also fill a detected opening
    // is dropped, so a door stays a door.
    patches: cornerNotchPatches(walls, unitsPerMetre * 1.7).filter((patch) => !openings.some((b) => patchFillsOpening(patch, b))),
    openGaps,
  };
}

function cutOpeningsAtMarks(
  bodies: WallBody[],
  marks: Array<{ x: number; y: number; width?: number }>,
  width: number,
  reach: number,
): WallBody[] {
  let out = bodies;
  for (const mark of marks) {
    const opening = mark.width && mark.width > 0 ? mark.width : width;
    const next: WallBody[] = [];
    for (const body of out) {
      const along = body.orientation === "h" ? mark.x : mark.y;
      const across = body.orientation === "h" ? Math.abs(mark.y - body.centre) : Math.abs(mark.x - body.centre);
      if (across > body.thickness / 2 + reach || along < body.from - reach || along > body.to + reach) {
        next.push(body);
        continue;
      }
      const cutFrom = along - opening / 2;
      const cutTo = along + opening / 2;
      if (body.from < cutFrom - 5) next.push({ ...body, to: Math.min(body.to, cutFrom) });
      if (body.to > cutTo + 5) next.push({ ...body, from: Math.max(body.from, cutTo) });
    }
    out = next;
  }
  return out;
}

function patchFillsOpening(
  patch: { x: number; y: number; w: number; h: number },
  opening: WallBody,
): boolean {
  const rect = {
    x: opening.orientation === "h" ? opening.from : opening.centre - opening.thickness / 2,
    y: opening.orientation === "h" ? opening.centre - opening.thickness / 2 : opening.from,
    w: opening.orientation === "h" ? opening.to - opening.from : opening.thickness,
    h: opening.orientation === "h" ? opening.thickness : opening.to - opening.from,
  };
  const x0 = Math.max(patch.x, rect.x);
  const y0 = Math.max(patch.y, rect.y);
  const x1 = Math.min(patch.x + patch.w, rect.x + rect.w);
  const y1 = Math.min(patch.y + patch.h, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return false;
  const span = opening.to - opening.from;
  const along = opening.orientation === "h" ? x1 - x0 : y1 - y0;
  return along > span * 0.45;
}

/**
 * Fills the notch where a horizontal wall and a vertical wall stop near each
 * other. Two ends of the same direction are a doorway, and those stay open
 * here so a door can still be told from a corner.
 */
function cornerNotchPatches(
  bodies: WallBody[],
  reach: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const ends = bodies.flatMap((b) =>
    [b.from, b.to].map((at) =>
      b.orientation === "h"
        ? { x: at, y: b.centre, orientation: "h" as const }
        : { x: b.centre, y: at, orientation: "v" as const },
    ),
  );
  const patches: Array<{ x: number; y: number; w: number; h: number }> = [];
  const thick = Math.max(8, reach * 0.08);
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      if (a.orientation === b.orientation) continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > reach || dy > reach || (dx < 1 && dy < 1)) continue;
      patches.push({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(dx, thick),
        h: Math.max(dy, thick),
      });
    }
  }
  return patches;
}

/**
 * A door drawn on top of an unbroken wall: short ticks on the door layer,
 * about a door apart. The mark sits on the wall, and its width is the span
 * between those ticks, so the flood can step through.
 */
export function doorMarksOnWalls(
  doorSegments: VectorSegment[],
  wallSegments: VectorSegment[],
  unitsPerMetre: number,
): Array<{ x: number; y: number; width: number; axis: "h" | "v" }> {
  const join = unitsPerMetre * 1.5;
  const near = unitsPerMetre * 0.5;
  const minW = unitsPerMetre * 0.45;
  const maxW = unitsPerMetre * 1.3;
  const fallback = unitsPerMetre * 0.8;
  const walls = wallSegments.filter(axisAligned);
  const clusters: VectorSegment[][] = [];
  for (const segment of doorSegments) {
    const hit = clusters.find((group) => group.some((other) => segmentDistance(segment, other) <= join));
    if (hit) hit.push(segment);
    else clusters.push([segment]);
  }
  const marks: Array<{ x: number; y: number; width: number; axis: "h" | "v" }> = [];
  for (const group of clusters) {
    const pts = group.flatMap((segment) => [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    ]);
    let best: VectorSegment | null = null;
    let bestLen = 0;
    for (const wall of walls) {
      const touched = pts.some((point) => pointSegmentDistance(point, wall) <= near);
      if (!touched) continue;
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      if (len > bestLen) {
        best = wall;
        bestLen = len;
      }
    }
    if (!best) continue;
    const horizontal = Math.abs(best.y1 - best.y2) <= Math.abs(best.x1 - best.x2);
    const close = pts.filter((point) => pointSegmentDistance(point, best!) <= near);
    const used = close.length > 0 ? close : pts;
    const along = used.map((point) => (horizontal ? point.x : point.y));
    const span = Math.max(...along) - Math.min(...along);
    const width = span >= minW && span <= maxW ? span : fallback;
    const mid = span >= minW && span <= maxW ? (Math.min(...along) + Math.max(...along)) / 2 : used.reduce((sum, point) => sum + (horizontal ? point.x : point.y), 0) / used.length;
    const centre = horizontal ? (best.y1 + best.y2) / 2 : (best.x1 + best.x2) / 2;
    marks.push(horizontal ? { x: mid, y: centre, width, axis: "h" } : { x: centre, y: mid, width, axis: "v" });
  }
  return marks;
}

function axisAligned(segment: VectorSegment): boolean {
  return Math.abs(segment.x1 - segment.x2) <= 1e-6 || Math.abs(segment.y1 - segment.y2) <= 1e-6;
}

function segmentDistance(a: VectorSegment, b: VectorSegment): number {
  return Math.min(
    pointSegmentDistance({ x: a.x1, y: a.y1 }, b),
    pointSegmentDistance({ x: a.x2, y: a.y2 }, b),
    pointSegmentDistance({ x: b.x1, y: b.y1 }, a),
    pointSegmentDistance({ x: b.x2, y: b.y2 }, a),
  );
}

function pointSegmentDistance(point: { x: number; y: number }, segment: VectorSegment): number {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / len2));
  return Math.hypot(point.x - (segment.x1 + t * dx), point.y - (segment.y1 + t * dy));
}
