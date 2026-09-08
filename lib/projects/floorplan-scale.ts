import { findFurniture } from "@/lib/projects/floorplan-furniture";
import {
  clipBodiesToBounds,
  findOpenings,
  footprintByScanFill,
  smoothFootprint,
  spanArea,
  wallBodiesFromHatch,
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
): ScaleLock | null {
  const from = search?.from ?? 40;
  const to = search?.to ?? 72;
  const step = search?.step ?? 1;
  const tolerance = search?.tolerance ?? 0.08;

  const candidates: ScaleLock[] = [];
  for (let unitsPerMetre = from; unitsPerMetre <= to; unitsPerMetre += step) {
    // Truncated at the boundary, not dropped: the party wall straddles it and
    // is still this flat's east wall.
    const bodies = clipBodiesToBounds(
      wallBodiesFromHatch(segments, { unitsPerMetre }),
      bounds,
      8,
      { truncate: true },
    );
    // Scanline, not flood. See footprintByScanFill: a flood cannot isolate a
    // flat on a sheet that carries two, and a scanline cannot leak.
    // Closed to about a third of a metre, which fills the scanline's notches
    // and leaves every real step in the outline — those are metres across.
    const floor = smoothFootprint(footprintByScanFill(bodies, bounds), unitsPerMetre * 0.33);
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
      wallBodiesFromHatch(segments, { unitsPerMetre, keepOpenings: true }),
      bounds,
      8,
      { truncate: true },
    );
    const doorLike = findOpenings(pieces, unitsPerMetre * 2.4, unitsPerMetre * 0.6).filter((o) => {
      const cm = ((o.to - o.from) / unitsPerMetre) * 100;
      return cm >= 75 && cm <= 110;
    }).length;
    if (doorLike === 0) continue;

    const areaError = floorM2 / printedAreaM2 - 1;
    candidates.push({ unitsPerMetre, beds, floorM2, areaError, floor, bodies });
  }

  // Bed count first, area second. Area alone is the measure that can be
  // satisfied by the wrong answer — it settled on 41 units/m at 0.1% error with
  // a single bed, where 56 finds four. Beds are the scale-free signal, so the
  // area only chooses among the scales that read the furniture properly.
  const mostBeds = candidates.reduce((most, c) => Math.max(most, c.beds), 0);
  if (mostBeds === 0) return null;
  // Within one of the best. The count is not exact — a bed drawn against a
  // wardrobe can merge, or a bedside table can read as a bed — so demanding the
  // maximum picks a scale on a one-bed accident. On דירה 14 the maximum is five
  // at 61 units/m, where the area is 13% out; four is found across 52 to 60, and
  // the area crosses zero inside that range.
  const contenders = candidates.filter((c) => c.beds >= mostBeds - 1);
  let best: ScaleLock | null = null;
  for (const c of contenders) {
    if (!best || Math.abs(c.areaError) < Math.abs(best.areaError)) best = c;
  }

  // Refuse rather than return a scale the area does not support: every measure
  // this replaces would hand back a confident wrong number.
  if (!best || Math.abs(best.areaError) > tolerance) return null;
  return best;
}
