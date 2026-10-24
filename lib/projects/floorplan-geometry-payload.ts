import { z } from "zod";
import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import { componentsOf, type SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { spansContain, type SpanRow } from "@/lib/projects/floorplan-solid";
import { fillEnclosedHoles, mergeSpanRows, withoutRows, type Rect } from "@/lib/projects/scene3d/floors";

/**
 * The measured flat, in the smallest shape a viewer needs.
 *
 * The render pipeline's own types carry more than a viewer should depend on —
 * span rows per scan line, the SVG it drew, the fidelity report. This is the
 * part that describes the building: where the walls are, where the holes in
 * them are, what stands on the floor, and which room is which.
 *
 * Units are the drawing's own, with `unitsPerMetre` to convert. Keeping them
 * unscaled means the viewer and the plate agree pixel for pixel.
 */
const bandSchema = z.object({
  orientation: z.enum(["h", "v"]),
  centre: z.number(),
  thickness: z.number(),
  from: z.number(),
  to: z.number(),
});

const boundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * A region, as rectangles: [x, y, w, h] each.
 *
 * The measurement holds every region as scan rows — a y and the runs of x it
 * covers — which at a pitch of two units over a sheet a thousand units tall is
 * hundreds of rows per room, and megabytes in Postgres. Merged into
 * rectangles it is a few dozen numbers per room and exactly the same region.
 */
const rectsSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).max(4000);

export const floorplanGeometrySchema = z.object({
  unitsPerMetre: z.number().positive(),
  bounds: boundsSchema,
  walls: z.array(bandSchema).max(4000),
  openings: z.array(bandSchema.extend({ kind: z.string().max(20).optional(), leaf: z.object({ x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }).optional() })).max(2000),
  /** v2: the walkable region, and each terrace. Absent on a run saved before. */
  floor: rectsSchema.optional(),
  terraces: z.array(rectsSchema).max(40).optional(),
  furniture: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        kind: z.string().max(40),
        widthCm: z.number(),
        depthCm: z.number(),
        /** Which sanitary fixture, where the reading knew; see FurniturePiece. */
        fixture: z.enum(["bath", "shower", "toilet", "basin", "washer"]).optional(),
        /** A bed's head, where the drawing shows it; see bedHeadsFromDrawing. */
        head: z.enum(["north", "south", "east", "west"]).optional(),
      }),
    )
    .max(2000),
  rooms: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.string().max(40),
        areaM2: z.number(),
        bounds: boundsSchema,
        /** v2: the room's own region, and the beds the segmenter counted. */
        rects: rectsSchema.optional(),
        bedCount: z.number().optional(),
      }),
    )
    .max(200),
  /**
   * v2: the rooms as the sheet itself labels them.
   *
   * The segmenter finds rooms by flooding the floor and sealing the doorways
   * it detected. Where a doorway is missed the flood runs through it, and two
   * rooms come back as one: on דירה 14 it returns four rooms, one of them
   * 41 m², while the sheet prints nine room names that the extract reads and
   * verifies. These are those names, with the box each one was read at, in
   * page units — a measurement of the drawing's own text, not a guess about
   * the flat.
   */
  labelledRooms: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.string().max(40),
        box: boundsSchema,
      }),
    )
    .max(200)
    .optional(),
});

export type FloorplanGeometryPayload = z.infer<typeof floorplanGeometrySchema>;

function toRects(rects: Rect[]): Array<[number, number, number, number]> {
  return rects.map((r) => [r.x, r.y, r.w, r.h]);
}

export type GeometryPayloadExtras = {
  /** The sheet's own room labels, with the page they were read on. */
  labelled?: Array<{ name: string; kind: string; bbox: { x: number; y: number; w: number; h: number } }>;
  page?: { width: number; height: number };
};

/**
 * Whether sanitary ware, or a piece not yet named, stands in one of the flat's rooms, or right at one's
 * edge — its own ink stops the room's flood, so a pan can sit just outside
 * the region. One in no room is lettering or a window's ink: on דירה 18 one
 * on the terrace of the storey above, one in the window onto the terrace, and
 * "פתח מילוט" across the outer wall. A terrace is no room for it.
 */
function standsInARoom(
  piece: BuiltFlat["furniture"][number],
  rooms: SegmentedRoom[],
  unitsPerMetre: number,
): boolean {
  if (piece.kind !== "fixture" && piece.kind !== "unknown") return true;
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  // A quarter metre round it: a bath's rim stops the flood, and 21's bath
  // stood outside its bathroom's region all along its length.
  const rx = piece.w / 2 + 0.25 * unitsPerMetre;
  const ry = piece.h / 2 + 0.25 * unitsPerMetre;
  const probes: Array<[number, number]> = [
    [cx, cy],
    [cx - rx, cy],
    [cx + rx, cy],
    [cx, cy - ry],
    [cx, cy + ry],
  ];
  return rooms.some(
    (room) => room.kind !== "balcony" && probes.some(([x, y]) => spansContain(room.rows, x, y)),
  );
}

/**
 * The floor less what is not the flat's, and less the scraps that cut leaves
 * standing on their own: on 18 slivers of the storey above's terrace kept its
 * wall ends standing, floating off the flat.
 */
