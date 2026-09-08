import {
  bodyRect,
  interiorComponents,
  openingRect,
  spanArea,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";

/**
 * A flat as the rooms a door can reach, rather than as one flood of the sheet.
 *
 * Flooding the whole drawing and taking the largest enclosed region does not
 * isolate an apartment. It cannot: the walls are 91% of the sheet's hatch and
 * that is still not a watertight envelope, so the flood runs out through
 * whatever is missing and swallows the neighbour, the stair core and the
 * terraces. On the uncut דירה 14 the "isolated flat" measured 639 x 1040 units
 * against a sheet of 638 x 1036 — the whole drawing — and its 134.2 m² agreed
 * with the printed 132.19 only because the scale had been solved to make it.
 *
 * Rooms are different. A room is small and its walls close around it, so it
 * survives a leaky envelope. And an apartment is exactly the set of rooms you
 * can walk between: doors join rooms within a flat, and no door joins one flat
 * to the next.
 */

export type RoomGroup = {
  rooms: SpanRow[][];
  /** Every room in the group, as one set of spans. */
  floor: SpanRow[];
  areaUnits: number;
};

/** Rooms: the enclosed cells when every wall is a barrier. */
export function findRooms(
  bodies: WallBody[],
  bounds: { x: number; y: number; width: number; height: number },
  options?: { resolution?: number; minAreaUnits?: number },
): SpanRow[][] {
  const rooms = interiorComponents(bodies, bounds, {
    resolution: options?.resolution ?? 2,
    // Every wall divides. Bridging doorways here would merge rooms back into
    // one flood, which is the thing this exists to avoid.
    maxOpeningUnits: 1,
    cornerReachUnits: 0,
    excludeWalls: true,
  });
  const minArea = options?.minAreaUnits ?? 0;
  return rooms.filter((room) => spanArea(room) >= minArea);
}

/** Whether a span set covers a point. */
function covers(room: SpanRow[], x: number, y: number, pitch: number): boolean {
  const row = room.find((r) => y >= r.y - pitch && y < r.y + pitch * 2);
  return !!row && row.spans.some(([a, b]) => x >= a - pitch && x <= b + pitch);
}

/**
 * Groups rooms into flats by walking through the doorways.
 *
 * A doorway joins the rooms on either side of it. Sampling just outside each end
 * of the opening finds them; a door to a landing or a stairwell finds a room on
 * one side only, and joins nothing.
 */
export function groupRoomsByDoors(
  rooms: SpanRow[][],
  openings: Opening[],
  pitch = 2,
): RoomGroup[] {
  const parent = rooms.map((_, i) => i);
  const find = (a: number): number => {
    let n = a;
    while (parent[n] !== n) {
      parent[n] = parent[parent[n]!]!;
      n = parent[n]!;
    }
    return n;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const opening of openings) {
    const r = openingRect(opening);
    const reach = opening.thickness * 0.8 + pitch * 2;
    // Two probes, one just beyond each face of the wall the door sits in.
    const probes: Array<[number, number]> =
      opening.orientation === "h"
        ? [
            [r.x + r.w / 2, r.y - reach],
            [r.x + r.w / 2, r.y + r.h + reach],
          ]
        : [
            [r.x - reach, r.y + r.h / 2],
            [r.x + r.w + reach, r.y + r.h / 2],
          ];
    const touched = rooms
      .map((room, i) => (probes.some(([x, y]) => covers(room, x, y, pitch)) ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 1; i < touched.length; i++) union(touched[0]!, touched[i]!);
  }

  const byRoot = new Map<number, number[]>();
  rooms.forEach((_, i) => {
    const root = find(i);
    byRoot.set(root, [...(byRoot.get(root) ?? []), i]);
  });

  return [...byRoot.values()]
    .map((indices) => {
      const group = indices.map((i) => rooms[i]!);
      const byRow = new Map<number, Array<[number, number]>>();
      for (const room of group) {
        for (const row of room) {
          byRow.set(row.y, [...(byRow.get(row.y) ?? []), ...row.spans]);
        }
      }
      const floor = [...byRow.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([y, spans]) => ({ y, spans: spans.sort((p, q) => p[0] - q[0]) }));
      return { rooms: group, floor, areaUnits: spanArea(floor) };
    })
    .sort((a, b) => b.areaUnits - a.areaUnits);
}

/** The group whose area is nearest what the sheet prints for the flat. */
export function pickFlat(
  groups: RoomGroup[],
  unitsPerMetre: number,
  printedAreaM2: number,
): RoomGroup | null {
  let best: RoomGroup | null = null;
  let bestError = Infinity;
  for (const group of groups) {
    const error = Math.abs(group.areaUnits / (unitsPerMetre * unitsPerMetre) - printedAreaM2);
    if (error < bestError) {
      bestError = error;
      best = group;
    }
  }
  return best;
}

/** Walls that bound a group: the group's floor lies against them. */
export function wallsAround(
  bodies: WallBody[],
  group: RoomGroup,
  pitch = 2,
): WallBody[] {
  return bodies.filter((body) => {
    const r = bodyRect(body);
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const probes: Array<[number, number]> = [
        [r.x + r.w * t, r.y - pitch],
        [r.x + r.w * t, r.y + r.h + pitch],
        [r.x - pitch, r.y + r.h * t],
        [r.x + r.w + pitch, r.y + r.h * t],
      ];
      if (probes.some(([x, y]) => covers(group.floor, x, y, pitch))) return true;
    }
    return false;
  });
}
