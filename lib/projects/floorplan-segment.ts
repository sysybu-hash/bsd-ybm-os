import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { FloorplanRoom, FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import {
  bodyRect,
  bridgeOpenings,
  interiorComponents,
  spanArea,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import {
  isAxisAligned,
  WALL_MIN_LINE_WIDTH,
  type VectorSegment,
} from "@/lib/projects/floorplan-vector";

/**
 * The rooms of a flat, cut out of its own walls.
 *
 * Everything downstream of the geometry had been asking a vision model what
 * rooms the sheet contains, and the answer changed between attempts: on one
 * run of דירה 14 the auditor read four bedrooms and on the next three, from
 * the same drawing. That single unreliable number was deciding the booklet's
 * room table, the narrative under it, and whether a finish passed.
 *
 * A room is what a wall encloses, and the walls are already known exactly. So
 * the rooms are too: seal the doorways, take the connected regions of what is
 * left, and each one is a room whose area is measured rather than guessed.
 *
 * The kind comes from what stands in it, which is also known — a bath makes a
 * wet room, a hob makes the kitchen, a bed makes a bedroom. Nothing here reads
 * the sheet's Hebrew labels; those are drawn as outlines, not text, and a vision
 * pass over them is the one thing a model can add here later.
 */
export type SegmentedRoom = {
  rows: SpanRow[];
  bounds: { x: number; y: number; width: number; height: number };
  areaM2: number;
  kind: FloorplanRoomKind;
  /** Hebrew, and unique within the flat — "ח.שינה 2" where there are several. */
  name: string;
  bedCount: number;
  contents: FurniturePiece[];
  /**
   * Two rooms the flood could not tell apart, because the door between them was
   * never detected and the wall is drawn only along part of its run.
   *
   * No real room holds both a bed and a bath, or a dining table and a bath, so
   * the pair is proof of a merge rather than a guess at one. Recorded instead
   * of hidden: the confidence report counts these, and a flat with any of them
   * has not been fully read.
   */
  mergedKinds?: FloorplanRoomKind[];
};

const KIND_NAME_HE: Record<FloorplanRoomKind, string> = {
  living: "ח.מגורים",
  kitchen: "מטבח",
  bedroom: "ח.שינה",
  mmd: 'ממ"ד',
  bathroom: "ח.רחצה",
  balcony: "מרפסת",
  circulation: "מסדרון",
  utility: "ח.שירות",
  other: "חלל",
};

/**
 * A doorway, as a barrier — so a room does not leak into the next one.
 *
 * Padded along its length. A swing's opening is clipped to the wall it sits in
 * and centred on the hinge, so it can fall short of the gap it is meant to plug
 * by a few centimetres at either end — and a few centimetres is all a flood
 * needs. On דירה 14 that left the lower bedroom and the bathroom below it as
 * one 12 m² region.
 */
function sealOpening(opening: Opening, pad: number): WallBody {
  return {
    orientation: opening.orientation,
    centre: opening.centre,
    thickness: opening.thickness,
    from: opening.from - pad,
    to: opening.to + pad,
  };
}

function boundsOf(rows: SpanRow[], pitch: number) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const row of rows) {
    y0 = Math.min(y0, row.y);
    y1 = Math.max(y1, row.y + pitch);
    for (const [a, b] of row.spans) {
      x0 = Math.min(x0, a);
      x1 = Math.max(x1, b);
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function covers(rows: SpanRow[], pitch: number, x: number, y: number): boolean {
  const row = rows.find((r) => y >= r.y && y < r.y + pitch);
  return !!row && row.spans.some(([a, b]) => x >= a && x <= b);
}

/**
 * How thick the walls around a region are, at its four sides.
 *
 * The ממ"ד is the one room told apart by its structure rather than its
 * contents: it holds a bed like any bedroom, and what makes it a shelter is
 * reinforced concrete on every side. On these sheets that is 25 cm and up where
 * an ordinary partition is 8 to 15.
 */
function heavySides(
  bodies: WallBody[],
  box: { x: number; y: number; width: number; height: number },
  unitsPerMetre: number,
  internal?: (body: WallBody) => boolean,
): number {
  const heavy = unitsPerMetre * 0.25;
  const reach = unitsPerMetre * 0.35;
  const near = (test: (r: ReturnType<typeof bodyRect>) => boolean) =>
    bodies.some(
      (b) =>
        b.thickness >= heavy &&
        (!internal || internal(b)) &&
        test(bodyRect(b)),
    );
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;
  let count = 0;
  // North and south: a horizontal wall spanning the middle of the room.
  if (near((r) => r.y + r.h >= box.y - reach && r.y <= box.y && midX >= r.x && midX <= r.x + r.w)) count++;
  if (near((r) => r.y <= box.y + box.height + reach && r.y + r.h >= box.y + box.height && midX >= r.x && midX <= r.x + r.w)) count++;
  // West and east.
  if (near((r) => r.x + r.w >= box.x - reach && r.x <= box.x && midY >= r.y && midY <= r.y + r.h)) count++;
  if (near((r) => r.x <= box.x + box.width + reach && r.x + r.w >= box.x + box.width && midY >= r.y && midY <= r.y + r.h)) count++;
  return count;
}

export function segmentRooms(input: {
  bodies: WallBody[];
  openings: Opening[];
  floor: SpanRow[];
  furniture: FurniturePiece[];
  terraces?: SpanRow[][];
  bounds: { x: number; y: number; width: number; height: number };
  unitsPerMetre: number;
  /**
   * The sheet's own ink, so a room is bounded by what the draughtsman drew.
   *
   * Rebuilt bodies are clean but not complete: on דירה 14 no wall was rebuilt
   * between the lower bedroom and the bathroom below it, so the two flooded
   * into one 12 m² region and no amount of sealing doorways closed it — there
   * was no gap to seal, there was no wall. Only the heavy pen is used, which is
   * the layer the walls are drawn on; furniture is drawn thinner and would
   * otherwise cut every room up at its wardrobes.
   */
  segments?: VectorSegment[];
  /** Smallest region worth calling a room. Below this it is a niche or a jamb. */
  minRoomM2?: number;
}): SegmentedRoom[] {
  const { bodies, openings, floor, furniture, bounds, unitsPerMetre } = input;
  const minRoomM2 = input.minRoomM2 ?? 1.4;
  if (bodies.length === 0) return [];

  // Walls and sealed doorways together. Bridging is off: a doorway joins two
  // rooms, which is exactly what must not happen here.
  // Walls and sealed doorways together, with the envelope left to close itself.
  // maxOpeningUnits is what stops the outside pouring in through a gap in the
  // outer wall, so zeroing it does not seal the doors — it un-seals the flat,
  // and דירה 14 came back as two pockets totalling 18 m² instead of a plan.
  // The doorways are sealed here instead, as barriers of their own.
  // Every door-sized gap in every wall line, closed — not only the doorways that
  // were detected. Sealing the detected openings alone left דירה 14's lower
  // bedroom joined to the bathroom below it as one 12 m² region, because the
  // door between them was not among them. bridgeOpenings does not need to know
  // where the doors are: it joins the pieces of a wall across any gap short
  // enough to be one, which is the same question asked from the wall's side.
  const seal = unitsPerMetre * 0.25;
  const barriers = [
    ...bridgeOpenings(bodies, unitsPerMetre * 1.3),
    ...openings.map((o) => sealOpening(o, seal)),
  ];
  const ink = (input.segments ?? []).filter(
    (segment) => segment.lineWidth >= WALL_MIN_LINE_WIDTH && isAxisAligned(segment),
  );
  const components = interiorComponents(barriers, bounds, {
    excludeWalls: true,
    sealingSegments: ink.length > 0 ? ink : undefined,
  });
  if (components.length === 0) return [];

  const floorPitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const rooms: SegmentedRoom[] = [];

  for (const rows of components) {
    if (rows.length < 2) continue;
    const pitch = rows[1]!.y - rows[0]!.y;
    const areaM2 = spanArea(rows) / (unitsPerMetre * unitsPerMetre);
    if (areaM2 < minRoomM2) continue;
    const box = boundsOf(rows, pitch);

    // Inside the flat, not the neighbour's room or the landing.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (!covers(floor, floorPitch, cx, cy)) continue;

    const contents = furniture.filter((piece) =>
      covers(rows, pitch, piece.x + piece.w / 2, piece.y + piece.h / 2),
    );
    const onTerrace = (input.terraces ?? []).some((terrace) => {
      const tPitch = terrace.length > 1 ? terrace[1]!.y - terrace[0]!.y : 1;
      return covers(terrace, tPitch, cx, cy);
    });

    const classified = classifyRoomFromContents({ onTerrace, areaM2, contents });

    rooms.push({
      rows,
      bounds: box,
      areaM2: Math.round(areaM2 * 100) / 100,
      kind: classified.kind,
      name: KIND_NAME_HE[classified.kind],
      bedCount: classified.bedCount,
      contents,
      ...(classified.mergedKinds ? { mergedKinds: classified.mergedKinds } : {}),
    });
  }

  const split = splitMergedWetRooms(rooms, {
    bodies,
    ink,
    unitsPerMetre,
    floorPitch,
  });

  // At most one shelter. Every bedroom on these sheets has a thick wall or two
  // — an exterior wall counts — so the side test alone called three of דירה 14's
  // four bedrooms a ממ"ד. A flat has exactly one, and it is the bedroom with the
  // most concrete round it.
  // Heavy INTERNAL walls, not heavy walls. An exterior wall is thick everywhere,
  // so on a small flat every bedroom sits inside three of them and the side
  // count alone gave דירה 18, 19, 22 and 23 a shelter none of them has. What
  // makes a ממ"ד is concrete where the rest of the flat has partitions: a wall
  // with the flat's own floor on both sides of it.
  const isInternal = (body: WallBody) => {
    const r = bodyRect(body);
    const step = unitsPerMetre * 0.4;
    return body.orientation === "h"
      ? covers(floor, floorPitch, r.x + r.w / 2, r.y - step) &&
          covers(floor, floorPitch, r.x + r.w / 2, r.y + r.h + step)
      : covers(floor, floorPitch, r.x - step, r.y + r.h / 2) &&
          covers(floor, floorPitch, r.x + r.w + step, r.y + r.h / 2);
  };
  const shelter = split
    .filter((room) => room.kind === "bedroom")
    .map((room) => ({
      room,
      sides: heavySides(bodies, room.bounds, unitsPerMetre, isInternal),
    }))
    .filter((entry) => entry.sides >= 2)
    .sort((a, b) => b.sides - a.sides || a.room.areaM2 - b.room.areaM2)[0];
  if (shelter) {
    shelter.room.kind = "mmd";
    shelter.room.name = KIND_NAME_HE.mmd;
  }

  // Numbered where a flat has several of a kind, so the booklet's table can
  // list them separately instead of collapsing them into one row.
  const seen = new Map<FloorplanRoomKind, number>();
  const total = new Map<FloorplanRoomKind, number>();
  for (const room of split) {
    total.set(room.kind, (total.get(room.kind) ?? 0) + 1);
  }
  const named = split.map((room) => {
    if ((total.get(room.kind) ?? 0) < 2) return room;
    const index = (seen.get(room.kind) ?? 0) + 1;
    seen.set(room.kind, index);
    return { ...room, name: `${room.name} ${index}` };
  });
  return markEntranceHall(named, openings, floor, unitsPerMetre);
}

type ClusterPoint = { x: number; y: number };

function pieceCentre(piece: FurniturePiece): ClusterPoint {
  return { x: piece.x + piece.w / 2, y: piece.y + piece.h / 2 };
}

function clusterCentre(pieces: FurniturePiece[]): ClusterPoint | null {
  if (pieces.length === 0) return null;
  const sum = pieces.reduce(
    (acc, piece) => {
      const c = pieceCentre(piece);
      return { x: acc.x + c.x, y: acc.y + c.y };
    },
    { x: 0, y: 0 },
  );
  return { x: sum.x / pieces.length, y: sum.y / pieces.length };
}

/**
 * The nearest wall that has beds on one side and wet fixtures on the other.
 *
 * On דירה 14 the partition between the lower bedroom and the bathroom is
 * drawn only from x346 eastward; the flood treats the western gap as open
 * space and the two rooms become one 12 m² region. The ink that is there
 * still separates the bed from the bath, so the cut is that line — not a
 * guess at a door that was never found.
 */
function separatorBetweenClusters(
  beds: FurniturePiece[],
  fixtures: FurniturePiece[],
  bodies: WallBody[],
  ink: VectorSegment[],
): { orientation: "h" | "v"; at: number } | null {
  const bed = clusterCentre(beds);
  const wet = clusterCentre(fixtures);
  if (!bed || !wet) return null;
  const dx = wet.x - bed.x;
  const dy = wet.y - bed.y;
  const preferH = Math.abs(dy) >= Math.abs(dx);
  const fromBodies = (orientation: "h" | "v") => {
    const lo = orientation === "h" ? Math.min(bed.y, wet.y) : Math.min(bed.x, wet.x);
    const hi = orientation === "h" ? Math.max(bed.y, wet.y) : Math.max(bed.x, wet.x);
    let best: { at: number; score: number } | null = null;
    for (const body of bodies) {
      if (body.orientation !== orientation) continue;
      if (body.centre <= lo || body.centre >= hi) continue;
      const score = Math.abs(body.centre - (lo + hi) / 2);
      if (!best || score < best.score) best = { at: body.centre, score };
    }
    return best;
  };
  const fromInk = (orientation: "h" | "v") => {
    const lo = orientation === "h" ? Math.min(bed.y, wet.y) : Math.min(bed.x, wet.x);
    const hi = orientation === "h" ? Math.max(bed.y, wet.y) : Math.max(bed.x, wet.x);
    let best: { at: number; score: number } | null = null;
    for (const segment of ink) {
      const horizontal = Math.abs(segment.y2 - segment.y1) <= Math.abs(segment.x2 - segment.x1);
      if (horizontal !== (orientation === "h")) continue;
      const at = orientation === "h" ? (segment.y1 + segment.y2) / 2 : (segment.x1 + segment.x2) / 2;
      if (at <= lo || at >= hi) continue;
      const score = Math.abs(at - (lo + hi) / 2);
      if (!best || score < best.score) best = { at, score };
    }
    return best;
  };
  const order: Array<"h" | "v"> = preferH ? ["h", "v"] : ["v", "h"];
  for (const orientation of order) {
    const found = fromBodies(orientation) ?? fromInk(orientation);
    if (found) return { orientation, at: found.at };
  }
  return null;
}

function cutRowsAlong(
  rows: SpanRow[],
  separator: { orientation: "h" | "v"; at: number },
  unitsPerMetre: number,
): [SpanRow[], SpanRow[]] {
  const pad = unitsPerMetre * 0.04;
  const low: SpanRow[] = [];
  const high: SpanRow[] = [];
  if (separator.orientation === "h") {
    for (const row of rows) {
      if (row.y + pad < separator.at) low.push(row);
      else if (row.y - pad > separator.at) high.push(row);
    }
    return [low, high];
  }
  for (const row of rows) {
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (const [a, b] of row.spans) {
      if (b <= separator.at + pad) left.push([a, b]);
      else if (a >= separator.at - pad) right.push([a, b]);
      else {
        if (separator.at - pad - a > pad) left.push([a, separator.at - pad]);
        if (b - (separator.at + pad) > pad) right.push([separator.at + pad, b]);
      }
    }
    if (left.length) low.push({ y: row.y, spans: left });
    if (right.length) high.push({ y: row.y, spans: right });
  }
  return [low, high];
}

const LIVING_FURNITURE = new Set<FurniturePiece["kind"]>(["table", "hob", "sink", "seat"]);

/**
 * Kind from what stands in the region. A stray wet block must not rename the
 * whole open-plan living room; a real bathroom is the region that is wet and
 * has no dining/cooking/seating signal.
 */
function classifyRoomFromContents(input: {
  onTerrace?: boolean;
  areaM2: number;
  contents: FurniturePiece[];
}): {
  kind: FloorplanRoomKind;
  bedCount: number;
  mergedKinds?: FloorplanRoomKind[];
} {
  const has = (kind: FurniturePiece["kind"]) => input.contents.some((piece) => piece.kind === kind);
  const bedCount = input.contents.filter((piece) => piece.kind === "bed").length;
  const cooking = has("hob") || has("sink");
  const living = cooking || has("table") || (has("seat") && input.areaM2 >= 6);
  if (input.onTerrace) return { kind: "balcony", bedCount };
  if (bedCount > 0) {
    return {
      kind: "bedroom",
      bedCount,
      mergedKinds: has("fixture") ? (["bedroom", "bathroom"] as FloorplanRoomKind[]) : undefined,
    };
  }
  if (has("fixture") && living && input.areaM2 >= 12) {
    return { kind: "living", bedCount, mergedKinds: ["living", "bathroom"] };
  }
  if (has("fixture") && !living) return { kind: "bathroom", bedCount };
  if (cooking && has("table")) return { kind: "living", bedCount };
  if (cooking) return { kind: "kitchen", bedCount };
  if (has("table") || (has("seat") && input.areaM2 >= 6)) return { kind: "living", bedCount };
  if (has("storage")) return { kind: "utility", bedCount };
  return { kind: input.areaM2 < 4 ? "circulation" : "other", bedCount };
}

function classifyCut(
  rows: SpanRow[],
  furniture: FurniturePiece[],
  unitsPerMetre: number,
): SegmentedRoom | null {
  if (rows.length < 2) return null;
  const pitch = rows[1]!.y - rows[0]!.y;
  const areaM2 = spanArea(rows) / (unitsPerMetre * unitsPerMetre);
  if (areaM2 < 1.4) return null;
  const box = boundsOf(rows, pitch);
  const contents = furniture.filter((piece) =>
    covers(rows, pitch, piece.x + piece.w / 2, piece.y + piece.h / 2),
  );
  const classified = classifyRoomFromContents({ areaM2, contents });
  return {
    rows,
    bounds: box,
    areaM2: Math.round(areaM2 * 100) / 100,
    kind: classified.kind,
    name: KIND_NAME_HE[classified.kind],
    bedCount: classified.bedCount,
    contents,
    ...(classified.mergedKinds ? { mergedKinds: classified.mergedKinds } : {}),
  };
}

function wetMergeClusters(room: SegmentedRoom): [FurniturePiece[], FurniturePiece[]] | null {
  const fixtures = room.contents.filter((piece) => piece.kind === "fixture");
  if (fixtures.length === 0) return null;
  if (room.mergedKinds?.includes("bedroom")) {
    const beds = room.contents.filter((piece) => piece.kind === "bed");
    return beds.length > 0 ? [beds, fixtures] : null;
  }
  if (room.mergedKinds?.includes("living")) {
    const living = room.contents.filter((piece) => LIVING_FURNITURE.has(piece.kind));
    return living.length > 0 ? [living, fixtures] : null;
  }
  return null;
}

/**
 * A bed and a bath in one flood region is two rooms the doorway did not seal.
 * Cut them apart along the nearest wall that already sits between them.
 */
function splitMergedWetRooms(
  rooms: SegmentedRoom[],
  input: {
    bodies: WallBody[];
    ink: VectorSegment[];
    unitsPerMetre: number;
    floorPitch: number;
  },
): SegmentedRoom[] {
  const out: SegmentedRoom[] = [];
  for (const room of rooms) {
    if (!room.mergedKinds) {
      out.push(room);
      continue;
    }
    const clusters = wetMergeClusters(room);
    if (!clusters) {
      out.push(room);
      continue;
    }
    const separator = separatorBetweenClusters(clusters[0], clusters[1], input.bodies, input.ink);
    if (!separator) {
      out.push(room);
      continue;
    }
    const [a, b] = cutRowsAlong(room.rows, separator, input.unitsPerMetre);
    const first = classifyCut(a, room.contents, input.unitsPerMetre);
    const second = classifyCut(b, room.contents, input.unitsPerMetre);
    if (!first || !second || first.mergedKinds || second.mergedKinds) {
      out.push(room);
      continue;
    }
    out.push(first, second);
  }
  return out;
}

/**
 * A doorway on the outer wall: the flat's floor is on exactly one side of it.
 * That is the front door, not a room-to-room swing.
 */
export function isEnvelopeOpening(
  opening: Opening,
  floor: SpanRow[],
  unitsPerMetre: number,
): boolean {
  if (floor.length === 0) return false;
  const pitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const step = unitsPerMetre * 0.35;
  const mid = (opening.from + opening.to) / 2;
  if (opening.orientation === "h") {
    const insideLow = covers(floor, pitch, mid, opening.centre - step);
    const insideHigh = covers(floor, pitch, mid, opening.centre + step);
    return insideLow !== insideHigh;
  }
  const insideLow = covers(floor, pitch, opening.centre - step, mid);
  const insideHigh = covers(floor, pitch, opening.centre + step, mid);
  return insideLow !== insideHigh;
}

function inwardPoint(
  opening: Opening,
  floor: SpanRow[],
  unitsPerMetre: number,
): { x: number; y: number } | null {
  const pitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const step = unitsPerMetre * 0.5;
  const mid = (opening.from + opening.to) / 2;
  if (opening.orientation === "h") {
    const low = { x: mid, y: opening.centre - step };
    const high = { x: mid, y: opening.centre + step };
    if (covers(floor, pitch, low.x, low.y)) return low;
    if (covers(floor, pitch, high.x, high.y)) return high;
    return null;
  }
  const low = { x: opening.centre - step, y: mid };
  const high = { x: opening.centre + step, y: mid };
  if (covers(floor, pitch, low.x, low.y)) return low;
  if (covers(floor, pitch, high.x, high.y)) return high;
  return null;
}

/**
 * The circulation space just inside the front door is the vestibule.
 *
 * Named מבואה rather than מסדרון so the booklet and the materials key can
 * treat it as a bare floor with a door, not a furnished hall.
 */
export function markEntranceHall(
  rooms: SegmentedRoom[],
  openings: Opening[],
  floor: SpanRow[],
  unitsPerMetre: number,
): SegmentedRoom[] {
  const door = openings.find((opening) => isEnvelopeOpening(opening, floor, unitsPerMetre));
  if (!door) return rooms;
  const inward = inwardPoint(door, floor, unitsPerMetre);
  if (!inward) return rooms;
  const pitchOf = (room: SegmentedRoom) =>
    room.rows.length > 1 ? room.rows[1]!.y - room.rows[0]!.y : 1;
  const hit = rooms.find(
    (room) =>
      (room.kind === "circulation" || room.kind === "other") &&
      covers(room.rows, pitchOf(room), inward.x, inward.y),
  );
  if (!hit) return rooms;
  return rooms.map((room) => (room === hit ? { ...room, name: "מבואה" } : room));
}

/**
 * The rooms as the booklet's schema wants them.
 *
 * The sides are given as well as the area. Without them the table printed the
 * area twice — once under "מידות" and once under "שטח" — because
 * formatRoomMeasure falls back to the area when it has no dimensions.
 */
export function roomsForLayout(
  rooms: SegmentedRoom[],
  unitsPerMetre: number,
): FloorplanRoom[] {
  return rooms.map((room) => {
    const widthM = room.bounds.width / unitsPerMetre;
    const lengthM = room.bounds.height / unitsPerMetre;
    return {
      name: room.name,
      kind: room.kind,
      areaM2: room.areaM2,
      widthM: widthM > 0 ? Math.round(widthM * 100) / 100 : undefined,
      lengthM: lengthM > 0 ? Math.round(lengthM * 100) / 100 : undefined,
      bedCount: room.bedCount > 0 ? room.bedCount : undefined,
      source: "cad" as const,
    };
  });
}
