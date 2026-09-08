import { findFurniture, type FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { renderFlatSvg } from "@/lib/projects/floorplan-render3d";
import { lockScale, type ScaleSearch } from "@/lib/projects/floorplan-scale";
import {
  bodyRect,
  clipBodiesToBounds,
  findOpenings,
  wallBodiesFromHatch,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import {
  extractFloorplanVectorGeometry,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";

/**
 * One flat, built from its sheet: walls, floor, furniture and the SVG.
 *
 * The whole point of the geometric pipeline is that this needs no judgement at
 * the call site. Everything it decides — the scale, which walls are walls, which
 * enclosed region is this apartment rather than its neighbour — is settled
 * against something the sheet itself states.
 */

export type BuiltFlat = {
  unitsPerMetre: number;
  bodies: WallBody[];
  floor: SpanRow[];
  furniture: FurniturePiece[];
  openings: Opening[];
  bounds: { x: number; y: number; width: number; height: number };
  floorM2: number;
  areaError: number;
  svg: string;
};

export async function buildFlatFromPdf(
  pdf: Buffer | Uint8Array,
  printedAreaM2: number,
  options?: { search?: ScaleSearch; width?: number },
): Promise<BuiltFlat | null> {
  const geometry = await extractFloorplanVectorGeometry(pdf);
  if (!geometry) return null;
  const sheet = wallBoundingBox(geometry);
  if (!sheet) return null;

  const lock = lockScale(geometry.segments, sheet, printedAreaM2, options?.search);
  if (!lock) return null;
  const { unitsPerMetre, floor } = lock;

  const rowHeight = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const inside = (x: number, y: number) => {
    const row = floor.find((r) => y >= r.y && y < r.y + rowHeight);
    return !!row && row.spans.some(([a, b]) => x >= a && x <= b);
  };

  // Keep the walls that bound this flat. A wall belongs to it if its floor is on
  // one side or the other; the neighbour's walls touch none of it.
  const touchesFlat = (body: WallBody) => {
    const r = bodyRect(body);
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      if (
        inside(r.x + r.w * t, r.y - 2) ||
        inside(r.x + r.w * t, r.y + r.h + 2) ||
        inside(r.x - 2, r.y + r.h * t) ||
        inside(r.x + r.w + 2, r.y + r.h * t)
      ) {
        return true;
      }
    }
    return false;
  };
  const bodies = lock.bodies.filter(touchesFlat);
  if (bodies.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const body of bodies) {
    const r = bodyRect(body);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

  const furniture = findFurniture(geometry.segments, unitsPerMetre).filter((piece) =>
    inside(piece.x + piece.w / 2, piece.y + piece.h / 2),
  );

  // The doorways, from the wall pieces before they are joined across them.
  const pieces = clipBodiesToBounds(
    wallBodiesFromHatch(geometry.segments, { unitsPerMetre, keepOpenings: true }),
    sheet,
  ).filter(touchesFlat);
  const openings = findOpenings(pieces, unitsPerMetre * 2.4, unitsPerMetre * 0.6);

  return {
    unitsPerMetre,
    bodies,
    floor,
    furniture,
    openings,
    bounds,
    floorM2: lock.floorM2,
    areaError: lock.areaError,
    svg: renderFlatSvg(bodies, bounds, {
      unitsPerMetre,
      floor,
      furniture,
      openings,
      width: options?.width,
    }),
  };
}
