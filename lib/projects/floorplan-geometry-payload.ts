import { z } from "zod";
import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { mergeSpanRows, type Rect } from "@/lib/projects/scene3d/floors";

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
  openings: z.array(bandSchema.extend({ kind: z.string().max(20).optional() })).max(2000),
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
    })),
    furniture: flat.furniture.map((piece) => ({
      x: piece.x,
      y: piece.y,
      w: piece.w,
      h: piece.h,
      kind: piece.kind,
      widthCm: piece.widthCm,
      depthCm: piece.depthCm,
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
    floor: toRects(mergeSpanRows(flat.floor)),
    terraces: flat.terraces.map((rows) => toRects(mergeSpanRows(rows))),
    rooms: rooms.map((room) => ({
      name: room.name,
      kind: room.kind,
      areaM2: room.areaM2,
      bounds: room.bounds,
      rects: toRects(mergeSpanRows(room.rows)),
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
