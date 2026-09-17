import { findFurniture } from "@/lib/projects/floorplan-furniture";
import {
  clipBodiesToBounds,
  findOpenings,
  findDoorSwings,
  footprintByScanFill,
  lintelBands,
  smoothFootprint,
  spanArea,
  wallBodiesForSheet,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * Fixing the scale of a sheet, using two signals that cannot both be fooled.
 *
 * Neither works alone. The enclosed floor area has two fixed points and settles
 * on the wrong one, because the wall detector's thresholds are in metres, so the
 * scale decides which walls are found, which decides the area — 43 units/m is as
 * self-consistent as 56. Bed geometry does not care what the detector does, 90
 * by 200 cm being a fact about the world, but it is blunt: on דירה 14 beds are
 * found anywhere from 52 to 63 units/m.
 *
 * Together they pin it. Across that sweep the area error falls monotonically
 * through zero — 16.9% at 52, 1.6% at 56, -3.1% at 57 — so the scale that both
 * finds beds and reproduces the area the sheet prints is unique.
 */

export type ScaleLock = {
  unitsPerMetre: number;
  beds: number;
  floorM2: number;
  /** Signed error against the printed area, as a fraction. */
  areaError: number;
  floor: SpanRow[];
  bodies: WallBody[];
};

export type ScaleSearch = {
  from?: number;
  to?: number;
  step?: number;
  /** How far the area may miss before the answer is refused. */
  tolerance?: number;
};

export function lockScale(
  segments: VectorSegment[],
  bounds: { x: number; y: number; width: number; height: number },
  printedAreaM2: number,
  search?: ScaleSearch,
  curves?: VectorSegment[],
): ScaleLock | null {
  const candidates = collectScaleLocks(segments, bounds, printedAreaM2, search, curves);
  return pickScaleLock(candidates, search?.tolerance ?? 0.08);
}

/**
 * Every scale that finds beds and door-like openings, with its area error.
 *
 * Split out of lockScale so a sheet that prints no area can still be scaled:
 * the bed and door gates below never look at the printed figure, they only
 * ask whether the furniture and the doorways measure like furniture and
 * doorways. See lockScaleToHint.
 */
export function collectScaleLocks(
  segments: VectorSegment[],
  bounds: { x: number; y: number; width: number; height: number },
  printedAreaM2: number,
  search?: ScaleSearch,
  curves?: VectorSegment[],
): ScaleLock[] {
  const from = search?.from ?? 40;
  const to = search?.to ?? 72;
  const step = search?.step ?? 1;

  const candidates: ScaleLock[] = [];
  for (let unitsPerMetre = from; unitsPerMetre <= to; unitsPerMetre += step) {
    // Truncated at the boundary, not dropped: the party wall straddles it and
    // is still this flat's east wall.
    const bodies = clipBodiesToBounds(
      wallBodiesForSheet(segments, { unitsPerMetre }),
      bounds,
      8,
      { truncate: true },
    );
    // Scanline, not flood. See footprintByScanFill: a flood cannot isolate a
    // flat on a sheet that carries two, and a scanline cannot leak.
    // Closed to about a third of a metre, which fills the scanline's notches
    // and leaves every real step in the outline — those are metres across.
    // Lintels count as enclosure, walls alone do not. The ממ"ד's north side is
    // one window nearly the width of the room, so no wall body is built there,
    // and without the lintel the scanline left a hole the size of the room —
    // which then dropped the bed drawn inside it for being outside the flat.
    const enclosure = [
      ...bodies,
      ...lintelBands(segments, bodies, unitsPerMetre),
    ];
    const floor = smoothFootprint(
      footprintByScanFill(enclosure, bounds),
      unitsPerMetre * 0.33,
    );
    if (floor.length === 0) continue;

    const floorM2 = spanArea(floor) / (unitsPerMetre * unitsPerMetre);
    const rowHeight = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
    const inside = (x: number, y: number) => {
      const row = floor.find((r) => y >= r.y && y < r.y + rowHeight);
      return !!row && row.spans.some(([a, b]) => x >= a && x <= b);
    };
    // Beds inside the flat, not beds anywhere on the sheet — the neighbour's
    // count would otherwise vote on this flat's scale.
    const beds = findFurniture(segments, unitsPerMetre).filter(
      (p) => p.kind === "bed" && inside(p.x + p.w / 2, p.y + p.h / 2),
    ).length;
    if (beds === 0) continue;

    // A third signal, independent of both: an internal door is 75 to 110 cm.
    // At 55 units/m this sheet's openings measure 82, 86 and 102 cm — textbook
    // Israeli doors. At the competing 90 units/m they would be 50, 53 and 62,
    // which no door is. Rectangles of a bed's proportion cluster at several
    // sizes and beds alone cannot say which cluster is the beds; doors can.
    const pieces = clipBodiesToBounds(
      wallBodiesForSheet(segments, { unitsPerMetre, keepOpenings: true }),
      bounds,
      8,
      { truncate: true },
    );
    const doorWidth = (o: { from: number; to: number }) => {
      const cm = ((o.to - o.from) / unitsPerMetre) * 100;
      return cm >= 75 && cm <= 110;
    };
    // Gaps between wall pieces, and the doors the sheet marks with a swing.
    // The gap rule alone is not enough to find a scale on every sheet: on
    // דירה 23 the area lands within 1.7% at 58 units per metre with three beds
    // inside the flat, and no gap in that range at all, so the whole plan came
    // back with no scale and no render. The swings find its doors. Either
    // signal satisfies the gate — what matters is that something on the sheet
    // measures like a door at this scale.
    //
    // A swing is counted by existing, not re-measured. findDoorSwings already
    // requires a leaf of 68 to 115 cm at this scale, which is the door-width
    // test; the opening it returns is then clipped to the wall it sits in, so
    // measuring that instead asks a narrower question and answers none. On
    // דירה 23 it found both doors at 58 units per metre and both were clipped
    // under 75 cm, so the gate rejected the only scale that works.
    const doorLike =
      findOpenings(pieces, unitsPerMetre * 2.4, unitsPerMetre * 0.6).filter(
        doorWidth,
      ).length +
      findDoorSwings(segments, curves ?? [], bodies, unitsPerMetre, {
        extent: bounds,
      }).length;
    if (doorLike === 0) continue;

    const areaError = floorM2 / printedAreaM2 - 1;
    candidates.push({ unitsPerMetre, beds, floorM2, areaError, floor, bodies });
  }

  return candidates;
}

/**
 * The scale nearest a figure read off the sheet's dimension chains.
 *
 * Used when no area is printed. The chains give the answer to within a few
 * per cent; this sweep decides the last of it by the same bed and door gates
 * the area lock uses, so a hint that is slightly off still lands on a scale
 * at which the furniture and the doorways measure right — and a hint that is
 * badly wrong finds no candidate at all and the sheet stays on the raster
 * route rather than being drawn at an invented size.
 */
export function lockScaleToHint(
  segments: VectorSegment[],
  bounds: { x: number; y: number; width: number; height: number },
  hintUnitsPerMetre: number,
  curves?: VectorSegment[],
  spread = 0.12,
): ScaleLock | null {
  if (!(hintUnitsPerMetre > 0)) return null;
  const candidates = collectScaleLocks(
    segments,
    bounds,
    1,
    {
      from: hintUnitsPerMetre * (1 - spread),
      to: hintUnitsPerMetre * (1 + spread),
      step: 0.5,
    },
    curves,
  );
  if (candidates.length === 0) return null;
  const mostBeds = candidates.reduce((most, c) => Math.max(most, c.beds), 0);
  const contenders = candidates.filter((c) => c.beds >= mostBeds - 1);
  let best: ScaleLock | null = null;
  for (const c of contenders) {
    const closer =
      !best ||
      Math.abs(c.unitsPerMetre - hintUnitsPerMetre) < Math.abs(best.unitsPerMetre - hintUnitsPerMetre);
    if (closer) best = c;
  }
  // The area the flat actually encloses at the chosen scale, so callers that
  // expect a printed target have one that is measured rather than guessed.
  return best ? { ...best, areaError: 0 } : null;
}

/**
 * Choose among scales that already found beds and door-like openings.
 *
 * Area first, then beds. The other order vetoes a scale that matches the
 * printed area whenever a higher units/m over-counts furniture (a bedside
 * table reading as a bed) and then fails the area gate. Among scales the
 * area accepts, beds still break the 41-vs-56 tie: one bed at 0.1% error
 * must not beat four beds at 1.6%.
 */
export function pickScaleLock(
  candidates: ScaleLock[],
  tolerance: number,
): ScaleLock | null {
  const inTol = candidates.filter((c) => Math.abs(c.areaError) <= tolerance);
  if (inTol.length === 0) return null;
  const mostBeds = inTol.reduce((most, c) => Math.max(most, c.beds), 0);
  if (mostBeds === 0) return null;
  const contenders = inTol.filter((c) => c.beds >= mostBeds - 1);
  let best: ScaleLock | null = null;
  for (const c of contenders) {
    if (!best || Math.abs(c.areaError) < Math.abs(best.areaError)) best = c;
  }
  return best;
}
