import type { Opening } from "@/lib/projects/floorplan-solid";

/**
 * Which holes in the walls are doors, which are windows.
 *
 * The layout schema has carried an `openings` array with a door/window/opening
 * kind on it since the beginning, and nothing ever filled it usefully: the
 * extractors populate it from what a model reads off the sheet, so an entry
 * arrives with a width and a room name and no position. An opening with no
 * position cannot guide a still, so the generation prompt never named one and
 * no audit ever checked one. Where a window sits in a rendered flat has been
 * the image model's own invention from the first frame to the last — which is
 * why asking an edit for "the window that is in the plan" had nothing to
 * appeal to, and why it moved a door that was drawn correctly.
 *
 * The geometry already knows. buildFlatFromGeometry finds the gaps between
 * wall pieces and, separately, the door swings the draughtsman drew, and then
 * merges the two into one undifferentiated list. The distinction it throws
 * away is exactly the one that was missing: a gap with a swing on it is a
 * door, and a gap in an outside wall with no swing is a window.
 *
 * The green marks on these sheets are not the answer. 28-8-23-2 marks its
 * thresholds green, and it marks new partition walls green too: reading the
 * long green runs as glazing found eight "windows" on that sheet, of which
 * three were real, two were the same doors counted twice, and three were a
 * partition between two bedrooms.
 */

export type OpeningKind = "door" | "window" | "opening";

export type PlacedOpening = {
  kind: OpeningKind;
  /** Clear width, in metres. */
  widthM: number;
  /** The opening's box, as fractions of the page. */
  box: { x: number; y: number; w: number; h: number };
};

export type Bounds = { x: number; y: number; width: number; height: number };

function sameHole(a: Opening, b: Opening): boolean {
  return (
    a.orientation === b.orientation &&
    Math.abs(a.centre - b.centre) <= Math.max(a.thickness, b.thickness) &&
    Math.min(a.to, b.to) - Math.max(a.from, b.from) > 0
  );
}

/** A wall on the edge of the footprint faces outside; a hole in it is glazed. */
export function isOuterWall(opening: Opening, bounds: Bounds, tolerance: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  return opening.orientation === "h"
    ? near(opening.centre, bounds.y) || near(opening.centre, bounds.y + bounds.height)
    : near(opening.centre, bounds.x) || near(opening.centre, bounds.x + bounds.width);
}

/**
 * Swings first, because a drawn swing is the draughtsman saying "door" out
 * loud. Everything else is judged by the wall it sits in.
 */
export function classifyOpenings(
  swings: Opening[],
  gaps: Opening[],
  bounds: Bounds,
  unitsPerMetre: number,
): Array<Opening & { kind: OpeningKind }> {
  const tolerance = unitsPerMetre * 0.5;
  const out: Array<Opening & { kind: OpeningKind }> = swings.map((swing) => ({
    ...swing,
    kind: "door" as const,
  }));
  for (const gap of gaps) {
    if (swings.some((swing) => sameHole(swing, gap))) continue;
    out.push({
      ...gap,
      // A hole in an inside wall with no leaf drawn is a cased opening, not a
      // window: the living room and the kitchen on an open plan meet through
      // one, and glazing it would put a window inside the flat.
      kind: isOuterWall(gap, bounds, tolerance) ? "window" : "opening",
    });
  }
  return out;
}

/**
 * Drawing units into page fractions. They are the same coordinates — a page
 * unit is a drawing unit on these sheets — so this is only a division, and it
 * is what lets a measured opening be drawn on a raster of the page.
 */
export function placeOpeningsOnPage(
  openings: Array<Opening & { kind: OpeningKind }>,
  unitsPerMetre: number,
  page: { width: number; height: number },
): PlacedOpening[] {
  if (!(page.width > 0) || !(page.height > 0) || !(unitsPerMetre > 0)) return [];
  return openings.map((opening) => {
    const along = Math.abs(opening.to - opening.from);
    const from = Math.min(opening.from, opening.to);
    const half = opening.thickness / 2;
    const box =
      opening.orientation === "h"
        ? {
            x: from / page.width,
            y: (opening.centre - half) / page.height,
            w: along / page.width,
            h: opening.thickness / page.height,
          }
        : {
            x: (opening.centre - half) / page.width,
            y: from / page.height,
            w: opening.thickness / page.width,
            h: along / page.height,
          };
    return {
      kind: opening.kind,
      widthM: Math.round((along / unitsPerMetre) * 100) / 100,
      box,
    };
  });
}
