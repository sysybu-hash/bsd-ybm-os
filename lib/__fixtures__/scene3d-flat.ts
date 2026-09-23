import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import type { SpanRow } from "@/lib/projects/floorplan-solid";

/**
 * A measured flat, in centimetres: 6.00 by 4.00, split by a partition with a
 * door in it, one window in the top wall, one bed in the left room.
 *
 * Everything here stands in for a measurement, and the scene tests hold the
 * builder to adding nothing to it. Shared, because the payload tests need the
 * same flat to prove a stored run rebuilds the identical scene.
 */

export const FIXTURE_UPM = 100;
export const FIXTURE_PITCH = 10;

export function fixtureRows(x0: number, x1: number, y0: number, y1: number): SpanRow[] {
  const out: SpanRow[] = [];
  for (let y = y0; y < y1; y += FIXTURE_PITCH) out.push({ y, spans: [[x0, x1]] });
  return out;
}

export const LEFT_ROWS = fixtureRows(10, 296, 10, 390);
export const RIGHT_ROWS = fixtureRows(304, 590, 10, 390);

export function fixtureRoom(
  name: string,
  kind: SegmentedRoom["kind"],
  span: SpanRow[],
  areaM2: number,
): SegmentedRoom {
  const xs = span.flatMap((r) => r.spans.flat());
  const ys = span.map((r) => r.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    rows: span,
    bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) + FIXTURE_PITCH - y },
    areaM2,
    kind,
    name,
    bedCount: kind === "bedroom" ? 1 : 0,
    contents: [],
  };
}

export function fixtureFlat(overrides?: Partial<BuiltFlat>): BuiltFlat {
  return {
    unitsPerMetre: FIXTURE_UPM,
    bodies: [
      { orientation: "h", centre: 5, thickness: 10, from: 0, to: 600 },
      { orientation: "h", centre: 395, thickness: 10, from: 0, to: 600 },
      { orientation: "v", centre: 5, thickness: 10, from: 0, to: 400 },
      { orientation: "v", centre: 595, thickness: 10, from: 0, to: 400 },
      { orientation: "v", centre: 300, thickness: 8, from: 0, to: 400 },
    ],
    floor: [...LEFT_ROWS, ...RIGHT_ROWS],
    furniture: [{ x: 40, y: 40, w: 90, h: 200, kind: "bed", widthCm: 90, depthCm: 200 }],
    openings: [
      { orientation: "v", centre: 300, thickness: 8, from: 150, to: 240, kind: "door" },
      { orientation: "h", centre: 5, thickness: 10, from: 200, to: 380, kind: "window" },
    ],
    terraces: [],
    printedTerraceCount: 0,
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    floorM2: 22.9,
    areaError: 0,
    svg: "",
    ...overrides,
  } as BuiltFlat;
}

export const FIXTURE_ROOMS: SegmentedRoom[] = [
  fixtureRoom("ח.שינה", "bedroom", LEFT_ROWS, 11.4),
  fixtureRoom("ח.מגורים", "living", RIGHT_ROWS, 11.4),
];
