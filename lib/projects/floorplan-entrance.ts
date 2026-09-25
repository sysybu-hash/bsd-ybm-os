import type { Opening, SpanRow, WallBody } from "@/lib/projects/floorplan-solid";
import { bodyRect, spansContain } from "@/lib/projects/floorplan-solid";
import type { OpeningKind } from "@/lib/projects/floorplan-wall-openings";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * The front door, from the sheet's own entrance arrow.
 *
 * A sales sheet marks the way in with a small black triangle outside the
 * door, pointing into the flat. Nothing else says which opening is the front
 * door. The door-or-window test reads the floor on either side of a gap, and
 * the landing outside the front door is not the flat's floor, so the front
 * door came out as a window on five of the ten reference sheets. On three more
 * no opening was found there at all. The still had no front door and no
 * mezuzah where it matters most.
 */

export type EntranceMarker = { x: number; y: number; dx: number; dy: number };

/** The arrow's size on these sheets, in page points: a 23 by 13 triangle. */
const BASE_MIN = 20;
const BASE_MAX = 26;
const HEIGHT = 13;

/**
 * Every entrance arrow on the page: a base of about 23 points with both ends
 * joined to an apex 13 points off its middle. The apex gives the direction in.
 */
export function findEntranceMarkers(segments: VectorSegment[]): EntranceMarker[] {
  const close = (a: number, b: number, t: number) => Math.abs(a - b) <= t;
  const joins = (x: number, y: number, ax: number, ay: number) =>
    segments.some(
      (s) =>
        (close(s.x1, x, 1.2) && close(s.y1, y, 1.2) && close(s.x2, ax, 2) && close(s.y2, ay, 2)) ||
        (close(s.x2, x, 1.2) && close(s.y2, y, 1.2) && close(s.x1, ax, 2) && close(s.y1, ay, 2)),
    );
  const out: EntranceMarker[] = [];
  for (const base of segments) {
    const length = Math.hypot(base.x2 - base.x1, base.y2 - base.y1);
    if (length < BASE_MIN || length > BASE_MAX) continue;
    const horizontal = Math.abs(base.y2 - base.y1) < 0.8;
    const vertical = Math.abs(base.x2 - base.x1) < 0.8;
    if (!horizontal && !vertical) continue;
    const mx = (base.x1 + base.x2) / 2;
    const my = (base.y1 + base.y2) / 2;
    for (const sign of [-1, 1] as const) {
      const ax = horizontal ? mx : mx + sign * HEIGHT;
      const ay = horizontal ? my + sign * HEIGHT : my;
      if (!joins(base.x1, base.y1, ax, ay) || !joins(base.x2, base.y2, ax, ay)) continue;
      if (out.some((m) => close(m.x, mx, 3) && close(m.y, my, 3))) continue;
      out.push({ x: mx, y: my, dx: horizontal ? 0 : sign, dy: horizontal ? sign : 0 });
    }
  }
  return out;
}

type Placed = Opening & { kind: OpeningKind };

/**
 * The front door among the openings: the one the arrow points through, made a
 * door; or, where no opening was found there, a door opened in the wall the
 * arrow crosses, a standard 90 cm wide.
 *
 * An arrow counts only from outside the flat, with the flat's floor within a
 * metre and a half ahead of it and running on for a metre after — a doorway
 * leads into a hall. The sheets carry other triangles of the same size, and
 * the neighbours' arrows, which fail one of the two.
 */
