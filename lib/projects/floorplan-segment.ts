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
   * No real room holds both a bed and a bath, so the pair is proof of a merge
   * rather than a guess at one. Recorded instead of hidden: the confidence
   * report counts these, and a flat with any of them has not been fully read.
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

function covers(rows: SpanRow[], pitch: number, x: number, y: number): boolean {
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
    const has = (kind: FurniturePiece["kind"]) =>
      contents.some((piece) => piece.kind === kind);
    const bedCount = contents.filter((piece) => piece.kind === "bed").length;

    const onTerrace = (input.terraces ?? []).some((terrace) => {
      const tPitch = terrace.length > 1 ? terrace[1]!.y - terrace[0]!.y : 1;
      return covers(terrace, tPitch, cx, cy);
    });

    // Contents decide, in the order that a wrong answer costs most. A wet
    // fixture in a room makes it a wet room whatever else stands there; a hob
    // or a sink makes it the kitchen; a bed makes it a bedroom.
    const cooking = has("hob") || has("sink");
    let kind: FloorplanRoomKind;
    if (onTerrace) kind = "balcony";
    else if (bedCount > 0) kind = "bedroom";
    else if (has("fixture")) kind = "bathroom";
    // An Israeli flat of this generation puts the kitchen in the living room.
    // A region holding both the cooking fittings and the dining table is that
    // one space, and calling it the kitchen buries the larger function.
    else if (cooking && has("table")) kind = "living";
    else if (cooking) kind = "kitchen";
    else if (has("table")) kind = "living";
    else if (has("seat") && areaM2 >= 6) kind = "living";
    else if (has("storage")) kind = "utility";
    else kind = areaM2 < 4 ? "circulation" : "other";

    // A bed and a bath in one region is a merge, not a room.
    const mergedKinds =
      bedCount > 0 && has("fixture") ? (["bedroom", "bathroom"] as FloorplanRoomKind[]) : undefined;

    rooms.push({
      rows,
      bounds: box,
      areaM2: Math.round(areaM2 * 100) / 100,
      kind,
      name: KIND_NAME_HE[kind],
      bedCount,
      contents,
      ...(mergedKinds ? { mergedKinds } : {}),
    });
  }

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
  const shelter = rooms
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
  for (const room of rooms) {
    total.set(room.kind, (total.get(room.kind) ?? 0) + 1);
  }
  return rooms.map((room) => {
    if ((total.get(room.kind) ?? 0) < 2) return room;
    const index = (seen.get(room.kind) ?? 0) + 1;
    seen.set(room.kind, index);
    return { ...room, name: `${room.name} ${index}` };
  });
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
