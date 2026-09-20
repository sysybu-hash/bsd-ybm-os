import { readColouredDoorways } from "@/lib/projects/floorplan-colour-openings";
import { classifyOpenings, type OpeningKind } from "@/lib/projects/floorplan-wall-openings";
import {
  clearFurnitureFromEmptyRooms,
  deskFurnitureInOffices,
} from "@/lib/projects/floorplan-programme-furniture";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  findFurniture,
  findRoundedFurniture,
  looksLikeKitchenIsland,
  seatsAroundTable,
  stoolsAlongRun,
  type FurniturePiece,
} from "@/lib/projects/floorplan-furniture";
import { renderFlatSvg } from "@/lib/projects/floorplan-render3d";
import { lockScale, lockScaleToHint, type ScaleSearch } from "@/lib/projects/floorplan-scale";
import {
  bodyRect,
  sameWall,
  clipBodiesToBounds,
  closeCorners,
  dropUnhatchedBodies,
  findDoorSwings,
  findTerraces,
  findTerracesOnFloor,
  spansContain,
  trimToHatchAlong,
  findOpenings,
  wallBodiesForSheet,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import {
  extractFloorplanVectorGeometry,
  type FloorplanVectorGeometry,
  type PlacedNumber,
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
  openings: Array<Opening & { kind: OpeningKind }>;
  /** Paved outdoor areas, each verified against the area the sheet prints in it. */
  terraces: SpanRow[][];
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
};

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
  },
): Promise<BuiltFlat | null> {
  const sheet = wallBoundingBox(geometry);
  if (!sheet) return null;

  const flatExtent = options?.extent ?? sheet;
  const hint = options?.unitsPerMetreHint;
  const lock =
    printedAreaM2 > 0
      ? lockScale(geometry.segments, flatExtent, printedAreaM2, options?.search, geometry.curves)
      : hint
        ? lockScaleToHint(geometry.segments, flatExtent, hint, geometry.curves)
        : null;
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
  // The hatch tests are evidence tests: they trim a wall to the hatch that
  // proves it and drop a body with none, because on a sales sheet a dimension
  // chain picks up a hatch cluster wherever it crosses a partition and reads
  // as a wall. A plotted pair carries its own evidence — two heavy lines a
  // wall apart — and has no hatch anywhere along it, so putting it through the
  // same tests deleted every internal partition on 28-8-23-2 and left the flat
  // as one open floor.
  const kept = closeCorners(lock.bodies.filter(touchesFlat), unitsPerMetre * 0.9);
  const hatchKept = dropUnhatchedBodies(
    trimToHatchAlong(
      kept.filter((body) => body.source !== "plotted"),
      geometry.segments,
      { unitsPerMetre },
    ),
    geometry.segments,
    unitsPerMetre,
  );
  // A plotted pair joins the set unless a hatched band that SURVIVED covers the
  // same wall. Deduping before the hatch tests is what lost the partitions:
  // the band was preferred, and then dropped for having no hatch under it.
  const plotted = kept
    .filter((body) => body.source === "plotted")
    .filter((body) => !hatchKept.some((band) => sameWall(band, body)));
  const bodies = [...hatchKept, ...plotted];
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

  const found = findFurniture(geometry.segments, unitsPerMetre, {
    curves: geometry.curves,
  }).filter((piece) => {
    if (!inside(piece.x + piece.w / 2, piece.y + piece.h / 2)) return false;
    return !bodies.some((body) => centreInsideBody(piece, body));
  });

  // Seating, placed on the anchors rather than hunted for. A chair and a stool
  // are drawn as rounded shapes whose corner arcs are the only part that reaches
  // the curve list, and every attempt to detect them either missed the lot or
  // swept in the sanitary ware with them. The table and the island are found
  // reliably, and the plan puts chairs round one and stools along the other, so
  // there is nothing left to infer. It matters because the middle of the living
  // room was coming out as bare floor, and bare floor is what the model fills in
  // for itself — that is where the invented armchairs in the entrance came from.
  const clear = (piece: FurniturePiece) => {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    if (!inside(cx, cy)) return false;
    // Not standing in a wall, and not on top of something already there.
    if (bodies.some((body) => centreInsideBody(piece, body))) return false;
    return !found.some(
      (other) =>
        cx > other.x &&
        cx < other.x + other.w &&
        cy > other.y &&
        cy < other.y + other.h,
    );
  };

  // The rounded furniture that does survive detection: the living room's own
  // armchairs and sofa. Only the pieces whose corner arcs come through as
  // separate knots make it, which on this sheet is the seating suite and a
  // handful of the sanitary ware — and the sanitary ware is already found, so
  // requiring clear ground drops it. What is left is the suite, and it is the
  // last bare patch in the middle of the flat.
  const rounded = findRoundedFurniture(geometry.curves, unitsPerMetre);

  const table = found.find((piece) => piece.kind === "table");
  const chairs = table
    ? seatsAroundTable(table, unitsPerMetre).filter(clear)
    : [];

  // A free-standing run: deep enough to be a counter, long enough to seat at,
  // and with floor on both of its long sides — a run against a wall is a
  // worktop and has no stools.
  const island = found.find((piece) => {
    if (!looksLikeKitchenIsland(piece)) return false;
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
    const fittings = found.filter(
      (piece) =>
        piece.kind === "hob" ||
        piece.kind === "sink" ||
        piece.kind === "counter" ||
        (piece.kind === "storage" && piece !== island),
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
    stools = stoolsAlongRun(island, unitsPerMetre, side).filter(clear);
  }

  const suite = rounded.filter(clear);
  const furniture = [...found, ...suite, ...chairs, ...stools];

  // The doorways, from the wall pieces before they are joined across them.
  const pieces = clipBodiesToBounds(
    wallBodiesForSheet(geometry.segments, { unitsPerMetre, keepOpenings: true }),
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
  // Which of the two found a hole is the whole door/window distinction, and
  // merging them used to throw it away. Kept now, so a still can be asked for
  // glazing where the sheet draws glazing.
  const openings = classifyOpenings(swings, gaps, flatExtent, unitsPerMetre);

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

  const fromInk = findTerraces(geometry.segments, printed, unitsPerMetre);
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
  const terraceHits =
    missing.length > 0
      ? [...fromInk, ...findTerracesOnFloor(floor, bodies, missing, unitsPerMetre)]
      : fromInk;
  const terraces = terraceHits.map((terrace) => terrace.rows);
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
  const furnitureOffTerrace = furnishings.filter((piece) => {
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    return !terraces.some((rows) => spansContain(rows, cx, cy));
  });

  return {
    unitsPerMetre,
    bodies,
    floor,
    furniture: furnitureOffTerrace,
    openings,
    terraces,
    printedTerraceCount: printed.length,
    bounds,
    floorM2: lock.floorM2,
    areaError: lock.areaError,
    svg: renderFlatSvg(bodies, bounds, {
      unitsPerMetre,
      floor,
      furniture: furnishings,
      openings,
      terraces,
      width: options?.width,
    }),
  };
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
  return colouredDoorways.length > 0 ? { ...flat, colouredDoorways } : flat;
}
