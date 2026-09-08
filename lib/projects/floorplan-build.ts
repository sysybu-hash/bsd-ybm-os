import { findFurniture, type FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { renderFlatSvg } from "@/lib/projects/floorplan-render3d";
import { lockScale, type ScaleSearch } from "@/lib/projects/floorplan-scale";
import {
  bodyRect,
  clipBodiesToBounds,
  closeCorners,
  dropUnhatchedBodies,
  findDoorSwings,
  findTerraces,
  trimToHatchAlong,
  findOpenings,
  wallBodiesFromHatch,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import {
  extractFloorplanVectorGeometry,
  extractPrintedAreas,
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
  /** Paved outdoor areas, each verified against the area the sheet prints in it. */
  terraces: SpanRow[][];
  bounds: { x: number; y: number; width: number; height: number };
  floorM2: number;
  areaError: number;
  svg: string;
};

export async function buildFlatFromPdf(
  pdf: Buffer | Uint8Array,
  printedAreaM2: number,
  options?: {
    search?: ScaleSearch;
    width?: number;
    /**
     * The flat's extent on the sheet, when the sheet carries more than one.
     *
     * Walls alone cannot say which apartment is which: every room has a door
     * and a door is a gap, so the hatch never closes around anything, and
     * bridging the doors to close the flat also joins it to its neighbour
     * through the shared landing. On the uncut דירה 14 the "isolated flat"
     * came out 639 x 1040 units against a sheet of 638 x 1036 — the whole
     * drawing.
     *
     * The client's own crop answers it. Given here as an extent rather than
     * applied to the PDF, so the walls are still read from the uncut sheet and
     * nothing is severed: bodies are truncated at the boundary, not dropped,
     * which keeps the party wall as this flat's east wall.
     */
    extent?: { x: number; y: number; width: number; height: number };
  },
): Promise<BuiltFlat | null> {
  const geometry = await extractFloorplanVectorGeometry(pdf);
  if (!geometry) return null;
  const sheet = wallBoundingBox(geometry);
  if (!sheet) return null;

  const flatExtent = options?.extent ?? sheet;
  const lock = lockScale(geometry.segments, flatExtent, printedAreaM2, options?.search);
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
  // Extended to their intersections before drawing. CAD stops two lines at a
  // joint or a little short of it, which is invisible on paper and leaves every
  // room in the render open at its corners — and an open room is one the model
  // fills in for itself. Worth four points of hatch coverage on its own.
  // Corners closed, then trimmed back to where each wall's hatch runs. Closing
  // and bridging both stretch a wall along its length — overlaid on the sheet
  // those extensions are drawn wall with no hatch under them, running out into
  // the living room — and the trim keeps everything between the first and last
  // stroke, cutting only the tails.
  // Trimmed to the hatch along each run, then dropped outright where there is
  // no hatch along the run to trim to. The two are not the same test: the trim
  // cuts a real wall's overshot tails, and the drop removes a body that was
  // never a wall — a dimension chain reads as one because it picks up a hatch
  // cluster wherever it crosses a partition.
  const bodies = dropUnhatchedBodies(
    trimToHatchAlong(
      closeCorners(lock.bodies.filter(touchesFlat), unitsPerMetre * 0.9),
      geometry.segments,
      { unitsPerMetre },
    ),
    geometry.segments,
    unitsPerMetre,
  );
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

  const furniture = findFurniture(geometry.segments, unitsPerMetre, {
    curves: geometry.curves,
  }).filter((piece) =>
    inside(piece.x + piece.w / 2, piece.y + piece.h / 2),
  );

  // The doorways, from the wall pieces before they are joined across them.
  const pieces = clipBodiesToBounds(
    wallBodiesFromHatch(geometry.segments, { unitsPerMetre, keepOpenings: true }),
    flatExtent,
    8,
    { truncate: true },
  ).filter(touchesFlat);
  // Gaps between wall pieces, plus the doors the sheet actually marks. The gap
  // rule alone returned six openings on דירה 14, most of them windows, and had
  // neither the front door nor the ones onto the terrace; the swings have all
  // seven at true door widths. Both are kept — a gap is a real opening even
  // where no swing is drawn, as at a cased opening — with the swing winning
  // wherever the two describe the same hole.
  const swings = findDoorSwings(
    geometry.segments,
    geometry.curves,
    bodies,
    unitsPerMetre,
    { extent: flatExtent },
  );
  const gaps = findOpenings(pieces, unitsPerMetre * 2.4, unitsPerMetre * 0.6);
  const openings = [
    ...swings,
    ...gaps.filter(
      (gap) =>
        !swings.some(
          (swing) =>
            swing.orientation === gap.orientation &&
            Math.abs(swing.centre - gap.centre) <= gap.thickness &&
            Math.min(swing.to, gap.to) - Math.max(swing.from, gap.from) > 0,
        ),
    ),
  ];

  // Terraces are read from the sheet the label sits on, and only kept where the
  // region grown from the label measures what the label says. A terrace that
  // leaks is dropped rather than guessed at.
  // Clipped to this flat. An uncut sheet carries the neighbour's labels too, and
  // its terraces are not this apartment's to draw.
  const printed = (await extractPrintedAreas(pdf)).filter(
    (area) =>
      area.x >= flatExtent.x &&
      area.x <= flatExtent.x + flatExtent.width &&
      area.y >= flatExtent.y &&
      area.y <= flatExtent.y + flatExtent.height,
  );
  const terraces = findTerraces(geometry.segments, printed, unitsPerMetre).map(
    (terrace) => terrace.rows,
  );

  return {
    unitsPerMetre,
    bodies,
    floor,
    furniture,
    openings,
    terraces,
    bounds,
    floorM2: lock.floorM2,
    areaError: lock.areaError,
    svg: renderFlatSvg(bodies, bounds, {
      unitsPerMetre,
      floor,
      furniture,
      openings,
      terraces,
      width: options?.width,
    }),
  };
}
