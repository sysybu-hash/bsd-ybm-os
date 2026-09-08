import { findFurniture } from "@/lib/projects/floorplan-furniture";
import {
  clipBodiesToBounds,
  interiorComponents,
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

  let best: ScaleLock | null = null;
  for (let unitsPerMetre = from; unitsPerMetre <= to; unitsPerMetre += step) {
    const bodies = clipBodiesToBounds(wallBodiesFromHatch(segments, { unitsPerMetre }), bounds);
    const components = interiorComponents(bodies, bounds, {
      maxOpeningUnits: unitsPerMetre * 2.0,
      cornerReachUnits: unitsPerMetre * 1.2,
    });
    const floor = components[0] ?? [];
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

    const areaError = floorM2 / printedAreaM2 - 1;
    if (!best || Math.abs(areaError) < Math.abs(best.areaError)) {
      best = { unitsPerMetre, beds, floorM2, areaError, floor, bodies };
    }
  }

  // Refuse rather than return a scale the area does not support: every measure
  // this replaces would hand back a confident wrong number.
  if (!best || Math.abs(best.areaError) > tolerance) return null;
  return best;
}