function withoutForeign(floor: SpanRow[], foreign: SpanRow[][], unitsPerMetre: number): SpanRow[] {
  const cut = withoutRows(floor, foreign);
  if (cut === floor) return floor;
  const pitch = floor.length > 1 ? Math.abs(floor[1]!.y - floor[0]!.y) || 1 : 1;
  const area = (rows: SpanRow[]) =>
    (rows.reduce((t, r) => t + r.spans.reduce((u, [a, b]) => u + (b - a), 0), 0) * pitch) / unitsPerMetre ** 2;
  const byY = new Map<number, Array<[number, number]>>();
  for (const part of componentsOf(cut, pitch, 1)) {
    // A scrap the cut left: small, and beside what was cut away. Not every
    // small part — 21's WC is 0.4 m² of its own, and went with its pan.
    const beside = part.some((row) =>
      row.spans.some(([a, b]) => foreign.some((f) => spansContain(f, a - 3, row.y) || spansContain(f, b + 3, row.y) || spansContain(f, (a + b) / 2, row.y - 3) || spansContain(f, (a + b) / 2, row.y + 3))),
    );
    if (area(part) < 0.5 && beside) continue;
    for (const row of part) byY.set(row.y, [...(byY.get(row.y) ?? []), ...row.spans]);
  }
  return [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, spans]) => ({ y, spans: spans.sort((a, b) => a[0] - b[0]) }));
}

/** Whether most of a room lies in a region that is not the flat's. */
function mostlyForeign(rows: SpanRow[], foreign: SpanRow[][]): boolean {
  if (foreign.length === 0) return false;
  const area = (list: SpanRow[]) => list.reduce((t, r) => t + r.spans.reduce((u, [a, b]) => u + (b - a), 0), 0);
  const whole = area(rows);
  return whole > 0 && area(withoutRows(rows, foreign)) < whole * 0.5;
}

export function floorplanGeometryPayload(
  flat: BuiltFlat,
  rooms: SegmentedRoom[],
  extras?: GeometryPayloadExtras,
): FloorplanGeometryPayload {
  return {
    unitsPerMetre: flat.unitsPerMetre,
    bounds: flat.bounds,
    walls: flat.bodies.map((body) => ({
      orientation: body.orientation,
      centre: body.centre,
      thickness: body.thickness,
      from: body.from,
      to: body.to,
    })),
    openings: flat.openings.map((opening) => ({
      orientation: opening.orientation,
      centre: opening.centre,
      thickness: opening.thickness,
      from: opening.from,
      to: opening.to,
      // Measured: a drawn swing is a door, a gap in an outer wall a window.
      // Dropping it made the viewer guess, and a guess is what this engine
      // exists to be rid of.
      kind: opening.kind,
      ...(opening.leaf ? { leaf: opening.leaf } : {}),
    })),
    // Against the flat's own rooms: a region on someone else's roof is not one,
    // and 21's roof lettering stood in it as two fixtures.
    furniture: flat.furniture
      .filter((piece) => piece.drawn || standsInARoom(piece, rooms.filter((room) => !mostlyForeign(room.rows, flat.foreign ?? [])), flat.unitsPerMetre))
      .map((piece) => ({
      x: piece.x,
      y: piece.y,
      w: piece.w,
      h: piece.h,
      kind: piece.kind,
      widthCm: piece.widthCm,
      depthCm: piece.depthCm,
      ...(piece.fixture ? { fixture: piece.fixture } : {}),
      ...(piece.head ? { head: piece.head } : {}),
      ...(piece.drawn ? { drawn: true } : {}),
    })),
    // Page fractions become page units, which is what the geometry speaks.
    labelledRooms:
      extras?.page && extras.labelled
        ? extras.labelled.map((room) => ({
            name: room.name,
            kind: room.kind,
            box: {
              x: room.bbox.x * extras.page!.width,
              y: room.bbox.y * extras.page!.height,
              width: room.bbox.w * extras.page!.width,
              height: room.bbox.h * extras.page!.height,
            },
          }))
        : undefined,
    // Less what is someone else's: 21's roof at +15.94, beside its bedroom.
    floor: toRects(mergeSpanRows(withoutForeign(flat.floor, flat.foreign ?? [], flat.unitsPerMetre))),
    // A terrace's printed "שטח המרפסת" left its letters as holes too.
    terraces: flat.terraces.map((rows) => toRects(mergeSpanRows(fillEnclosedHoles(rows, 0.5 * flat.unitsPerMetre ** 2)))),
    rooms: rooms.filter((room) => !mostlyForeign(room.rows, flat.foreign ?? [])).map((room) => ({
      name: room.name,
      kind: room.kind,
      areaM2: room.areaM2,
      bounds: room.bounds,
      // The room's printed name left letter-shaped holes; see fillEnclosedHoles.
      rects: toRects(mergeSpanRows(fillEnclosedHoles(room.rows, 0.5 * flat.unitsPerMetre ** 2))),
      bedCount: room.bedCount,
    })),
  };
}

/** Read stored geometry back. Returns null for a run saved before this existed. */
export function parseFloorplanGeometry(raw: unknown): FloorplanGeometryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = floorplanGeometrySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Metres, for a viewer that would rather think in them than in drawing units. */
export function metresOf(payload: FloorplanGeometryPayload, value: number): number {
  return value / payload.unitsPerMetre;
}
