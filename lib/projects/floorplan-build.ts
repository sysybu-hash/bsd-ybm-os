import { createLogger } from "@/lib/logger";
import { readColouredDoorways } from "@/lib/projects/floorplan-colour-openings";
import { classifyOpenings, sameHole, type OpeningKind } from "@/lib/projects/floorplan-wall-openings";
import { findEntranceMarkers, placeEntranceDoor } from "@/lib/projects/floorplan-entrance";
import { findWardrobes } from "@/lib/projects/floorplan-wardrobe";
import { findWorktopRuns } from "@/lib/projects/floorplan-worktop";
import {
  clearFurnitureFromEmptyRooms,
  deskFurnitureInOffices,
} from "@/lib/projects/floorplan-programme-furniture";
import { cropToPaving, openRows, withoutRows } from "@/lib/projects/scene3d/floors";
import { atOtherLevel, inferRoomKind, type FloorplanLayout } from "@/lib/projects/floorplan-layout";

export { atOtherLevel };
import {
  bathroomSquaresAreNotSeats,
  bedHeadsFromDrawing,
  findBaths,
  findDiamonds,
  kitchenSquaresAreAppliances,
  pansFromCisterns,
  washersFromDrums,
  findFurniture,
  findKitchenFittings,
  findRoundedFurniture,
  looksLikeKitchenIsland,
  seatsAroundTable,
  seatsDrawnAroundTable,
  stoolsAlongRun,
  type FurniturePiece,
} from "@/lib/projects/floorplan-furniture";
import { frameAroundFloor, renderFlatSvg } from "@/lib/projects/floorplan-render3d";
import { doorwayBands, lockScale, lockScaleAtDrawingUnits, lockScaleToHint, type ScaleSearch } from "@/lib/projects/floorplan-scale";
import {
  bodyRect,
  sameWall,
  clipBodiesToBounds,
  closeCorners,
  dropUnhatchedBodies,
  findDoorSwings,
  findLevelMarks,
  levelTextAt,
  sameLevelText,
  type LevelText,
  findTerraces,
  findTerracesOnFloor,
  terraceFromPaving,
  doorsFromSwings,
  findSwingArcs,
  openingsInWalls,
  hatchedWallsMissed,
  widenToHatch,
  narrowWallsAroundLeaves,
  wallsBesideFlatFloor,
  findCrossedBoxes,
  openFloorLookup,
  spansContain,
  trimToHatchAlong,
  findHatchGaps,
  findOpenings,
  openingRect,
  stubsInsideCrossingWalls,
  trimThinToFaces,
  floorWithoutLanding,
  spanArea,
  wallBodiesForSheet,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import {
  extractFloorplanVectorGeometry,
  type FloorplanVectorGeometry,
  type PlacedNumber,
  type VectorSegment,
  extractPrintedAreas,
  extractShelterMarks,
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

/**
 * A door's leaf as the sheet draws it open: from the hinge, page units, to
 * the leaf's tip — the radius of the swing's arc at its open end.
 */
export type DoorLeaf = { x: number; y: number; dx: number; dy: number };

export type BuiltFlat = {
  unitsPerMetre: number;
  bodies: WallBody[];
  floor: SpanRow[];
  furniture: FurniturePiece[];
  openings: Array<Opening & { kind: OpeningKind; leaf?: DoorLeaf }>;
  /** Paved outdoor areas, each verified against the area the sheet prints in it. */
  terraces: SpanRow[][];
  /**
   * Regions on the flat's floor that are not the flat's: a terrace at
   * another level with no door onto it. Kept in the floor, so the rooms beside
   * them are not opened to the outside, and left out of what is drawn.
   */
  foreign?: SpanRow[][];
  /**
   * How many terrace figures the sheet prints inside this flat.
   *
   * Not the same as terraces.length: finding four of eleven is the measured
   * state, and the difference is what the confidence report says out loud.
   */
  printedTerraceCount: number;
  bounds: { x: number; y: number; width: number; height: number };
  floorM2: number;
  areaError: number;
  svg: string;
  /**
   * Doorways the sheet marks in colour, when it marks them.
   *
   * Carried on the flat because only the builder has the PDF to render, and
   * the segmenter is where they are needed. Empty on a sheet that marks
   * nothing, which is every sales sheet in the reference set.
   */
  colouredDoorways?: WallBody[];
  /** Where the sheet prints the ממ"ד's raised threshold; see extractShelterMarks. */
  shelterMarks?: Array<{ x: number; y: number }>;
  /**
   * Set when the plate shows only part of the drawing (see frameAroundFloor):
   * the floor inside the frame, and the whole drawing's size. A picture of
   * 40 m² out of a 122 × 25 m centre must not be captioned as the whole plan.
   */
  framedPart?: { floorM2: number; drawingWidthM: number; drawingHeightM: number };
};

/**
 * Convert programme balcony boxes into candidate seeds for vector terrace
 * measurement. The returned area is still only a claim: callers must verify
 * it against the vector flood before accepting the region.
 */
export function programmeTerraceSeeds(
  programme: Pick<FloorplanLayout, "rooms" | "unitLevelM"> | undefined,
  page: { width: number; height: number },
  extent: { x: number; y: number; width: number; height: number },
  printed: PlacedNumber[],
  unitsPerMetre: number,
): PlacedNumber[] {
  return (programme?.rooms ?? [])
    .filter((room) => {
      const kind = room.kind ?? inferRoomKind(room.name);
      return (
        kind === "balcony" &&
        !atOtherLevel(room, programme) &&
        room.bbox != null &&
        room.areaM2 != null &&
        room.areaM2 >= 1.5 &&
        room.areaM2 <= 16
      );
    })
    .map((room) => ({
      x: (room.bbox!.x + room.bbox!.w / 2) * page.width,
      y: (room.bbox!.y + room.bbox!.h / 2) * page.height,
      value: room.areaM2!,
    }))
    .filter(
      (area) =>
        area.x >= extent.x &&
        area.x <= extent.x + extent.width &&
        area.y >= extent.y &&
        area.y <= extent.y + extent.height,
    )
    .filter(
      (area) =>
        !printed.some(
          (label) =>
            Math.hypot(label.x - area.x, label.y - area.y) < unitsPerMetre * 0.5,
        ),
    );
}


/**
 * The level the flat itself stands at, as printed beside the small ⊕ in its
 * label: the one mark on the flat's own floor, off every terrace, with a
 * level figure beside it. Null where there is none, or two disagree.
 */
function flatLevelText(
  geometry: { segments: VectorSegment[]; curves: VectorSegment[] },
  floor: SpanRow[],
  terraces: Array<{ rows: SpanRow[] }>,
  unitsPerMetre: number,
): LevelText | null {
  const marks = findLevelMarks(geometry.curves, geometry.segments, unitsPerMetre, { minRadiusM: 0.07, minHatch: 2 }).filter(
    (mark) =>
      mark.r < unitsPerMetre * 0.12 &&
      spansContain(floor, mark.x, mark.y) &&
      !terraces.some((terrace) => spansContain(terrace.rows, mark.x, mark.y)),
  );
  const texts = marks
    .map((mark) => levelTextAt(mark, geometry.segments, geometry.curves))
    .filter((text): text is LevelText => text != null);
  const first = texts[0];
  if (!first || texts.some((text) => !sameLevelText(text, first))) return null;
  return first;
}

/**
 * Whether a piece stands in a wall rather than against one.
 *
 * Any overlap at all was too strict, and it threw away the living-room suite:
 * an armchair drawn with its back to the wall touches it by construction, and
 * so does every chair pushed in at a table beside one. The centre is the test —
 * a piece whose middle is inside a wall is not furniture standing there.
 */
function centreInsideBody(piece: FurniturePiece, body: WallBody): boolean {
  const r = bodyRect(body);
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

const log = createLogger("floorplan-build");

/**
 * How much bigger the rooms are printed than measured, read where each room
 * the programme sizes stands: from its middle out to the first wall face each
 * way, against its printed width and length. The living spaces are left out
 * — their figures are a part of an open plan — and a room is taken only when
 * its spans and figures agree to within a fifth. The median over at least
 * four, and only where they agree among themselves; null otherwise.
 */
export function roomDimensionScale(
  bodies: WallBody[],
  programme: FloorplanLayout,
  page: { width: number; height: number },
  unitsPerMetre: number,
): number | null {
  const rects = bodies.map(bodyRect);
  const ray = (x: number, y: number, dx: number, dy: number): number | null => {
    let best: number | null = null;
    for (const r of rects) {
      let dist: number;
      if (dx !== 0) {
        if (y < r.y || y > r.y + r.h) continue;
        dist = ((dx > 0 ? r.x : r.x + r.w) - x) * dx;
      } else {
        if (x < r.x || x > r.x + r.w) continue;
        dist = ((dy > 0 ? r.y : r.y + r.h) - y) * dy;
      }
      if (dist > 0 && (best == null || dist < best)) best = dist;
    }
    return best;
  };
  const ratios: number[] = [];
  for (const room of programme.rooms ?? []) {
    const kind = room.kind ?? inferRoomKind(room.name);
    if (!room.bbox || kind === "living" || kind === "kitchen" || kind === "balcony" || kind === "circulation") continue;
    const printed = [room.widthM, room.lengthM].filter((v): v is number => v != null && v > 0);
    if (printed.length === 0) continue;
    const x = (room.bbox.x + room.bbox.w / 2) * page.width;
    const y = (room.bbox.y + room.bbox.h / 2) * page.height;
    const across = [ray(x, y, 1, 0), ray(x, y, -1, 0)];
    const down = [ray(x, y, 0, 1), ray(x, y, 0, -1)];
    const spans = [across, down]
      .filter((pair): pair is [number, number] => pair[0] != null && pair[1] != null)
      .map(([a, b]) => (a + b) / unitsPerMetre);
    if (spans.length === 0) continue;
    for (const p of printed) {
      const m = spans.reduce((best, span) => (Math.abs(span - p) < Math.abs(best - p) ? span : best));
      const r = p / m;
      if (r > 0.85 && r < 1.2) ratios.push(r);
    }
  }
  if (ratios.length < 4) return null;
  const sorted = [...ratios].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const spread = [...ratios.map((r) => Math.abs(r - median))].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!;
  return spread <= 0.035 ? median : null;
}

/**
 * The nearest architect's scale in PDF points — 1:50 is 56.69 points a
 * metre — where the figure is within 1.5 % of one; the figure otherwise.
 */
export function snapToDrawingScale(unitsPerMetre: number, tolerance = 0.015): number {
  const POINTS_PER_METRE = 72 / 0.0254;
  for (const scale of [20, 25, 40, 50, 75, 100, 200]) {
    const upm = POINTS_PER_METRE / scale;
    if (Math.abs(unitsPerMetre / upm - 1) <= tolerance) return upm;
  }
  return unitsPerMetre;
}

/**
 * The flat, built from geometry that is already in hand.
 *
 * Split out of buildFlatFromPdf so a DXF can be built the same way: everything
 * below reads segments and curves, and the only thing the PDF itself was still
 * needed for is the printed terrace labels, which now arrive as data.
 */
export async function buildFlatFromGeometry(
  geometry: FloorplanVectorGeometry,
  printedAreaM2: number,
  options?: {
    search?: ScaleSearch;
    width?: number;
    /** Area figures the sheet prints, used to verify each terrace. */
    printedAreas?: PlacedNumber[];
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
    /** The sheet's own programme, for what a shape cannot say — see desks. */
    programme?: FloorplanLayout;
    /**
     * Units per metre read off the sheet's dimension chains, for a sheet that
     * prints no area. The area sweep is skipped in favour of a narrow sweep
     * around this figure; see lockScaleToHint.
     */
    unitsPerMetreHint?: number;
    /** How far from the hint the sweep may look; see lockScaleToHint. */
    unitsPerMetreHintSpread?: number;
    /**
     * The hint is the file's own unit, not a chain that still has to find a
     * bed. Used for a DXF whose header states millimetres or metres.
     */
    unitsFromDrawing?: boolean;
    /** Set on the build the room dimensions re-scaled: it is not checked again. */
    scaledByRooms?: boolean;
  },
): Promise<BuiltFlat | null> {
  // A terrace's level mark hatches two quarters of its circle, and that hatch
  // is evidence for a wall across the top of the terrace. The mark is found
  // before the scale is, at the scale these sheets lock to (54 to 63 units a
  // metre), and its hatch is left out of the evidence tests after the lock —
  // not before it: taken out of the scale sweep, it moved דירה 14's scale and
  // cost the flat a terrace.
  const levelMarks = findLevelMarks(geometry.curves, geometry.segments, 56);
  const markHatch = new Set(levelMarks.flatMap((mark) => mark.strokes));
  const evidence = geometry.segments.filter((segment) => !markHatch.has(segment));
  const sheet = wallBoundingBox(geometry);
  if (!sheet) return null;

  const flatExtent = options?.extent ?? sheet;
  const hint = options?.unitsPerMetreHint;
  const lock =
    printedAreaM2 > 0
      ? lockScale(geometry.segments, flatExtent, printedAreaM2, options?.search, geometry.curves)
      : hint && options?.unitsFromDrawing
        ? lockScaleAtDrawingUnits(geometry.segments, flatExtent, hint, geometry.curves)
        : hint
          ? lockScaleToHint(geometry.segments, flatExtent, hint, geometry.curves, options?.unitsPerMetreHintSpread)
          : null;
  if (!lock) return null;
  const { unitsPerMetre, floor } = lock;
  let floorM2 = lock.floorM2;
  let areaError = lock.areaError;

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
  // The hatch tests are evidence tests: they trim a wall to the hatch that
  // proves it and drop a body with none, because on a sales sheet a dimension
  // chain picks up a hatch cluster wherever it crosses a partition and reads
  // as a wall. A plotted pair carries its own evidence — two heavy lines a
  // wall apart — and has no hatch anywhere along it, so putting it through the
  // same tests deleted every internal partition on 28-8-23-2 and left the flat
  // as one open floor.
  // A stub hidden inside a crossing wall is not closed to anything; see
  // stubsInsideCrossingWalls.
  const inFlat = lock.bodies.filter(touchesFlat);
  const stubs = new Set(stubsInsideCrossingWalls(inFlat));
  const kept = closeCorners(
    inFlat.filter((body) => !stubs.has(body)),
    unitsPerMetre * 0.9,
  );
  const hatchKept = dropUnhatchedBodies(
    trimToHatchAlong(
      kept.filter((body) => body.source !== "plotted"),
      evidence,
      { unitsPerMetre, floor },
    ),
    evidence,
    unitsPerMetre,
  );
  // A plotted pair joins the set unless a hatched band that SURVIVED covers the
  // same wall. Deduping before the hatch tests is what lost the partitions:
  // the band was preferred, and then dropped for having no hatch under it.
  const plotted = kept
    .filter((body) => body.source === "plotted")
    .filter((body) => !hatchKept.some((band) => sameWall(band, body)));
  // A wall that lies inside a drawn bath is the bath's rim; see findBaths.
  const baths = findBaths(geometry.segments, geometry.curves, unitsPerMetre);
  // And one with a hob in it is the worktop: the pan supports are short
  // diagonals in a band, which is what hatch looks like, and דירה 22's hob and
  // the run under it became a 42 cm wall 2.6 m long down its kitchen. A wall
  // stands behind a hob, never under its middle.
  const hobs = findKitchenFittings(geometry.segments, geometry.curves, unitsPerMetre).filter(
    (piece) => piece.kind === "hob",
  );
  // Nor is a thin one that runs through the chairs drawn round the dining
  // table: the seats' front and back edges, a chair's width apart and in a
  // row, pair up like a partition's faces, and דירה 23's three chairs below
  // the table came out as a wall across the living room.
  const earlyPieces = findFurniture(geometry.segments, unitsPerMetre, { curves: geometry.curves });
  const earlyTable = earlyPieces.find((piece) => piece.kind === "table");
  // Nor one lying in a bed: a bed's foot and its pillow's corner pair like a
  // partition's faces, and 18's right bedroom had a wall up its bed.
  const earlyBeds = earlyPieces.filter((piece) => piece.kind === "bed");
  const inBed = (body: WallBody) => {
    const r = bodyRect(body);
    return earlyBeds.some((bed) => {
      const ox = Math.min(r.x + r.w, bed.x + bed.w) - Math.max(r.x, bed.x);
      const oy = Math.min(r.y + r.h, bed.y + bed.h) - Math.max(r.y, bed.y);
      return ox > 0 && oy > 0 && ox * oy >= 0.4 * r.w * r.h;
    });
  };
  const drawnChairs = earlyTable
    ? (seatsDrawnAroundTable(earlyTable, geometry.curves, unitsPerMetre, geometry.segments) ?? [])
    : [];
  const throughChairs = (body: WallBody) => {
    if (body.thickness > unitsPerMetre * 0.15) return false;
    const r = bodyRect(body);
    return (
      drawnChairs.filter((chair) => {
        const ox = Math.min(r.x + r.w, chair.x + chair.w) - Math.max(r.x, chair.x);
        const oy = Math.min(r.y + r.h, chair.y + chair.h) - Math.max(r.y, chair.y);
        return ox > 0 && oy > 0;
      }).length >= 2
    );
  };
  // A thin wall held to its own drawn faces; see trimThinToFaces.
  // Nor one in a level mark's symbol: its two quarters are hatched, and 22's
  // "+11.42" in the flat's legend box stood as a 30 cm wall by the door.
  const markSymbols = findLevelMarks(geometry.curves, geometry.segments, unitsPerMetre, { minRadiusM: 0.05, maxRadiusM: 0.3, minHatch: 2 });
  const inMark = (body: WallBody) => {
    const r = bodyRect(body);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const short = body.to - body.from <= unitsPerMetre * 0.6;
    if (short && markSymbols.some((m) => Math.hypot(cx - m.x, cy - m.y) <= m.r + unitsPerMetre * 0.05)) return true;
    // Or in its figure, beside it on the same line, unhatched: the top and
    // foot of 21's "+15.94" paired into a 40 cm wall across its roof terrace.
    if (body.to - body.from > unitsPerMetre * 2.5) return false;
    const besideFigure = markSymbols.some(
      (m) => Math.abs(cy - m.y) <= unitsPerMetre * 0.25 && Math.abs(cx - m.x) <= unitsPerMetre * 1.6,
    );
    if (!besideFigure) return false;
    // Hatched along most of it, slice by slice: where it runs into a hatched
    // wall it borrows that wall's strokes.
    const diagonalsIn = geometry.segments.filter((sg) => {
      const deg = Math.abs((Math.atan2(sg.y2 - sg.y1, sg.x2 - sg.x1) * 180) / Math.PI) % 90;
      const mx = (sg.x1 + sg.x2) / 2;
      const my = (sg.y1 + sg.y2) / 2;
      return deg >= 30 && deg <= 60 && Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) >= body.thickness * 0.6 && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    });
    const step = unitsPerMetre * 0.25;
    let slices = 0;
    let hatchedSlices = 0;
    for (let t = body.from; t < body.to; t += step) {
      slices++;
      const n = diagonalsIn.filter((sg) => {
        const along = body.orientation === "h" ? (sg.x1 + sg.x2) / 2 : (sg.y1 + sg.y2) / 2;
        return along >= t && along < t + step;
      }).length;
      if (n >= 2) hatchedSlices++;
    }
    return hatchedSlices < slices * 0.5;
  };
  const faced = trimThinToFaces([...hatchKept, ...plotted], geometry.segments, unitsPerMetre).filter((body) => {
    if (throughChairs(body)) return false;
    if (inMark(body)) return false;
    if (inBed(body)) return false;
    if (hobs.some((hob) => centreInsideBody(hob, body))) return false;
    const r = bodyRect(body);
    // Mostly inside, not wholly: דירה 22's ran on past the bath's end into
    // the outer wall. A real wall stands beside a bath, not across it.
    return !baths.some((bath) => {
      const ox = Math.min(r.x + r.w, bath.x + bath.w) - Math.max(r.x, bath.x);
      const oy = Math.min(r.y + r.h, bath.y + bath.h) - Math.max(r.y, bath.y);
      return ox > 0 && oy > 0 && ox * oy >= 0.3 * r.w * r.h;
    });
  });
  // And the hatched pieces no pair of faces gave; see hatchedWallsMissed.
  // Widened to their hatch first (widenToHatch), then the hatched pieces no
  // pair of faces gave (hatchedWallsMissed).
  const widened = widenToHatch(faced, geometry.segments, unitsPerMetre, flatExtent);
  let bodies = [...widened, ...hatchedWallsMissed(widened, geometry.segments, unitsPerMetre, flatExtent).filter((body) => !inMark(body))];
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

  const standsOnFloor = (piece: FurniturePiece) =>
    inside(piece.x + piece.w / 2, piece.y + piece.h / 2) &&
    !bodies.some((body) => centreInsideBody(piece, body));
  const found = findFurniture(geometry.segments, unitsPerMetre, {
    curves: geometry.curves,
    acceptTable: standsOnFloor,
  }).filter((piece) => {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    // A sink or a hob stands on the worktop, and the strip between the
    // worktop's front line and the wall can be closed off from the floor:
    // דירה 14's double sink was on no floor at all, and was dropped. Floor
    // within a worktop's depth of it will do.
    // A pan or a basin is a closed outline, often with a dimension written in
    // it, and the floor flood stops at its ink: דירה 14's two WCs and its
    // basin stood on no floor of their own, and both bathrooms came out bare.
    // Floor just past the outline will do.
    const reach =
      piece.kind === "sink" || piece.kind === "hob"
        ? unitsPerMetre * 0.6
        : piece.kind === "fixture"
          ? Math.max(piece.w, piece.h) / 2 + unitsPerMetre * 0.15
          : 0;
    // Floor on this side of a wall only: past the wall is the neighbour's
    // kitchen, and דירה 15 and 22 took in the sinks drawn beyond theirs.
    const wallBetween = (tx: number, ty: number) =>
      bodies.some((body) => {
        const r = bodyRect(body);
        return (
          Math.max(r.x, Math.min(cx, tx)) <= Math.min(r.x + r.w, Math.max(cx, tx)) &&
          Math.max(r.y, Math.min(cy, ty)) <= Math.min(r.y + r.h, Math.max(cy, ty))
        );
      });
    const onFloor = [
      [0, 0],
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ].some(([dx, dy]) => inside(cx + dx!, cy + dy!) && (dx === 0 && dy === 0 ? true : !wallBetween(cx + dx!, cy + dy!)));
    if (!onFloor) return false;
    // A pan stands against its wall, and its drawn outline, cistern and all,
    // reaches into the wall's line: דירה 14's WC had its middle 3 cm inside
    // the wall behind it, and its box more than half in the wall's measured
    // thickness. A fixture goes only when it is nearly all in one wall (a
    // bath in a corner lies a quarter in each of two).
    if (piece.kind === "fixture") {
      const area = piece.w * piece.h;
      const inWall = Math.max(
        0,
        ...bodies.map((body) => {
          const r = bodyRect(body);
          const ox = Math.min(piece.x + piece.w, r.x + r.w) - Math.max(piece.x, r.x);
          const oy = Math.min(piece.y + piece.h, r.y + r.h) - Math.max(piece.y, r.y);
          return ox > 0 && oy > 0 ? ox * oy : 0;
        }),
      );
      return inWall < 0.7 * area;
    }
    return !bodies.some((body) => centreInsideBody(piece, body));
  });
  // The run the hob and the sink are set into; see findWorktopRuns.
  const worktops = findWorktopRuns(
    geometry.segments,
    found.filter((piece) => piece.kind === "hob" || piece.kind === "sink"),
    bodies.map(bodyRect),
    unitsPerMetre,
    found,
  );
  found.push(...worktops);
  // Wardrobes drawn against a wall, which the rectangle finder cannot close;
  // see findWardrobes. One already measured as a rectangle is kept as it is.
  const wardrobes = findWardrobes(geometry.segments, unitsPerMetre).filter((wardrobe) => {
    if (!standsOnFloor(wardrobe)) return false;
    return !found.some((piece) => {
      const ox = Math.min(piece.x + piece.w, wardrobe.x + wardrobe.w) - Math.max(piece.x, wardrobe.x);
      const oy = Math.min(piece.y + piece.h, wardrobe.y + wardrobe.h) - Math.max(piece.y, wardrobe.y);
      return ox > 0 && oy > 0 && ox * oy > 0.3 * Math.min(piece.w * piece.h, wardrobe.w * wardrobe.h);
    });
  });
  found.push(...wardrobes);

  // Seating, placed on the anchors rather than hunted for. A chair and a stool
  // are drawn as rounded shapes whose corner arcs are the only part that reaches
  // the curve list, and every attempt to detect them either missed the lot or
  // swept in the sanitary ware with them. The table and the island are found
  // reliably, and the plan puts chairs round one and stools along the other, so
  // there is nothing left to infer. It matters because the middle of the living
  // room was coming out as bare floor, and bare floor is what the model fills in
  // for itself — that is where the invented armchairs in the entrance came from.
  const overlaps = (piece: FurniturePiece, other: FurniturePiece) => {
    const ox = Math.min(piece.x + piece.w, other.x + other.w) - Math.max(piece.x, other.x);
    const oy = Math.min(piece.y + piece.h, other.y + other.h) - Math.max(piece.y, other.y);
    return ox > 0 && oy > 0 && ox * oy > 0.3 * Math.min(piece.w * piece.h, other.w * other.h);
  };
  // An unnamed rectangle lying wholly inside a sofa-sized piece is one of its
  // cushions, not a piece of its own.
  const partOf = (inner: FurniturePiece, outer: FurniturePiece) => {
    if (inner.kind !== "unknown" || Math.max(outer.w, outer.h) < unitsPerMetre) return false;
    const ox = Math.min(inner.x + inner.w, outer.x + outer.w) - Math.max(inner.x, outer.x);
    const oy = Math.min(inner.y + inner.h, outer.y + outer.h) - Math.max(inner.y, outer.y);
    return ox > 0 && oy > 0 && ox * oy >= 0.8 * inner.w * inner.h;
  };
  const clear = (piece: FurniturePiece, options?: { overUnknown?: boolean }) => {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    if (!inside(cx, cy)) return false;
    // Not standing in a wall, and not on top of something already there.
    if (bodies.some((body) => centreInsideBody(piece, body))) return false;
    // Overlap, not the centre: a seat whose centre fell just outside a WC it
    // half covered was kept, and דירה 16, 17 and 18 got a chair on the pan and
    // one in the bath.
    return !found.some((other) => !(options?.overUnknown && partOf(other, piece)) && overlaps(piece, other));
  };

  // The rounded furniture that does survive detection: the living room's own
  // armchairs and sofa. Only the pieces whose corner arcs come through as
  // separate knots make it, which on this sheet is the seating suite and a
  // handful of the sanitary ware — and the sanitary ware is already found, so
  // requiring clear ground drops it. What is left is the suite, and it is the
  // last bare patch in the middle of the flat.
  const rounded = findRoundedFurniture(geometry.curves, unitsPerMetre, { segments: geometry.segments });

  const table = found.find((piece) => piece.kind === "table");
  // The chairs drawn round the table replace the pieces of them found before:
  // דירה 21's end chair came through as two fragments of seat, and the chair
  // itself, overlapping them, was refused as standing on something. Any
  // chair-sized piece within the chairs' reach of the table is one of them.
  const chairsDrawn = table ? seatsDrawnAroundTable(table, geometry.curves, unitsPerMetre, geometry.segments) : null;
  const byTable = (piece: FurniturePiece) => {
    if (!table || Math.max(piece.widthCm, piece.depthCm) >= 105) return false;
    const reach = unitsPerMetre * 0.7;
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    return cx >= table.x - reach && cx <= table.x + table.w + reach && cy >= table.y - reach && cy <= table.y + table.h + reach;
  };
  if (chairsDrawn) {
    for (let i = found.length - 1; i >= 0; i--) {
      const piece = found[i]!;
      if (piece.kind === "seat" && byTable(piece)) found.splice(i, 1);
    }
  }
  const chairs = table ? (chairsDrawn ?? seatsAroundTable(table, unitsPerMetre)).filter((piece) => clear(piece)) : [];

  // A free-standing run: deep enough to be a counter, long enough to seat at,
  // and with floor on both of its long sides — a run against a wall is a
  // worktop and has no stools.
  const island = found.find((piece) => {
    // A run against a wall has floor behind the wall too, in the next room.
    if (worktops.includes(piece) || !looksLikeKitchenIsland(piece)) return false;
    const vertical = piece.h >= piece.w;
    const step = unitsPerMetre * 0.55;
    const lowSide = vertical
      ? inside(piece.x - step, piece.y + piece.h / 2)
      : inside(piece.x + piece.w / 2, piece.y - step);
    const highSide = vertical
      ? inside(piece.x + piece.w + step, piece.y + piece.h / 2)
      : inside(piece.x + piece.w / 2, piece.y + piece.h + step);
    return lowSide && highSide;
  });
  if (island && island.kind !== "counter") island.kind = "counter";
  let stools: FurniturePiece[] = [];
  if (island) {
    // Stools face the room, not the cook. Both sides of an island are floor, so
    // counting what fits does not choose between them — it put דירה 14's stools
    // between the island and the sink run. The working side is the one with the
    // kitchen's own units on it, so the stools go on whichever side is further
    // from the nearest hob, sink or worktop.
    // Not the island itself: it is renamed a counter above, and measured
    // against itself both sides were half a metre away, so the choice fell
    // to the tie — דירה 22's stools went on the cook's side.
    const fittings = found.filter(
      (piece) =>
        piece !== island &&
        (piece.kind === "hob" || piece.kind === "sink" || piece.kind === "counter" || piece.kind === "storage"),
    );
    const vertical = island.h >= island.w;
    const reach = (px: number, py: number) =>
      fittings.reduce((best, piece) => {
        const dx = Math.max(piece.x - px, px - (piece.x + piece.w), 0);
        const dy = Math.max(piece.y - py, py - (piece.y + piece.h), 0);
        return Math.min(best, Math.hypot(dx, dy));
      }, Infinity);
    const step = unitsPerMetre * 0.5;
    const lowRoom = vertical
      ? reach(island.x - step, island.y + island.h / 2)
      : reach(island.x + island.w / 2, island.y - step);
    const highRoom = vertical
      ? reach(island.x + island.w + step, island.y + island.h / 2)
      : reach(island.x + island.w / 2, island.y + island.h + step);
    const side = lowRoom >= highRoom ? "low" : "high";
    stools = stoolsAlongRun(island, unitsPerMetre, side).filter((piece) => clear(piece));
  }

  // A sofa is named and a rectangle inside it is not: דירה 21's second
  // two-seater carried one of its cushions as a 68 by 40 cm "unknown", and the
  // cushion, found first, kept the sofa out. The sofa stands; its parts go.
  const suite = rounded.filter(
    (piece) =>
      clear(piece, { overUnknown: true }) &&
      // A chair's corners found as a piece of their own, beside the chair.
      !(chairsDrawn && byTable(piece)),
  );
  // The suite comes in after the furniture pass, so its pieces in a bathroom
  // are settled here too; see bathroomSquaresAreNotSeats.
  const furniture = bedHeadsFromDrawing(
    kitchenSquaresAreAppliances(bathroomSquaresAreNotSeats(
      [...found.filter((piece) => !suite.some((seat) => partOf(piece, seat))), ...suite, ...chairs, ...stools],
      unitsPerMetre,
    ), unitsPerMetre),
    geometry.segments,
    unitsPerMetre,
  );

  // Terraces are read from the sheet the label sits on, and only kept where the
  // region grown from the label measures what the label says. A terrace that
  // leaks is dropped rather than guessed at.
  // Clipped to this flat. An uncut sheet carries the neighbour's labels too, and
  // its terraces are not this apartment's to draw.
  const printed = (options?.printedAreas ?? []).filter(
    (area) =>
      area.x >= flatExtent.x &&
      area.x <= flatExtent.x + flatExtent.width &&
      area.y >= flatExtent.y &&
      area.y <= flatExtent.y + flatExtent.height,
  );

  // Some drawing sets outline the balcony area text, so PDF text extraction
  // cannot seed the paving flood even though the layout reader has already
  // identified the balcony and its position. Use that independent room read as
  // a seed only; the vector flood must still reproduce its stated area before
  // the region is accepted as a measured terrace.
  const programmeTerraces = programmeTerraceSeeds(
    options?.programme,
    { width: geometry.pageWidth, height: geometry.pageHeight },
    flatExtent,
    printed,
    unitsPerMetre,
  );

  // The doors are the swings the sheet draws (findSwingArcs), and a terrace
  // is flooded with its doorways closed: 14's little roof terrace ran in
  // through its door into the bedroom and was refused as too big.
  const swingArcs = findSwingArcs(geometry.segments, geometry.curves, unitsPerMetre, { extent: flatExtent });
  const closed = [...bodies, ...doorwayBands(swingArcs, unitsPerMetre)];
  const fromInk = findTerraces(
    geometry.segments,
    [...printed, ...programmeTerraces],
    unitsPerMetre,
  );
  const missing = printed.filter(
    (area) =>
      !fromInk.some((terrace) => {
        if (
          area.value != null &&
          terrace.printedM2 != null &&
          Math.abs(terrace.printedM2 - area.value) > 0.05
        ) {
          return false;
        }
        return (
          area.x >= terrace.bounds.x &&
          area.x <= terrace.bounds.x + terrace.bounds.width &&
          area.y >= terrace.bounds.y &&
          area.y <= terrace.bounds.y + terrace.bounds.height
        );
      }),
  );
  const missingProgrammeTerraces = programmeTerraces.filter(
    (area) =>
      !fromInk.some(
        (terrace) =>
          area.x >= terrace.bounds.x &&
          area.x <= terrace.bounds.x + terrace.bounds.width &&
          area.y >= terrace.bounds.y &&
          area.y <= terrace.bounds.y + terrace.bounds.height,
      ),
  );
  const terraceHits =
    missing.length > 0 || missingProgrammeTerraces.length > 0
      ? [
          ...fromInk,
          ...findTerracesOnFloor(
            floor,
            closed,
            [...missing, ...missingProgrammeTerraces],
            unitsPerMetre,
          ),
        ]
      : fromInk;
  // A terrace whose area is drawn as outlines has no figure to seed it from,
  // but it still carries its level mark. Unlabelled, so the region is accepted
  // only inside the window a terrace measures; see findLevelMarks.
  // A mark on a terrace the programme reads at another level seeds nothing.
  const pageSize = { width: geometry.pageWidth, height: geometry.pageHeight };
  const otherLevelBoxes = (options?.programme?.rooms ?? [])
    .filter((room) => room.bbox != null && atOtherLevel(room, options?.programme))
    .map((room) => room.bbox!);
  const onOtherLevel = (mark: { x: number; y: number }) =>
    otherLevelBoxes.some((box) => {
      const fx = mark.x / pageSize.width;
      const fy = mark.y / pageSize.height;
      return fx >= box.x && fx <= box.x + box.w && fy >= box.y && fy <= box.y + box.h;
    });
  const levelSeeds = levelMarks.filter(
    (mark) =>
      !onOtherLevel(mark) &&
      mark.x >= flatExtent.x &&
      mark.x <= flatExtent.x + flatExtent.width &&
      mark.y >= flatExtent.y &&
      mark.y <= flatExtent.y + flatExtent.height &&
      !terraceHits.some((terrace) => spansContain(terrace.rows, mark.x, mark.y)),
  );
  // A level mark is also drawn inside a room — a wet room's lowered floor — and
  // that room has a bed, a pan or a basin in it, or two wet pieces. Outlined
  // lettering is not proof, nor is the mark itself, a circle a basin's size.
  // Within the circle itself, not a margin round it: a terrace's drain is
  // drawn beside its mark, and on דירה 22 a wider margin let the drain pass
  // and the roof below the flat became two terraces.
  // On a mark, or with a mark inside it: 22's roof mark and its figure,
  // knotted into one 66 by 48 piece, had the mark off its middle.
  const diamonds = findDiamonds(geometry.segments, unitsPerMetre);
  const findDiamondsIn = (piece: FurniturePiece) =>
    diamonds.filter((d) => d.x >= piece.x && d.x <= piece.x + piece.w && d.y >= piece.y && d.y <= piece.y + piece.h);
  const onMark = (piece: FurniturePiece) =>
    levelMarks.some(
      (mark) =>
        Math.hypot(piece.x + piece.w / 2 - mark.x, piece.y + piece.h / 2 - mark.y) < mark.r * 1.2 ||
        (piece.kind !== "bed" &&
          mark.x >= piece.x &&
          mark.x <= piece.x + piece.w &&
          mark.y >= piece.y &&
          mark.y <= piece.y + piece.h),
    );
  // The doorways, from the wall pieces before they are joined across them.
  const pieces = clipBodiesToBounds(
    wallBodiesForSheet(geometry.segments, { unitsPerMetre, keepOpenings: true }),
    flatExtent,
    8,
    { truncate: true },
  ).filter(touchesFlat);
  // A seed whose printed level is the flat's own is the flat's terrace, and
  // is taken at any size a terrace can be; see levelTextAt. The paving's
  // joints eat into the flood, and דירה 18's 8 m² terrace, at the flat's
  // +11.42, measured 2.69 and fell under the floor below.
  const legendLevel = flatLevelText(geometry, floor, terraceHits, unitsPerMetre);
  // A legend copied from the storey below keeps that storey's level: דירה
  // 22's reads +11.42, 18's, while both its terraces are marked +14.36. When
  // no mark on the sheet agrees with the legend and at least two agree with
  // each other, the flat stands at theirs.
  const markTexts = levelMarks
    .map((mark) => levelTextAt(mark, geometry.segments, geometry.curves))
    .filter((text): text is LevelText => text != null);
  const sharedLevel = (() => {
    if (!legendLevel || markTexts.some((text) => sameLevelText(text, legendLevel))) return null;
    const groups = markTexts.map((text) => markTexts.filter((other) => sameLevelText(text, other)));
    const best = groups.reduce<LevelText[]>((a, g) => (g.length > a.length ? g : a), []);
    return best.length >= 2 ? best[0]! : null;
  })();
  const flatLevel = sharedLevel ?? legendLevel;
  const atFlatLevel = (mark: { x: number; y: number; r: number }) => {
    if (!flatLevel) return false;
    const text = levelTextAt(mark, geometry.segments, geometry.curves);
    return text != null && sameLevelText(text, flatLevel);
  };
  // A mark whose figure cannot be read — 14's "+9.64" is printed on end — is
  // not at another level, only unread; it seeds as the flat's own would. Not
  // by access: most of these sheets draw a terrace with no way out to it.
  const unread = (mark: { x: number; y: number; r: number }) =>
    flatLevel != null && levelTextAt(mark, geometry.segments, geometry.curves) == null;
  const ownSeeds = levelSeeds.filter((mark) => atFlatLevel(mark) || unread(mark));
  const otherSeeds = levelSeeds.filter((mark) => !atFlatLevel(mark) && !unread(mark));
  const unlabelledHits =
    otherSeeds.length > 0
      ? // At least 2.8 m²: unlabelled, the region has only its size to go on.
        // The two real ones measured 3.04 and 3.19; the roof beside דירה 22,
        // 2.53.
        findTerracesOnFloor(floor, closed, otherSeeds, unitsPerMetre, { unlabelledM2: { min: 2.8, max: 16 } })
      : [];
  const ownHits =
    ownSeeds.length > 0
      ? findTerracesOnFloor(floor, closed, ownSeeds, unitsPerMetre, { unlabelledM2: { min: 1.2, max: 16 }, growRim: true })
      : [];
  const standsIn = (terrace: { rows: SpanRow[] }) =>
    furniture.filter(
      (piece) => !onMark(piece) && spansContain(terrace.rows, piece.x + piece.w / 2, piece.y + piece.h / 2),
    );
  const markedHits = [
    ...unlabelledHits.filter((terrace) => {
      const inside = standsIn(terrace);
      const wet = inside.filter((piece) => piece.kind === "fixture" || piece.kind === "sink");
      // A line of outlined lettering: long and thin. דירה 15's "שטח המרפסת 6.44"
      // reads as a 100 by 50 cm fixture; a pan or a basin is not that shape, and
      // neither was the 106 by 77 cm piece on the roof beside דירה 22.
      const lettering = (piece: FurniturePiece) =>
        Math.max(piece.widthCm, piece.depthCm) >= 80 && Math.min(piece.widthCm, piece.depthCm) <= 60;
      return !inside.some((piece) => piece.kind === "bed") && wet.length < 2 && wet.every(lettering);
    }),
    // At the flat's own level it is a terrace by its figure; only a bed says
    // otherwise. The lettering of דירה 18's "שטח המרפסת 4.6" read as two
    // fixtures and took its terrace for a bathroom.
    // Nor one already found: a mark just off the paving's grown region seeds
    // the same terrace again, and דירה 16 got its terrace twice.
    ...ownHits.filter(
      (terrace) =>
        !standsIn(terrace).some((piece) => piece.kind === "bed") &&
        !terraceHits.some((found) =>
          terrace.rows.some((row) =>
            row.spans.some(([a, b]) => spansContain(found.rows, (a + b) / 2, row.y)),
          ),
        ),
    ),
  ];
  // A terrace at another level than the flat's, with no door onto it, is the
  // roof of the storey below or the terrace of the one above: דירה 18's
  // "5.2" at +12.79, printed as text and so grown and kept, beside a flat at
  // +11.42 with only windows onto it. Access decides, not level alone — דירה
  // 20's middle bedroom opens onto its terrace three metres up the sheet's
  // section — so a door onto it keeps it.
  // A door onto it, by the swings: the leaf-first search missed 21's
  // twin-bedroom door onto its roof, and the roof was taken for the storey
  // below's.
  const reach = unitsPerMetre * 0.35;
  const doorOnto = (terrace: { rows: SpanRow[] }) =>
    swingArcs.some((arc) =>
      [arc.a0, arc.a1].some((deg) => {
        // Either end may be the jamb: the doorway runs from the hinge to it,
        // and a door onto the terrace has the terrace off one side of it.
        const ex = Math.cos((deg * Math.PI) / 180);
        const ey = Math.sin((deg * Math.PI) / 180);
        const mx = arc.cx + (ex * arc.r) / 2;
        const my = arc.cy + (ey * arc.r) / 2;
        return [1, -1].some((side) => spansContain(terrace.rows, mx - ey * reach * side, my + ex * reach * side));
      }),
    );
  const elsewhere = (terrace: { rows: SpanRow[] }) => {
    if (!flatLevel) return false;
    // In its box, not only on its rows: the mark's own hatch stops the flood,
    // and 21's roof flooded round its +15.94 and was taken for the flat's.
    const xs = terrace.rows.flatMap((row) => row.spans.flat());
    const ys = terrace.rows.map((row) => row.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const own = levelMarks.filter(
      (mark) => spansContain(terrace.rows, mark.x, mark.y) || (mark.x >= x0 && mark.x <= x1 && mark.y >= y0 && mark.y <= y1),
    );
    const texts = own
      .map((mark) => levelTextAt(mark, geometry.segments, geometry.curves))
      .filter((text): text is LevelText => text != null);
    return texts.length > 0 && texts.every((text) => !sameLevelText(text, flatLevel));
  };
  // A terrace is somewhere to stand: a strip a hand deep down an outer wall —
  // the gap between 16's and 17's facade and their window sills, flooded from
  // a seed — is not one. Its area over its length is its depth.
  const deepEnough = (rows: SpanRow[]) => {
    if (rows.length === 0) return false;
    const pitch = rows.length > 1 ? Math.abs(rows[1]!.y - rows[0]!.y) || 1 : 1;
    const area = rows.reduce((t, r) => t + r.spans.reduce((u, [a, b]) => u + (b - a), 0), 0) * pitch;
    const x0 = Math.min(...rows.flatMap((r) => r.spans.map(([a]) => a)));
    const x1 = Math.max(...rows.flatMap((r) => r.spans.map(([, b]) => b)));
    const y0 = Math.min(...rows.map((r) => r.y));
    const y1 = Math.max(...rows.map((r) => r.y)) + pitch;
    const length = Math.max(x1 - x0, y1 - y0);
    return area / length >= unitsPerMetre * 0.7 && area >= unitsPerMetre * unitsPerMetre * 1.2;
  };
  // A terrace at another level with no door onto it is someone else's — the
  // roof of the flat below, the terrace of the one above — and no part of
  // this flat's floor either: 21's roof at +15.94, beside a flat at +12.79,
  // came out a bathroom for the lettering on it.
  // Each mark at another level gives a region: its
  // flood, or, where the flood ran out of it through a doorway into the flat
  // (21's roof), its paving grown from round the mark. Lettering does not
  // count as furniture in it — and lettering reads as fixtures and unknowns
  // of every shape (21's "מ"ר" as a 70 by 34 cm one) — so only furniture
  // proper stops the paving. A bathroom is kept by its door.
  const notLettering = furniture.filter((piece) => piece.kind !== "fixture" && piece.kind !== "unknown");
  // Not over a mark at the flat's own level: on 18 the paving of the
  // storey above ran on along the sheet's edge line into the flat's own
  // 4.6 m² terrace, and took it out of the flat.
  const notOverOwnMark = (region: SpanRow[]) =>
    !levelMarks.some((mark) => {
      if (!spansContain(region, mark.x, mark.y)) return false;
      const text = levelTextAt(mark, geometry.segments, geometry.curves);
      return text == null || (flatLevel != null && sameLevelText(text, flatLevel));
    });
  const pavedAround = (mark: { x: number; y: number }): SpanRow[] | null => {
    const half = unitsPerMetre * 0.5;
    const square: SpanRow[] = [];
    for (let y = mark.y - half; y <= mark.y + half; y += 2) square.push({ y, spans: [[mark.x - half, mark.x + half]] });
    const grown = terraceFromPaving(square, geometry.segments, bodies, notLettering, unitsPerMetre, notOverOwnMark, true);
    return grown === square ? null : grown;
  };
  const regionsAt = (marks: typeof levelSeeds) =>
    marks
      .map((mark) => {
        const flooded = findTerracesOnFloor(floor, closed, [mark], unitsPerMetre, {
          unlabelledM2: { min: 0.5, max: 16 },
          growRim: true,
        })[0];
        const rows = flooded && standsIn(flooded).every((piece) => !notLettering.includes(piece)) ? flooded.rows : pavedAround(mark);
        return rows ? { rows } : null;
      })
      .filter((region): region is { rows: SpanRow[] } => region != null);
  // At another level with no door onto it, it is someone else's — the roof
  // of the flat below, the terrace of the one above — and no part of this
  // flat's floor: 21's roof at +15.94 came out a bathroom for the lettering
  // on it.
  // One region holding marks at two levels is two terraces the flood ran
  // together: 18's +12.79 and +11.42 are a strip of paving apart, and with
  // no wall between them came back as one terrace, the flat's. Cut half-way
  // between the marks, across the line that joins them; one region each.
  const markInBox = (region: { rows: SpanRow[] }, mark: { x: number; y: number }) => {
    const xs = region.rows.flatMap((row) => row.spans.flat());
    const ys = region.rows.map((row) => row.y);
    return mark.x >= Math.min(...xs) && mark.x <= Math.max(...xs) && mark.y >= Math.min(...ys) && mark.y <= Math.max(...ys);
  };
  const splitByLevel = (regions: Array<{ rows: SpanRow[] }>): Array<{ rows: SpanRow[] }> => {
    const out: Array<{ rows: SpanRow[] }> = [];
    for (const region of regions) {
      const marks = levelMarks
        .filter((mark) => spansContain(region.rows, mark.x, mark.y) || markInBox(region, mark))
        .map((mark) => ({ mark, text: levelTextAt(mark, geometry.segments, geometry.curves) }))
        .filter((m) => m.text != null);
      const a = marks[0];
      const b = marks.find((m) => a && !sameLevelText(m.text!, a.text!));
      if (!a || !b) {
        out.push(region);
        continue;
      }
      const vertical = Math.abs(b.mark.y - a.mark.y) >= Math.abs(b.mark.x - a.mark.x);
      const cut = vertical ? (a.mark.y + b.mark.y) / 2 : (a.mark.x + b.mark.x) / 2;
      if (vertical) {
        out.push({ rows: region.rows.filter((row) => row.y < cut) }, { rows: region.rows.filter((row) => row.y >= cut) });
      } else {
        const side = (lo: boolean) =>
          region.rows
            .map((row) => ({
              y: row.y,
              spans: row.spans
                .map(([x0, x1]) => (lo ? [x0, Math.min(x1, cut)] : [Math.max(x0, cut), x1]) as [number, number])
                .filter(([x0, x1]) => x1 > x0),
            }))
            .filter((row) => row.spans.length > 0);
        out.push({ rows: side(true) }, { rows: side(false) });
      }
    }
    // Once each: the two marks seeded the same region twice.
    const key = (r: { rows: SpanRow[] }) => r.rows.length + ":" + Math.round(r.rows[0]?.y ?? 0) + ":" + Math.round(spanArea(r.rows));
    const seen = new Set<string>();
    return out.filter((r) => r.rows.length > 1 && !seen.has(key(r)) && seen.add(key(r)));
  };
  const allTerraces = splitByLevel([...terraceHits, ...markedHits]);
  const notTheFlats = [
    ...allTerraces.filter((terrace) => elsewhere(terrace) && !doorOnto(terrace)),
    // With the marks the programme already put at another level, which seed
    // nothing above — their floor is still the flat's footprint: 18's +12.79
    // terrace of the storey above was drawn with its paving and windows.
    ...regionsAt([
      ...otherSeeds,
      ...levelMarks.filter(
        (mark) =>
          onOtherLevel(mark) &&
          mark.x >= flatExtent.x &&
          mark.x <= flatExtent.x + flatExtent.width &&
          mark.y >= flatExtent.y &&
          mark.y <= flatExtent.y + flatExtent.height,
      ),
    ]).filter((region) => !doorOnto(region)),
  ].map((terrace) =>
    terraceFromPaving(terrace.rows, geometry.segments, bodies, notLettering, unitsPerMetre, notOverOwnMark),
  );
  const terraces = allTerraces
    .filter((terrace) => !elsewhere(terrace) || doorOnto(terrace))
    .map((terrace) => {
      const paved = terraceFromPaving(
        terrace.rows,
        geometry.segments,
        bodies,
        furniture.filter((piece) => piece.kind !== "fixture" && piece.kind !== "unknown"),
        unitsPerMetre,
        // Not past a mark at another level than the flood's own: on דירה 18
        // the paving ran on along the sheet's edge line into the +12.79
        // terrace of the storey above.
        (region) => {
          const levelsIn = (r: SpanRow[]) =>
            levelMarks
              .filter((mark) => spansContain(r, mark.x, mark.y))
              .map((mark) => levelTextAt(mark, geometry.segments, geometry.curves))
              .filter((text): text is LevelText => text != null);
          const own = levelsIn(terrace.rows);
          const reference = own.length > 0 ? own : flatLevel ? [flatLevel] : [];
          return levelsIn(region).every((text) => reference.some((ref) => sameLevelText(text, ref)));
        },
      );
      // Cut back only a flood the paving did not already give its shape —
      // and never into another flat's terrace beside it: past the paving
      // strip between them, 18's terrace grew 60 cm into the +12.79 above.
      const shaped = paved === terrace.rows ? cropToPaving(paved, geometry.segments, unitsPerMetre) : paved;
      return notTheFlats.length > 0 ? withoutRows(shaped, notTheFlats) : shaped;
    })
    // Opened only where the terrace survives it: דירה 18's 8 m² terrace,
    // flooded 75 cm deep against the sheet's edge, was opened away whole.
    .map((rows) => {
      const opened = openRows(rows, unitsPerMetre * 0.35, undefined, unitsPerMetre * 0.1);
      return deepEnough(opened) ? opened : rows;
    })
    .filter(deepEnough)
    // Once each: two marks on one terrace flood it twice.
    .filter((rows, i, all) => {
      const area = spanArea(rows);
      return !all.slice(0, i).some((other) => spanArea(withoutRows(rows, [other])) < area * 0.2);
    });

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
  // A door needs somewhere to swing. An armchair's arcs beside a wall read as
  // a swing, and דירה 14 got a door in the middle bedroom's wall with a sofa
  // on one side of it and a bed on the other. A leaf sweeps a square its own
  // width deep; on one side at least, that square is clear of furniture.
  const solid = furniture.filter((piece) =>
    ["bed", "seat", "table", "counter", "storage", "desk"].includes(piece.kind),
  );
  const sweepBlocked = (door: Opening, side: -1 | 1): boolean => {
    const width = door.to - door.from;
    const near = door.centre + side * door.thickness / 2;
    const far = near + side * width;
    const sq =
      door.orientation === "h"
        ? { x0: door.from, x1: door.to, y0: Math.min(near, far), y1: Math.max(near, far) }
        : { x0: Math.min(near, far), x1: Math.max(near, far), y0: door.from, y1: door.to };
    const area = (sq.x1 - sq.x0) * (sq.y1 - sq.y0);
    const covered = solid.reduce((sum, piece) => {
      const ox = Math.min(sq.x1, piece.x + piece.w) - Math.max(sq.x0, piece.x);
      const oy = Math.min(sq.y1, piece.y + piece.h) - Math.max(sq.y0, piece.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
    return covered > area * 0.25;
  };
  const passable = (door: Opening) => !(sweepBlocked(door, -1) && sweepBlocked(door, 1));
  const doors = swings.filter(passable);
  /**
   * Openings from the hatch the sheet stops drawing.
   *
   * A door or a window is drawn by stopping a wall's hatch and carrying its
   * faces across the gap, so no gap appears between bodies and the rules above
   * cannot see it: דירה 14 measured six openings and not one window.
   *
   * Which kind of opening it is, is read from the floor on either side of it —
   * not from the flat's bounding box, which is right only for a rectangle, and
   * found one of דירה 14's nine envelope openings. Floor on one side only: the
   * wall is the envelope and the break is a window. Floor on both sides: it is
   * a doorway between two rooms.
   *
   * Measured on the ten reference sheets with the pipeline's own segmenter:
   * openings 71 → 165, windows 4 → 38, rooms 58 → 59 — no sheet lost a room,
   * and דירה 14 gained one. Doorways are sealed as barriers, so a wrong one
   * would shred a room; the width limit and the floor on both sides are what
   * keep them honest, and the room count is what proved it.
   */
  const covered = (gap: Opening) =>
    [...doors, ...gaps].some(
      (other) =>
        other.orientation === gap.orientation &&
        Math.abs(other.centre - gap.centre) <= Math.max(other.thickness, gap.thickness) &&
        other.to > gap.from &&
        other.from < gap.to,
    );
  const rowPitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  // A terrace is not the flat's floor. The lock's floor runs out over the
  // balconies, so the door and the windows onto דירה 14's two terraces had
  // "floor" on both sides and were taken for doorways between rooms — drawn
  // as holes in the wall, each with a mezuzah.
  const floorAt = (x: number, y: number) =>
    floor.some(
      (row) => y >= row.y - rowPitch && y <= row.y + rowPitch && row.spans.some(([a, b]) => x >= a && x <= b),
    ) && !terraces.some((rows) => spansContain(rows, x, y));
  // Each side is floor if any of a few points off the gap is: one point
  // landed in a bed's or a wardrobe's outline, which the floor's flood goes
  // round, and 17's top bedroom door came out a window.
  const floorSides = (gap: Opening): number => {
    let n = 0;
    for (const sign of [-1, 1]) {
      let floorHere = false;
      for (const f of [0.25, 0.5, 0.75]) {
        for (const d of [0.25, 0.5]) {
          const along = gap.from + (gap.to - gap.from) * f;
          const across = gap.centre + sign * (gap.thickness / 2 + unitsPerMetre * d);
          const [x, y] = gap.orientation === "h" ? [along, across] : [across, along];
          if (floorAt(x, y)) floorHere = true;
        }
      }
      if (floorHere) n++;
    }
    return n;
  };
  const hatchGaps = findHatchGaps(bodies, geometry.segments, unitsPerMetre, { curves: geometry.curves }).filter((gap) => !covered(gap));
  const hatchWindows = hatchGaps.filter((gap) => floorSides(gap) === 1 && !gap.swung);
  const hatchDoorways = hatchGaps.filter(
    (gap) => (floorSides(gap) === 2 || gap.swung === true) && gap.to - gap.from <= unitsPerMetre * 1.3,
  );
  // Which of the two found a hole is the whole door/window distinction, and
  // merging them used to throw it away. Kept now, so a still can be asked for
  // glazing where the sheet draws glazing.
  // One test for inside and outside, the same for every gap: a window has the
  // flat's floor on one side of it, a doorway on both. findOpenings' gaps were
  // judged by the flat's bounding box instead, so a window in any outer wall
  // not on the extreme edge became an interior doorway — rendered as a hole to
  // the outside, with a mezuzah on it.
  const classified = classifyOpenings(
    doors,
    // A way through between two rooms is walked through: not with furniture
    // across it on both sides. A window's far side is outdoors, so it stays.
    [...gaps, ...hatchDoorways].filter((gap) => floorSides(gap) < 2 || passable(gap)),
    flatExtent,
    unitsPerMetre,
    (gap) => floorSides(gap) < 2,
  );
  // A break in the envelope is a window, whatever the bounding box says —
  // and one hole is one opening, whichever detectors found it, in the order
  // doors, doorways, windows.
  const detected: typeof classified = [];
  for (const candidate of [
    ...classified,
    ...hatchWindows.map((gap) => ({ ...gap, kind: "window" as const })),
  ]) {
    if (detected.some((kept) => sameHole(kept, candidate, unitsPerMetre * 0.3))) continue;
    detected.push(candidate);
  }
  // The front door is the one the sheet's entrance arrow points through. By
  // the floor test alone it is a window: the landing is not the flat's floor.
  const entranceMarkers = findEntranceMarkers([...geometry.segments, ...geometry.curves]);
  const entered = placeEntranceDoor(detected, entranceMarkers, { floor, bodies, unitsPerMetre });
  // The doors are where the sheet draws their swings, and every opening
  // stands in a wall; see doorsFromSwings and openingsInWalls.
  const swung = doorsFromSwings(
    entered,
    swingArcs,
    bodies,
    geometry.segments,
    unitsPerMetre,
    (o) => floorSides(o) >= 1,
  );
  // A leaf read into its wall's thickness is taken out; see narrowWallsAroundLeaves.
  bodies = narrowWallsAroundLeaves(bodies, swung, geometry.segments, unitsPerMetre);
  // The landing outside the front door is not the flat's; see floorWithoutLanding.
  const flatFloor = floorWithoutLanding(floor, [...bodies, ...swung], entranceMarkers, unitsPerMetre);
  // Walls with none of the flat's floor beside them are the stair hall's or a
  // void's; see wallsBesideFlatFloor.
  const openFloor = openFloorLookup(flatFloor, bodies, unitsPerMetre, 0.2, (x, y) =>
    [...terraces, ...notTheFlats].some((rows) => spansContain(rows, x, y)),
  );
  bodies = wallsBesideFlatFloor(
    bodies,
    {
      room: (x, y) => openFloor(x, y) && ![...terraces, ...notTheFlats].some((rows) => spansContain(rows, x, y)),
      // Another flat's terrace is no reason for a wall to be this flat's.
      terrace: (x, y) => terraces.some((rows) => spansContain(rows, x, y)) && !notTheFlats.some((rows) => spansContain(rows, x, y)),
    },
    findCrossedBoxes(geometry.segments, unitsPerMetre),
    geometry.segments,
    unitsPerMetre,
    markSymbols,
  );
  // And asked again of the walls as cut back: a figure's band ran on into
  // the walls beside it before.
  bodies = bodies.filter((body) => !inMark(body));
  const openings = openingsInWalls(swung, bodies, unitsPerMetre, {
    segments: geometry.segments,
    betweenRooms: (o) => floorSides(o) === 2,
  });
  if (flatFloor !== floor) {
    floorM2 = spanArea(flatFloor) / (unitsPerMetre * unitsPerMetre);
    areaError = printedAreaM2 > 0 ? floorM2 / printedAreaM2 - 1 : areaError;
  }

  // A desk is a rectangle the classifier has to call storage, because a
  // sideboard is the same rectangle. The sheet already said which room is the
  // work room, so the pieces standing in it are desks — and the plate draws a
  // desk, which is what stops the work room being furnished as a bedroom.
  const page = { width: geometry.pageWidth, height: geometry.pageHeight };
  const furnishings = clearFurnitureFromEmptyRooms(
    deskFurnitureInOffices(furniture, options?.programme, page),
    options?.programme,
    page,
  );
  // The flat's legend — number in a diamond, area, level — is not furniture,
  // nor anything drawn inside it; see findDiamonds.
  // Only a box a legend's size and kind: the axes' crossings carry diamonds
  // too, under the walls and the wardrobes along them.
  const legends = furnishings.filter(
    (piece) =>
      (piece.kind === "fixture" || piece.kind === "unknown") &&
      Math.max(piece.widthCm, piece.depthCm) >= 80 &&
      Math.max(piece.widthCm, piece.depthCm) <= 200 &&
      findDiamondsIn(piece).length > 0,
  );
  const inLegend = (piece: FurniturePiece) =>
    legends.some((box) => piece.x >= box.x - 2 && piece.y >= box.y - 2 && piece.x + piece.w <= box.x + box.w + 2 && piece.y + piece.h <= box.y + box.h + 2);
  // Mostly wall is no piece: a window's pocket drawn in the shelter's wall
  // (14, 16), a sill's corner arcs read as a seat (16), lettering across a
  // wall onto the terrace (18).
  const inWalls = (piece: FurniturePiece) => {
    const area = piece.w * piece.h;
    let covered = 0;
    for (const body of bodies) {
      const r = bodyRect(body);
      const ox = Math.min(piece.x + piece.w, r.x + r.w) - Math.max(piece.x, r.x);
      const oy = Math.min(piece.y + piece.h, r.y + r.h) - Math.max(piece.y, r.y);
      if (ox > 0 && oy > 0) covered += ox * oy;
    }
    return covered >= 0.45 * area;
  };
  // A bed's pillows are closed outlines a basin's size, and were read as
  // pieces of their own lying on it: three on דירה 17, two on 18.
  const beds = furnishings.filter((piece) => piece.kind === "bed");
  const onBed = (piece: FurniturePiece) =>
    (piece.kind === "unknown" || piece.kind === "fixture" || piece.kind === "seat") &&
    beds.some((bed) => {
      const ox = Math.min(piece.x + piece.w, bed.x + bed.w) - Math.max(piece.x, bed.x);
      const oy = Math.min(piece.y + piece.h, bed.y + bed.h) - Math.max(piece.y, bed.y);
      return ox > 0 && oy > 0 && ox * oy >= 0.6 * piece.w * piece.h;
    });
  // A bath is set against walls; a bath's size and shape with floor all
  // round it is a kitchen island. דירה 18's, 60 by 142 with its stools drawn
  // beside it, read as a bath in the kitchen.
  const freeBathIsAnIsland = (piece: FurniturePiece): FurniturePiece => {
    if (piece.kind !== "fixture" || piece.fixture || Math.max(piece.widthCm, piece.depthCm) < 120) return piece;
    const reach = unitsPerMetre * 0.15;
    const touches = bodies.some((body) => {
      const r = bodyRect(body);
      const gx = Math.max(r.x - (piece.x + piece.w), piece.x - (r.x + r.w), 0);
      const gy = Math.max(r.y - (piece.y + piece.h), piece.y - (r.y + r.h), 0);
      return Math.hypot(gx, gy) <= reach;
    });
    return touches ? piece : { ...piece, kind: "counter" };
  };
  // A vanity is a cabinet with a bowl in it: a rounded outline a basin's
  // size, clear of the cabinet's edges. דירה 18's 93 by 51 basin, its oval
  // drawn inside, read as storage.
  const cabinetWithBowlIsASink = (piece: FurniturePiece): FurniturePiece => {
    if (piece.kind !== "storage" && piece.kind !== "unknown") return piece;
    // Not in a kitchen: a bowl beside the hob is the sink of the run.
    const hobNear = furnishings.some(
      (other) =>
        other.kind === "hob" &&
        Math.hypot(other.x + other.w / 2 - (piece.x + piece.w / 2), other.y + other.h / 2 - (piece.y + piece.h / 2)) <=
          unitsPerMetre * 2,
    );
    if (hobNear) return piece;
    if (Math.max(piece.widthCm, piece.depthCm) > 120 || Math.min(piece.widthCm, piece.depthCm) > 65) return piece;
    const edge = unitsPerMetre * 0.03;
    const inside = (x: number, y: number) =>
      x >= piece.x + edge && x <= piece.x + piece.w - edge && y >= piece.y + edge && y <= piece.y + piece.h - edge;
    const bowl = geometry.curves.filter((c) => inside(c.x1, c.y1) && inside(c.x2, c.y2));
    if (bowl.length < 8) return piece;
    const cm = (v: number) => (v / unitsPerMetre) * 100;
    const w = cm(Math.max(...bowl.map((c) => Math.max(c.x1, c.x2))) - Math.min(...bowl.map((c) => Math.min(c.x1, c.x2))));
    const h = cm(Math.max(...bowl.map((c) => Math.max(c.y1, c.y2))) - Math.min(...bowl.map((c) => Math.min(c.y1, c.y2))));
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    // A level mark's ⊕ is a circle too, hatched across: 22's legend became a
    // basin. A bowl is not hatched.
    const bx0 = Math.min(...bowl.map((c) => Math.min(c.x1, c.x2)));
    const bx1 = Math.max(...bowl.map((c) => Math.max(c.x1, c.x2)));
    const by0 = Math.min(...bowl.map((c) => Math.min(c.y1, c.y2)));
    const by1 = Math.max(...bowl.map((c) => Math.max(c.y1, c.y2)));
    const hatched = geometry.segments.filter((seg) => {
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      if (mx < bx0 || mx > bx1 || my < by0 || my > by1) return false;
      const deg = ((Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI + 180) % 90;
      return Math.abs(deg - 45) < 10;
    }).length;
    if (hatched >= 2 || findDiamondsIn(piece).length > 0) return piece;
    // A basin, not a sink: a sink makes its room a kitchen, and 18's bathroom
    // came out one.
    return long >= 25 && long <= 70 && short >= 18 && short <= 55 ? { ...piece, kind: "fixture", fixture: "basin" } : piece;
  };
  // The flat's own level mark, the small ⊕ in its legend: a box round it read
  // as a 49 by 35 cm fixture on דירה 22. Only something that small — a wet
  // room's lowered-floor mark can sit inside a shower tray.
  const smallMarks = findLevelMarks(geometry.curves, geometry.segments, unitsPerMetre, { minRadiusM: 0.07, minHatch: 2 }).filter(
    (mark) => mark.r < unitsPerMetre * 0.12,
  );
  const roundsAMark = (piece: FurniturePiece) =>
    (piece.kind === "fixture" || piece.kind === "unknown") &&
    Math.max(piece.widthCm, piece.depthCm) <= 60 &&
    smallMarks.some((mark) => mark.x >= piece.x && mark.x <= piece.x + piece.w && mark.y >= piece.y && mark.y <= piece.y + piece.h);
  // A chair at the head of the table, drawn into the table's bevelled
  // corner, came out one 94 by 71 cm unknown with the table's end inside it
  // (דירה 16). What stands past the table is the chair.
  const tables = furnishings.filter((piece) => piece.kind === "table");
  const chairAtTheTableEnd = (piece: FurniturePiece): FurniturePiece => {
    if (piece.kind !== "unknown") return piece;
    for (const t of tables) {
      const ox = Math.min(piece.x + piece.w, t.x + t.w) - Math.max(piece.x, t.x);
      const oy = Math.min(piece.y + piece.h, t.y + t.h) - Math.max(piece.y, t.y);
      if (ox <= 0 || oy <= 0) continue;
      // Cut along the side the piece stands out from.
      const rest =
        ox >= piece.w * 0.8
          ? piece.y < t.y
            ? { x: piece.x, y: piece.y, w: piece.w, h: t.y - piece.y }
            : { x: piece.x, y: t.y + t.h, w: piece.w, h: piece.y + piece.h - (t.y + t.h) }
          : oy >= piece.h * 0.8
            ? piece.x < t.x
              ? { x: piece.x, y: piece.y, w: t.x - piece.x, h: piece.h }
              : { x: t.x + t.w, y: piece.y, w: piece.x + piece.w - (t.x + t.w), h: piece.h }
            : null;
      if (!rest || rest.w <= 0 || rest.h <= 0) continue;
      // The bevel's corners widen it past the chair: kept to a chair's
      // width, on the middle.
      const chair = 0.55 * unitsPerMetre;
      const seat =
        rest.w > chair && rest.w >= rest.h
          ? { ...rest, x: rest.x + (rest.w - chair) / 2, w: chair }
          : rest.h > chair && rest.h > rest.w
            ? { ...rest, y: rest.y + (rest.h - chair) / 2, h: chair }
            : rest;
      const wCm = (seat.w / unitsPerMetre) * 100;
      const hCm = (seat.h / unitsPerMetre) * 100;
      if (Math.min(wCm, hCm) < 30 || Math.max((rest.w / unitsPerMetre) * 100, (rest.h / unitsPerMetre) * 100) > 100) continue;
      return { ...piece, ...seat, kind: "seat", widthCm: wCm, depthCm: hCm };
    }
    return piece;
  };
  // A door leaf drawn as straight lines, no arc, beside its doorway: 17's two
  // leaves at the corner by its dining table were read as a 141 by 79 cm
  // sofa. A seat at a doorway with a long diagonal through it is the leaf.
  const doorLeafSeat = (piece: FurniturePiece) => {
    if (piece.kind !== "seat") return false;
    const near = unitsPerMetre * 0.05;
    const atDoor = openings.some((o) => {
      const r = bodyRect(o);
      return (
        r.x - near < piece.x + piece.w && r.x + r.w + near > piece.x && r.y - near < piece.y + piece.h && r.y + r.h + near > piece.y
      );
    });
    if (!atDoor) return false;
    // The swing is often drawn as curve chords — 17's, three of them.
    return [...geometry.segments, ...geometry.curves].some((s) => {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      if (len < unitsPerMetre * 0.4) return false;
      const deg = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
      const slant = Math.min(Math.abs(deg - 0), Math.abs(deg - 90), Math.abs(deg - 180));
      if (slant < 15) return false;
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      return mx > piece.x && mx < piece.x + piece.w && my > piece.y && my < piece.y + piece.h;
    });
  };
  const furnitureOffTerrace = furnishings.filter((piece) => {
    if (inLegend(piece) || onBed(piece) || roundsAMark(piece)) return false;
    if (doorLeafSeat(piece)) return false;
    if (piece.kind !== "bed" && piece.kind !== "table" && piece.kind !== "fixture" && inWalls(piece)) return false;
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    // A level mark is a circle a basin's size and was read as one; on דירה 15
    // it made the west terrace a bathroom.
    return !terraces.some((rows) => spansContain(rows, cx, cy)) && !onMark(piece);
  });

  const frame = frameAroundFloor(flatFloor, bounds, unitsPerMetre);
  const margin = unitsPerMetre * 1.5;
  const hitsFrame = (r: { x: number; y: number; w: number; h: number }) =>
    frame === bounds ||
    (r.x < frame.x + frame.width + margin &&
      r.x + r.w > frame.x - margin &&
      r.y < frame.y + frame.height + margin &&
      r.y + r.h > frame.y - margin);
  const framedPart =
    frame === bounds
      ? undefined
      : {
          floorM2:
            spanArea(
              flatFloor
                .filter((row) => row.y >= frame.y && row.y < frame.y + frame.height)
                .map((row) => ({
                  ...row,
                  spans: row.spans
                    .map(([a, b]): [number, number] => [Math.max(a, frame.x), Math.min(b, frame.x + frame.width)])
                    .filter(([a, b]) => b > a),
                })),
            ) /
            (unitsPerMetre * unitsPerMetre),
          drawingWidthM: bounds.width / unitsPerMetre,
          drawingHeightM: bounds.height / unitsPerMetre,
        };

  const built: BuiltFlat = {
    unitsPerMetre,
    bodies,
    floor: flatFloor,
    // Settled again at the end: pieces join after the furniture pass.
    furniture: kitchenSquaresAreAppliances(washersFromDrums(pansFromCisterns(furnitureOffTerrace.map(freeBathIsAnIsland).map(cabinetWithBowlIsASink).map(chairAtTheTableEnd), geometry.segments, unitsPerMetre), geometry.curves, unitsPerMetre), unitsPerMetre),
    openings,
    terraces,
    // Never the flat's own terraces, whatever ran into them.
    foreign: notTheFlats.map((rows) => withoutRows(rows, terraces)),
    printedTerraceCount: printed.length,
    bounds,
    floorM2,
    areaError,
    ...(framedPart ? { framedPart } : {}),
    svg: renderFlatSvg(
      frame === bounds ? bodies : bodies.filter((body) => hitsFrame(bodyRect(body))),
      frame,
      {
        unitsPerMetre,
        floor: flatFloor,
        furniture:
          frame === bounds
            ? furnishings
            : furnishings.filter((piece) => hitsFrame({ x: piece.x, y: piece.y, w: piece.w, h: piece.h })),
        openings: frame === bounds ? openings : openings.filter((opening) => hitsFrame(openingRect(opening))),
        terraces,
        width: options?.width,
        padding: frame === bounds ? undefined : unitsPerMetre * 1.2,
      },
    ),
  };

  // The scale the area locked, checked against the rooms' printed sizes: the
  // area is the footprint's, and a footprint that takes in more than the flat
  // — 21's and 22's did — locks the flat small, every room 6 to 8 % short of
  // its printed size. The sheets are drawn at 1:50; their rooms say so.
  if (!options?.scaledByRooms && options?.programme) {
    const ratio = roomDimensionScale(bodies, options.programme, { width: geometry.pageWidth, height: geometry.pageHeight }, unitsPerMetre);
    // The area's lock lands a few per cent either side of the sheet's scale
    // as the footprint changes — 17 and 18 moved between 55.5 and 58 as their
    // walls were measured better — while the sheet is drawn at one. Within 4 %
    // of an architect's scale, and with the rooms' sizes agreeing to 3 % there
    // (or silent), the scale is that one.
    const drawn = snapToDrawingScale(unitsPerMetre, 0.04);
    const agrees = ratio == null || Math.abs((ratio * drawn) / unitsPerMetre - 1) <= 0.03;
    const offScale = drawn !== unitsPerMetre && Math.abs(drawn / unitsPerMetre - 1) > 0.005 && agrees;
    if ((ratio != null && Math.abs(ratio - 1) > 0.02) || offScale) {
      const corrected = offScale ? drawn : snapToDrawingScale(unitsPerMetre / (ratio ?? 1));
      log.info("scale corrected by the rooms' printed sizes", { from: unitsPerMetre, to: Number(corrected.toFixed(2)), ratio: ratio == null ? null : Number(ratio.toFixed(3)) });
      const rescaled = await buildFlatFromGeometry(geometry, 0, {
        ...options,
        unitsPerMetreHint: corrected,
        unitsPerMetreHintSpread: 0.015,
        scaledByRooms: true,
      });
      if (rescaled) {
        const m2 = rescaled.floorM2;
        return { ...rescaled, areaError: printedAreaM2 > 0 ? m2 / printedAreaM2 - 1 : rescaled.areaError };
      }
    }
  }
  return built;
}

/**
 * The flat, read out of a sales sheet: its vectors, and the area figures it
 * prints as text. Every caller that has a PDF still goes through here.
 */
export async function buildFlatFromPdf(
  pdf: Buffer | Uint8Array,
  printedAreaM2: number,
  options?: {
    search?: ScaleSearch;
    width?: number;
    extent?: { x: number; y: number; width: number; height: number };
    unitsPerMetreHint?: number;
    /** The sheet's own programme, for what the shapes cannot say. */
    programme?: FloorplanLayout;
  },
): Promise<BuiltFlat | null> {
  const geometry = await extractFloorplanVectorGeometry(pdf);
  if (!geometry) return null;
  const flat = await buildFlatFromGeometry(geometry, printedAreaM2, {
    ...options,
    printedAreas: await extractPrintedAreas(pdf),
  });
  if (!flat) return null;
  const colouredDoorways = await readColouredDoorways(
    pdf,
    { width: geometry.pageWidth },
    flat.unitsPerMetre,
  );
  const shelterMarks = await extractShelterMarks(pdf);
  return {
    ...flat,
    ...(colouredDoorways.length > 0 ? { colouredDoorways } : {}),
    ...(shelterMarks.length > 0 ? { shelterMarks } : {}),
  };
}
