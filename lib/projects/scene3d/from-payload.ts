import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import type { Rect } from "@/lib/projects/scene3d/floors";
import { buildScene, type BuildSceneOptions, type SceneInput } from "@/lib/projects/scene3d/build-scene";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/**
 * A stored run, as a scene.
 *
 * The persisted payload is the measurement with its regions thrown away: it
 * keeps each room's bounding box, not the rows the segmenter walked, and it
 * keeps no terraces and no opening kind at all. So a scene built from it is
 * the same building with square corners — good enough for the viewer in the
 * app, and the reason payload v2 exists in the plan.
 *
 * What is missing is filled in the only way that cannot contradict the
 * drawing: a room's floor is its own bounding box, an opening in an outer wall
 * is a window and anything else is a doorway. Both are stated facts of the
 * payload's geometry, not guesses about this flat.
 */

type Band = SceneInput["bodies"][number];

function bandRect(band: Band): Rect {
  const half = band.thickness / 2;
  return band.orientation === "h"
    ? { x: band.from, y: band.centre - half, w: band.to - band.from, h: band.thickness }
    : { x: band.centre - half, y: band.from, w: band.thickness, h: band.to - band.from };
}

/** An opening whose wall runs along the flat's edge opens to the outside. */
function looksExterior(
  band: Band,
  bounds: { x: number; y: number; width: number; height: number },
  unitsPerMetre: number,
): boolean {
  const reach = unitsPerMetre * 0.5;
  return band.orientation === "h"
    ? Math.abs(band.centre - bounds.y) <= reach || Math.abs(band.centre - (bounds.y + bounds.height)) <= reach
    : Math.abs(band.centre - bounds.x) <= reach || Math.abs(band.centre - (bounds.x + bounds.width)) <= reach;
}

export function sceneInputFromPayload(payload: FloorplanGeometryPayload): SceneInput {
  const rooms = payload.rooms.map((room) => ({
    name: room.name,
    kind: room.kind,
    areaM2: room.areaM2,
    rects: [{ x: room.bounds.x, y: room.bounds.y, w: room.bounds.width, h: room.bounds.height }],
  }));
  return {
    unitsPerMetre: payload.unitsPerMetre,
    bounds: payload.bounds,
    bodies: payload.walls,
    openings: payload.openings.map((band) => ({
      ...band,
      kind: looksExterior(band, payload.bounds, payload.unitsPerMetre) ? ("window" as const) : ("door" as const),
    })),
    // Without the walked region, the rooms themselves are the floor.
    floorRects: rooms.flatMap((room) => room.rects),
    terraceRects: [],
    furniture: payload.furniture,
    rooms,
  };
}

export function buildSceneFromPayload(
  payload: FloorplanGeometryPayload,
  options?: BuildSceneOptions,
): FlatScene {
  return buildScene(sceneInputFromPayload(payload), options);
}

/** Exported for the viewer's own tests. */
export const payloadHelpers = { bandRect, looksExterior };