export function placeEntranceDoor(
  openings: Placed[],
  markers: EntranceMarker[],
  flat: { floor: SpanRow[]; bodies: WallBody[]; unitsPerMetre: number },
): Placed[] {
  const upm = flat.unitsPerMetre;
  const step = upm * 0.02;
  const onFloor = (x: number, y: number) => spansContain(flat.floor, x, y);
  let best: { marker: EntranceMarker; entry: number } | null = null;
  for (const marker of markers) {
    if (onFloor(marker.x, marker.y)) continue;
    let entry: number | null = null;
    for (let t = step; t <= upm * 1.5; t += step) {
      if (onFloor(marker.x + marker.dx * t, marker.y + marker.dy * t)) {
        entry = t;
        break;
      }
    }
    if (entry == null) continue;
    let run = 0;
    for (let t = entry; t <= entry + upm * 1.0; t += step) {
      if (!onFloor(marker.x + marker.dx * t, marker.y + marker.dy * t)) break;
      run = t - entry;
    }
    if (run < upm * 0.95) continue;
    if (!best || entry < best.entry) best = { marker, entry };
  }
  if (!best) return openings;

  const { marker, entry } = best;
  const wall: "h" | "v" = marker.dx === 0 ? "h" : "v";
  const along = wall === "h" ? marker.x : marker.y;
  const crossAt = wall === "h" ? marker.y + marker.dy * entry : marker.x + marker.dx * entry;
  const reach = upm * 0.6;

  // The opening the arrow points through, whatever it was called.
  const hit = openings.findIndex(
    (o) =>
      o.orientation === wall &&
      Math.abs(o.centre - crossAt) <= reach &&
      o.from <= along + upm * 0.3 &&
      o.to >= along - upm * 0.3,
  );
  if (hit >= 0) {
    return openings.map((o, i) => (i === hit ? { ...o, kind: "door" as const } : o));
  }

  // None there: the wall the arrow crosses, between the arrow and the floor.
  const crossed = flat.bodies.find((body) => {
    if (body.orientation !== wall) return false;
    const r = bodyRect(body);
    for (let t = 0; t <= entry + step; t += step) {
      const x = marker.x + marker.dx * t;
      const y = marker.y + marker.dy * t;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  });
  if (!crossed) {
    const between = doorBetweenJambs(marker, entry, wall, flat.bodies, upm);
    return between ? [...openings, between] : openings;
  }
  const half = upm * 0.45;
  return [
    ...openings,
    {
      orientation: wall,
      centre: crossed.centre,
      thickness: crossed.thickness,
      from: along - half,
      to: along + half,
      kind: "door" as const,
    },
  ];
}

/**
 * A front door with no wall line to sit in: between two jambs.
 *
 * On דירה 14 the door stands between the ends of two walls that run the other
 * way, and the arrow points straight through the gap — it crosses no wall. The
 * door is that gap: from the inner face of the jamb on one side of the arrow
 * to the jamb on the other, where the floor begins, if it is a door's width.
 */
function doorBetweenJambs(
  marker: EntranceMarker,
  entry: number,
  wall: "h" | "v",
  bodies: WallBody[],
  upm: number,
): Placed | null {
  const along = wall === "h" ? marker.x : marker.y;
  const lineAt = wall === "h" ? marker.y + marker.dy * entry : marker.x + marker.dx * entry;
  const jambs = bodies
    .filter((body) => body.orientation !== wall)
    .map((body) => ({ body, r: bodyRect(body) }))
    // Reaching the door line, give or take a wall's thickness.
    .filter(({ r }) =>
      wall === "h"
        ? r.y <= lineAt + upm * 0.3 && r.y + r.h >= lineAt - upm * 0.3
        : r.x <= lineAt + upm * 0.3 && r.x + r.w >= lineAt - upm * 0.3,
    );
  const faceLow = (r: { x: number; y: number; w: number; h: number }) => (wall === "h" ? r.x + r.w : r.y + r.h);
  const faceHigh = (r: { x: number; y: number; w: number; h: number }) => (wall === "h" ? r.x : r.y);
  const low = jambs
    .filter(({ r }) => faceLow(r) <= along)
    .sort((a, b) => faceLow(b.r) - faceLow(a.r))[0];
  const high = jambs
    .filter(({ r }) => faceHigh(r) >= along)
    .sort((a, b) => faceHigh(a.r) - faceHigh(b.r))[0];
  if (!low || !high) return null;
  const from = faceLow(low.r);
  const to = faceHigh(high.r);
  if (to - from < upm * 0.7 || to - from > upm * 1.3) return null;
  return {
    orientation: wall,
    centre: lineAt,
    thickness: Math.min(low.body.thickness, high.body.thickness),
    from,
    to,
    kind: "door" as const,
  };
}
