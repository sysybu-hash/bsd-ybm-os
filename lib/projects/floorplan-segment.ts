import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { inferRoomKind, type FloorplanRoom, type FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import {
  bridgeGlazedGaps,
  bridgeOpenings,
  interiorComponents,
  spanArea,
  type Opening,
  type SpanRow,
  type WallBody,
  wallInkThreshold,
} from "@/lib/projects/floorplan-solid";
import {
  WALL_MIN_LINE_WIDTH,
  isAxisAligned,
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
 * The kind comes first from what stands in the measured region — a bath makes a
 * wet room, a hob makes the kitchen, a bed makes a bedroom. A trusted room label
 * with a page position can correct the shelter classification, but only when
 * its position lands inside exactly one measured bedroom.
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

/** Apply a high-confidence MMD label to the measured bedroom under its bbox. */
export function applyProgrammeMmdLabel(
  rooms: SegmentedRoom[],
  programme: FloorplanRoom[] | undefined,
  page: { width: number; height: number } | undefined,
): SegmentedRoom[] {
  if (!page) return rooms;
  const labels = (programme ?? []).filter((room) => {
    const trusted =
      room.source === "ocr_verified" ||
      room.source === "consensus" ||
      (room.confidence != null && room.confidence >= 0.85);
    return (room.kind ?? inferRoomKind(room.name)) === "mmd" && room.bbox != null && trusted;
  });
  let result = rooms;
  for (const label of labels) {
    const point = {
      x: (label.bbox!.x + label.bbox!.w / 2) * page.width,
      y: (label.bbox!.y + label.bbox!.h / 2) * page.height,
    };
    const hits = result.filter(
      (room) =>
        (room.kind === "bedroom" || room.kind === "mmd") &&
        covers(room.rows, rowPitch(room.rows), point.x, point.y),
    );
    // Ambiguous labels must not choose between adjacent rooms.
    if (hits.length !== 1) continue;
    result = result.map((room) => {
      if (room === hits[0]) return { ...room, kind: "mmd", name: KIND_NAME_HE.mmd };
      if (room.kind === "mmd") return { ...room, kind: "bedroom", name: KIND_NAME_HE.bedroom };
      return room;
    });
  }
  return result;
}

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

/** The step between a region's rows: the smallest one, not the first. */
function rowPitch(rows: SpanRow[]): number {
  let pitch = Infinity;
  for (let i = 1; i < rows.length; i++) {
    const step = rows[i]!.y - rows[i - 1]!.y;
    if (step > 0 && step < pitch) pitch = step;
  }
  return Number.isFinite(pitch) ? pitch : 1;
}

/** A bath is the smallest piece drawn as a closed outline the flood goes round. */
const ISLAND_MIN_CM = 120;
/**
 * A WC pan drawn closed is an island too; a floor drain is half its length.
 * Some sheets draw the bowl alone, without its cistern: דירה 15's guest WC pan
 * measures 52 cm, sat just past the end of its cell, and at 60 cm it was left
 * out and the WC came back a corridor.
 */
const PAN_MIN_CM = 45;
/** The largest cell a lone pan makes a bathroom of: a WC, not a living room. */
const PAN_CELL_MAX_M2 = 4;

/**
 * Which region each piece of furniture stands in.
 *
 * By its centre where a region covers it. But the flood runs on the drawing's
 * ink, and a piece's outline is ink too: a bed or a bath drawn as a closed
 * rectangle is an island the flood goes round, and its centre lies in no
 * region at all. On דירה 15 that left the ממ"ד without its bed — named
 * "other" — and the bathroom without its bath. Such a piece belongs to the
 * region round its outline: the one that covers most points of a ring drawn
 * just outside it.
 */
export function assignFurniture(
  components: SpanRow[][],
  furniture: FurniturePiece[],
  unitsPerMetre: number,
): Map<FurniturePiece, number> {
  const pitches = components.map(rowPitch);
  const out = new Map<FurniturePiece, number>();
  const margin = unitsPerMetre * 0.06;
  for (const piece of furniture) {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    const direct = components.findIndex((rows, i) => covers(rows, pitches[i]!, cx, cy));
    if (direct >= 0) {
      out.set(piece, direct);
      continue;
    }
    // Only a piece big enough to be drawn as a closed island. A drain or a
    // pan left outside every region is left there: pulled into the room round
    // it, a balcony's drain made the balcony a bathroom.
    const long = Math.max(piece.widthCm, piece.depthCm);
    const pan = long < ISLAND_MIN_CM;
    if (pan && !(piece.kind === "fixture" && long >= PAN_MIN_CM)) continue;
    const x0 = piece.x - margin;
    const x1 = piece.x + piece.w + margin;
    const y0 = piece.y - margin;
    const y1 = piece.y + piece.h + margin;
    const ring: Array<[number, number]> = [];
    for (let k = 0; k <= 4; k++) {
      const fx = x0 + ((x1 - x0) * k) / 4;
      const fy = y0 + ((y1 - y0) * k) / 4;
      ring.push([fx, y0], [fx, y1], [x0, fy], [x1, fy]);
    }
    let best = -1;
    let bestCount = 1;
    components.forEach((rows, i) => {
      // A pan only into a cell a pan is drawn in. The chairs round a dining
      // table measure the same as a pan and pass for one beside each other;
      // pulled into the living room, they split it as a wet room.
      if (pan && spanArea(rows) > PAN_CELL_MAX_M2 * unitsPerMetre * unitsPerMetre) return;
      const count = ring.filter(([x, y]) => covers(rows, pitches[i]!, x, y)).length;
      if (count > bestCount) {
        best = i;
        bestCount = count;
      }
    });
    if (best >= 0) out.set(piece, best);
  }
  return out;
}

/**
 * A piece of floor holding measured furniture, too small to be a room by
 * itself, is the end of the room it was cut from.
 *
 * Rooms are no longer joined across a measured wall — but a heavy line of
 * furniture ink can be measured as a wall too, and where it ran the width of a
 * bedroom it cut the last forty centimetres off, with the bed in them: on
 * דירה 21 the piece with the bed was dropped as too small and the rest of the
 * room, with no bed left in it, came back as a corridor. Such a piece is put
 * back into the room directly above or below it across the gap.
 */
function restitchFurnishedFragments(
  components: SpanRow[][],
  furniture: FurniturePiece[],
  unitsPerMetre: number,
  minRoomM2: number,
): SpanRow[][] {
  if (components.length < 2) return components;
  const area = (rows: SpanRow[]) => spanArea(rows) / (unitsPerMetre * unitsPerMetre);
  const xRange = (rows: SpanRow[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of rows) for (const [a, b] of row.spans) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
    return [lo, hi] as const;
  };
  const reach = unitsPerMetre * 0.6;
  const out = components.map((rows) => [...rows]);
  const absorbed = new Set<number>();

  out.forEach((rows, i) => {
    if (rows.length === 0 || area(rows) >= minRoomM2) return;
    const pitch = rowPitch(rows);
    const inside = furniture.filter((piece) =>
      covers(rows, pitch, piece.x + piece.w / 2, piece.y + piece.h / 2),
    );
    if (inside.length === 0) return;
    // A cell with a WC or a basin in it is a room of its own, not the end of
    // the next one: put back, דירה 16's WC went into the bathroom beside it and
    // the flat lost a bathroom.
    if (
      area(rows) >= WET_CELL_MIN_M2 &&
      inside.some((piece) => piece.kind === "fixture" || piece.kind === "sink")
    ) {
      return;
    }
    const [lo, hi] = xRange(rows);
    const top = rows[0]!.y;
    const bottom = rows[rows.length - 1]!.y;
    let bestJ = -1;
    let bestGap = Infinity;
    out.forEach((other, j) => {
      if (j === i || absorbed.has(j) || other.length === 0 || area(other) < minRoomM2) return;
      const [olo, ohi] = xRange(other);
      if (Math.min(hi, ohi) - Math.max(lo, olo) <= 0) return;
      const gapAbove = top - other[other.length - 1]!.y;
      const gapBelow = other[0]!.y - bottom;
      const gap = gapAbove > 0 && gapAbove <= reach ? gapAbove : gapBelow > 0 && gapBelow <= reach ? gapBelow : null;
      if (gap == null) return;
      if (gap < bestGap) { bestJ = j; bestGap = gap; }
    });
    if (bestJ < 0) return;
    const target = out[bestJ]!;
    target.push(...rows);
    target.sort((a, b) => a.y - b.y);
    absorbed.add(i);
    out[i] = [];
  });
  return out.filter((rows) => rows.length > 0);
}

/** The smallest cell a WC or a shower is drawn in. */
const WET_CELL_MIN_M2 = 0.6;

/**
 * A bath the cell stands along. The tub is drawn closed, so the flood goes
 * round it and its centre is never in the cell: דירה 18's bathroom measured
 * 1.40 m² beside its 1.59 m bath and was dropped with nothing in it. A bath
 * is long; a drain symbol, the island this test must not take, is not.
 */
function bathAlong(piece: FurniturePiece, rows: SpanRow[], pitch: number): boolean {
  if (Math.max(piece.widthCm, piece.depthCm) < 120) return false;
  const box = boundsOf(rows, pitch);
  const ox = Math.min(piece.x + piece.w, box.x + box.width) - Math.max(piece.x, box.x);
  const oy = Math.min(piece.y + piece.h, box.y + box.height) - Math.max(piece.y, box.y);
  return ox > 0 && oy > 0 && ox * oy >= 0.5 * piece.w * piece.h;
}

/**
 * The bedroom the sheet's "+2" stands at — the ממ"ד's door sill.
 *
 * The mark is printed in the doorway, on either side of it, so the bedroom
 * nearest it within 0.4 m is the one. Null where no mark stands at a bedroom.
 * A metre was too far: on דירה 17 the shelter itself was not read as a room,
 * and the bedroom above it, 0.9 m from the mark, was named the ממ"ד instead —
 * a bedroom lost and a shelter invented.
 */
function markedShelter(
  rooms: SegmentedRoom[],
  marks: Array<{ x: number; y: number }>,
  unitsPerMetre: number,
): SegmentedRoom | null {
  const reach = unitsPerMetre * 0.4;
  let best: { room: SegmentedRoom; distance: number } | null = null;
  for (const room of rooms) {
    if (room.kind !== "bedroom") continue;
    const box = room.bounds;
    for (const mark of marks) {
      const dx = Math.max(box.x - mark.x, 0, mark.x - (box.x + box.width));
      const dy = Math.max(box.y - mark.y, 0, mark.y - (box.y + box.height));
      const distance = Math.hypot(dx, dy);
      if (distance <= reach && (!best || distance < best.distance)) best = { room, distance };
    }
  }
  return best ? best.room : null;
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
  /**
   * Doorways the sheet marks in its own colour — see readColouredDoorways.
   * Sealed like any other opening, and the reason a plotted sheet's bedrooms
   * stop coming back joined to the corridor.
   */
  colouredDoorways?: WallBody[];
  /**
   * Where the sheet prints the ממ"ד's raised threshold ("+2"). Where the sheet
   * prints one, it decides which bedroom is the shelter; see markedShelter.
   */
  shelterMarks?: Array<{ x: number; y: number }>;
  /** OCR/programme hints are applied only to a matching measured room. */
  programme?: FloorplanRoom[];
  page?: { width: number; height: number };
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
    ...bridgeGlazedGaps(bodies, input.segments ?? [], unitsPerMetre, { floor }),
    ...openings.map((o) => sealOpening(o, seal)),
    ...(input.colouredDoorways ?? []),
  ];
  // The pen the walls are drawn with, read off this sheet rather than assumed.
  const inkCut = wallInkThreshold(input.segments ?? []);
  const ink = (input.segments ?? []).filter(
    (segment) => segment.lineWidth >= inkCut && isAxisAligned(segment),
  );
  // The border flood decides inside from outside by trying to reach in, and on
  // a sheet whose envelope is drawn in one pen throughout that works. A plotted
  // sheet draws part of its outer wall in the same thin pen as its dimension
  // chains: the flood walked in through the kitchen of 28-8-23-2 and three
  // quarters of the flat came back as outdoors. There the footprint — built
  // from hatch and lintels, and correct on that sheet — is the better boundary.
  // Only there: handing it to the sales sheets moved rooms on six of the ten.
  const plottedSheet = inkCut > WALL_MIN_LINE_WIDTH;
  const rawComponents = interiorComponents(barriers, bounds, {
    excludeWalls: true,
    sealingSegments: ink.length > 0 ? ink : undefined,
    floorMask: plottedSheet && floor.length > 1 ? floor : undefined,
    // Only where the page-unit constants are wrong: the sales sheets were swept
    // at their own scale and reproduce it exactly, and a sheet at half that
    // scale is the one they mean something different on.
    unitsPerMetre: plottedSheet ? unitsPerMetre : undefined,
    // Rooms are not joined across a measured wall; see interiorComponents.
    separateAcrossWalls: true,
    walls: bodies,
  });
  const components = restitchFurnishedFragments(rawComponents, furniture, unitsPerMetre, minRoomM2);
  if (components.length === 0) return [];

  const floorPitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const rooms: SegmentedRoom[] = [];

  const placed = assignFurniture(components, furniture, unitsPerMetre);
  for (const [componentIndex, rows] of components.entries()) {
    if (rows.length < 2) continue;
    const pitch = rowPitch(rows);
    const standing = furniture.filter((piece) => placed.get(piece) === componentIndex);
    const areaM2 = spanArea(rows) / (unitsPerMetre * unitsPerMetre);
    // A cell with a measured sanitary fixture in it is a room at any size a
    // fixture fits in. A bathroom is often drawn as two cells — a WC and a
    // shower either side of a thin partition — and each is below the size
    // that makes an empty region a room. Dropped, the flat lost a bathroom:
    // four reference sheets did, once rooms stopped being joined across walls.
    if (areaM2 < minRoomM2) {
      const hasFixture =
        areaM2 >= WET_CELL_MIN_M2 &&
        // Standing in it, not an island beside it: a balcony's drain symbol
        // is drawn closed too, and pulled in it kept a balcony as a bathroom.
        standing.some(
          (piece) =>
            (piece.kind === "fixture" || piece.kind === "sink") &&
            (covers(rows, pitch, piece.x + piece.w / 2, piece.y + piece.h / 2) || bathAlong(piece, rows, pitch)),
        );
      if (!hasFixture) continue;
    }
    const box = boundsOf(rows, pitch);

    // Inside the flat, not the neighbour's room or the landing.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (!covers(floor, floorPitch, cx, cy)) continue;

    const contents = standing;
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

  // A measured terrace the rooms missed is still a terrace. Its mask was grown
  // from the area the sheet prints and accepted only at that area, but a room
  // is kept only where its centre is on the flat's footprint and the flood is
  // not cut up by the paving — so on דירה 16 both measured terraces came back
  // as no room at all, and on דירה 14 one of two did. The bits of it read as
  // corridor are the terrace, not rooms of their own.
  for (const terrace of input.terraces ?? []) {
    if (terrace.length < 2) continue;
    const tPitch = rowPitch(terrace);
    const centreOn = (room: SegmentedRoom) =>
      covers(terrace, tPitch, room.bounds.x + room.bounds.width / 2, room.bounds.y + room.bounds.height / 2);
    if (rooms.some((room) => room.kind === "balcony" && centreOn(room))) continue;
    for (let i = rooms.length - 1; i >= 0; i--) {
      const room = rooms[i]!;
      if ((room.kind === "circulation" || room.kind === "other") && centreOn(room)) rooms.splice(i, 1);
    }
    rooms.push({
      rows: terrace,
      bounds: boundsOf(terrace, tPitch),
      areaM2: Math.round((spanArea(terrace) / (unitsPerMetre * unitsPerMetre)) * 100) / 100,
      kind: "balcony",
      name: KIND_NAME_HE.balcony,
      bedCount: 0,
      contents: [],
    });
  }

  const split = splitMergedWetRooms(rooms, {
    bodies,
    ink,
    unitsPerMetre,
    floorPitch,
    minRoomM2,
  });

  // The ממ"ד is the bedroom the sheet marks with its "+2" sill, and no other.
  //
  // It used to be the bedroom with the most concrete round it, and that could
  // not be measured: an exterior wall comes out as thick as a shelter's, so on
  // דירה 14 it named the wrong bedroom, and on the four reference sheets that
  // print no "+2" it named one on every sheet — on דירה 18 and 22, which draw
  // no shelter at all, and on דירה 21 a bedroom with a partition for a wall. A
  // bedroom named ממ"ד in error is an invention; a shelter left a bedroom is
  // still a bedroom.
  const shelter = markedShelter(split, input.shelterMarks ?? [], unitsPerMetre);
  if (shelter) {
    shelter.kind = "mmd";
    shelter.name = KIND_NAME_HE.mmd;
  }

  const programmeMarked = applyProgrammeMmdLabel(split, input.programme, input.page);

  // Numbered where a flat has several of a kind, so the booklet's table can
  // list them separately instead of collapsing them into one row.
  const seen = new Map<FloorplanRoomKind, number>();
  const total = new Map<FloorplanRoomKind, number>();
  for (const room of programmeMarked) {
    total.set(room.kind, (total.get(room.kind) ?? 0) + 1);
  }
  const named = programmeMarked.map((room) => {
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
 * Whether a wall stands inside a room: somewhere along it, the room's floor
 * is on both sides. דירה 23's cut between its kitchen and its bathroom fell
 * on the ממ"ד's wall, a room away, and sent the kitchen's sink to the
 * bathroom's side. דירה 14's partition, drawn only part of the way, still
 * has the room on both sides of what is drawn.
 */
function standsIn(body: WallBody, room: { rows: SpanRow[]; pitch: number }): boolean {
  const off = body.thickness / 2 + room.pitch * 3;
  for (let t = 0.1; t < 1; t += 0.1) {
    const along = body.from + (body.to - body.from) * t;
    const [ax, ay, bx, by] =
      body.orientation === "h"
        ? [along, body.centre - off, along, body.centre + off]
        : [body.centre - off, along, body.centre + off, along];
    if (covers(room.rows, room.pitch, ax, ay) && covers(room.rows, room.pitch, bx, by)) return true;
  }
  return false;
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
  room?: { rows: SpanRow[]; pitch: number },
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
      if (room && !standsIn(body, room)) continue;
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

/**
 * One half of a split room, with the pieces that stand on its side of the cut.
 *
 * The same size rule as a region of its own: a WC cell below room size is
 * still a bathroom. The halves used to re-test every piece's centre and to
 * keep nothing under 1.4 m², so a split lost the bath the flood had gone round
 * and dropped the WC half it was made to separate.
 */
function classifyCut(
  rows: SpanRow[],
  contents: FurniturePiece[],
  unitsPerMetre: number,
  minRoomM2: number,
): SegmentedRoom | null {
  if (rows.length < 2) return null;
  const pitch = rowPitch(rows);
  const areaM2 = spanArea(rows) / (unitsPerMetre * unitsPerMetre);
  const wet = contents.some((piece) => piece.kind === "fixture" || piece.kind === "sink");
  if (areaM2 < minRoomM2 && !(wet && areaM2 >= WET_CELL_MIN_M2)) return null;
  const box = boundsOf(rows, pitch);
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
 * The wet cell of a merged room, cut off at its doorway.
 *
 * Where no wall stands between the two halves inside the room — דירה 23's
 * bathroom opens straight off the hall that runs into the kitchen — the one
 * thing that does separate them is the door: the narrowest place on the way
 * from the fixtures to the rest. Shrunk by half a doorway, the room falls
 * apart there; the piece holding the fixtures, grown back inside the room,
 * is the bathroom.
 */
export function wetCellAtDoorway(
  rows: SpanRow[],
  fixtures: FurniturePiece[],
  unitsPerMetre: number,
): [SpanRow[], SpanRow[]] | null {
  // Half a doorway, tried narrow to wide. Too wide and the room falls apart
  // inside the bathroom, between the pan and the bath (דירה 23: 1.9 m² of a
  // 3.6 m² room); the widest wet cell that still stops short of a room's
  // size is the one cut at the door.
  let best: [SpanRow[], SpanRow[]] | null = null;
  let bestM2 = 0;
  for (const halfM of [0.35, 0.4, 0.45, 0.5]) {
    const split = wetCellAt(rows, fixtures, unitsPerMetre, halfM);
    if (!split) continue;
    const m2 = spanArea(split[0]) / (unitsPerMetre * unitsPerMetre);
    if (m2 <= 8 && m2 > bestM2) {
      best = split;
      bestM2 = m2;
    }
  }
  return best;
}

function wetCellAt(
  rows: SpanRow[],
  fixtures: FurniturePiece[],
  unitsPerMetre: number,
  halfM: number,
): [SpanRow[], SpanRow[]] | null {
  const pitch = rowPitch(rows);
  if (rows.length < 2 || fixtures.length === 0) return null;
  const box = boundsOf(rows, pitch);
  const cols = Math.ceil(box.width / pitch) + 1;
  const lines = rows.length;
  const y0 = rows[0]!.y;
  const inside: boolean[] = new Array(cols * lines).fill(false);
  rows.forEach((row, j) => {
    for (const [a, b] of row.spans) {
      for (let i = Math.max(0, Math.floor((a - box.x) / pitch)); i <= Math.min(cols - 1, Math.floor((b - box.x) / pitch)); i++) {
        inside[j * cols + i] = true;
      }
    }
  });
  // The lettering and the fixtures' outlines are holes in the room, and a
  // row of letters across a bathroom is a narrower place than its door:
  // דירה 23's "ח.אמבטיה" cut the room in half. Every hole the outside
  // cannot reach is filled first.
  const outside: boolean[] = new Array(cols * lines).fill(false);
  const edge: number[] = [];
  for (let i = 0; i < cols; i++) edge.push(i, (lines - 1) * cols + i);
  for (let j = 0; j < lines; j++) edge.push(j * cols, j * cols + cols - 1);
  for (const k of edge) {
    if (inside[k] || outside[k]) continue;
    outside[k] = true;
    const stack = [k];
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % cols;
      const j = Math.floor(c / cols);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= lines) continue;
        const nk = nj * cols + ni;
        if (inside[nk] || outside[nk]) continue;
        outside[nk] = true;
        stack.push(nk);
      }
    }
  }
  for (let k = 0; k < inside.length; k++) if (!outside[k]) inside[k] = true;
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < lines && inside[j * cols + i]!;
  const r = Math.max(1, Math.round((unitsPerMetre * halfM) / pitch));
  const core: boolean[] = new Array(cols * lines).fill(false);
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < cols; i++) {
      if (!at(i, j)) continue;
      let ok = true;
      for (let dj = -r; dj <= r && ok; dj++) for (let di = -r; di <= r && ok; di++) if (!at(i + di, j + dj)) ok = false;
      core[j * cols + i] = ok;
    }
  }
  // Seed at the core cell nearest the fixtures' centre.
  const centre = clusterCentre(fixtures)!;
  let seed = -1;
  let best = Infinity;
  for (let k = 0; k < core.length; k++) {
    if (!core[k]) continue;
    const i = k % cols;
    const j = Math.floor(k / cols);
    const d = Math.hypot(box.x + i * pitch - centre.x, (rows[j]?.y ?? y0) - centre.y);
    if (d < best) {
      best = d;
      seed = k;
    }
  }
  if (seed < 0 || best > unitsPerMetre * 1.5) return null;
  const wet: boolean[] = new Array(cols * lines).fill(false);
  const stack = [seed];
  wet[seed] = true;
  let wetCount = 0;
  let coreCount = 0;
  for (const c of core) if (c) coreCount++;
  while (stack.length) {
    const k = stack.pop()!;
    wetCount++;
    const i = k % cols;
    const j = Math.floor(k / cols);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= lines) continue;
      const nk = nj * cols + ni;
      if (!core[nk] || wet[nk]) continue;
      wet[nk] = true;
      stack.push(nk);
    }
  }
  // The core did not fall apart: there is no doorway to cut at.
  if (wetCount >= coreCount) return null;
  // Grown back by the same half doorway, inside the room.
  const grown: boolean[] = new Array(cols * lines).fill(false);
  for (let k = 0; k < wet.length; k++) {
    if (!wet[k]) continue;
    const i = k % cols;
    const j = Math.floor(k / cols);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (at(i + di, j + dj)) grown[(j + dj) * cols + i + di] = true;
  }
  const toRows = (mask: boolean[]): SpanRow[] => {
    const out: SpanRow[] = [];
    for (let j = 0; j < lines; j++) {
      const spans: Array<[number, number]> = [];
      let start = -1;
      for (let i = 0; i <= cols; i++) {
        const on = i < cols && mask[j * cols + i]!;
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          spans.push([box.x + start * pitch, box.x + i * pitch]);
          start = -1;
        }
      }
      if (spans.length) out.push({ y: rows[j]!.y, spans });
    }
    return out;
  };
  const rest = inside.map((v, k) => v && !grown[k]);
  return [toRows(grown), toRows(rest)];
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
    minRoomM2: number;
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
    const separator = separatorBetweenClusters(clusters[0], clusters[1], input.bodies, input.ink, {
      rows: room.rows,
      pitch: rowPitch(room.rows),
    });
    // Cut at the doorway instead, where no line gives two clean rooms.
    const atDoorway = (): SegmentedRoom[] | null => {
      const split = wetCellAtDoorway(room.rows, clusters[1], input.unitsPerMetre);
      if (!split) return null;
      const [wetRows, restRows] = split;
      const inWet = (piece: FurniturePiece) =>
        clusters[1].includes(piece) ||
        covers(wetRows, rowPitch(wetRows), piece.x + piece.w / 2, piece.y + piece.h / 2);
      const wetHalf = classifyCut(wetRows, room.contents.filter(inWet), input.unitsPerMetre, input.minRoomM2);
      const restHalf = classifyCut(
        restRows,
        room.contents.filter((piece) => !inWet(piece)),
        input.unitsPerMetre,
        input.minRoomM2,
      );
      if (!wetHalf || !restHalf || wetHalf.mergedKinds || restHalf.mergedKinds || wetHalf.kind !== "bathroom") return null;
      return [restHalf, wetHalf];
    };
    if (!separator) {
      out.push(...(atDoorway() ?? [room]));
      continue;
    }
    const [a, b] = cutRowsAlong(room.rows, separator, input.unitsPerMetre);
    // Each piece goes to the side of the cut its centre is on — it was in this
    // room already, whether or not the flood covered its centre.
    const low = (piece: FurniturePiece) =>
      separator.orientation === "h"
        ? piece.y + piece.h / 2 < separator.at
        : piece.x + piece.w / 2 < separator.at;
    const first = classifyCut(a, room.contents.filter(low), input.unitsPerMetre, input.minRoomM2);
    const second = classifyCut(
      b,
      room.contents.filter((piece) => !low(piece)),
      input.unitsPerMetre,
      input.minRoomM2,
    );
    // One side a room and the other a wet scrap too small to be one: the
    // scrap is a WC cell the flood cut to a corner and joined across a wall,
    // and it is left out rather than keeping a bedroom with a pan in it. On
    // דירה 17 that bedroom was the one thing between the flat and the
    // measured route.
    const scrap = (half: SegmentedRoom | null, rows: SpanRow[]) =>
      !half && spanArea(rows) / (input.unitsPerMetre * input.unitsPerMetre) < WET_CELL_MIN_M2;
    if (first && !first.mergedKinds && scrap(second, b)) {
      out.push(first);
      continue;
    }
    if (second && !second.mergedKinds && scrap(first, a)) {
      out.push(second);
      continue;
    }
    if (!first || !second || first.mergedKinds || second.mergedKinds) {
      out.push(...(atDoorway() ?? [room]));
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
  const hit = rooms.find(
    (room) =>
      (room.kind === "circulation" || room.kind === "other") &&
      covers(room.rows, rowPitch(room.rows), inward.x, inward.y),
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
