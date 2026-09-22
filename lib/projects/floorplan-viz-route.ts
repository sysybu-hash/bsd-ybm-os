import {
  applyCadMeasuresToBookletRooms,
  floorPlateTerraceM2,
  floorPlateTerraces,
  terraceFigures,
  type PrintedUnitTruth,
} from "@/lib/projects/floorplan-booklet-rooms";
import { type ConfidenceReport } from "@/lib/projects/floorplan-confidence";
import {
  inferRoomKind,
  isBuildingCoreRoom,
  parseFloorplanLayout,
  roomsForInteriorViz,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { roomsForLayout, type SegmentedRoom } from "@/lib/projects/floorplan-segment";
import type { SpanRow } from "@/lib/projects/floorplan-solid";

export type FloorplanVizRoute =
  | { kind: "cad"; targetAreaM2: number; unitsPerMetreHint?: number }
  | { kind: "raster"; reason: "not-pdf" | "photo" | "no-extent" | "no-area" };

/**
 * Which path the upload takes. A scan has no vector extent — that is the
 * routing condition, not a separate detector. Missing printed area also
 * cannot lock scale, so it must not crash: it falls back to the raster path.
 */
export function decideFloorplanVizRoute(input: {
  mimeType: string;
  photo: boolean;
  extent: { x: number; y: number; width: number; height: number } | null;
  grossAreaM2?: number;
  /**
   * Units per metre read off the sheet's dimension chains.
   *
   * The printed gross is how scale was always locked, and a sheet that prints
   * none — or prints it as outlines, with no text layer to read — could not
   * take the measured route at all, however cleanly it draws its walls. The
   * chains say the same thing in another form.
   */
  unitsPerMetreHint?: number;
}): FloorplanVizRoute {
  if (input.photo) return { kind: "raster", reason: "photo" };
  if (input.mimeType !== "application/pdf") return { kind: "raster", reason: "not-pdf" };
  if (!input.extent) return { kind: "raster", reason: "no-extent" };
  const area = input.grossAreaM2;
  if (area != null && area > 0) return { kind: "cad", targetAreaM2: area };
  const hint = input.unitsPerMetreHint;
  if (hint != null && hint > 0) return { kind: "cad", targetAreaM2: 0, unitsPerMetreHint: hint };
  return { kind: "raster", reason: "no-area" };
}

/**
 * Scale target: printed gross plus same-level terraces the extractor read.
 * Indoor-only lock shrinks the plate and the furniture misses the walls.
 */
/**
 * Terrace figures printed on the sheet (not the indoor gross). Used when the
 * lean extract has no balcony rooms — without them scale locks indoor-only
 * and the furniture misses the walls.
 */
export function printedTerraceM2(
  figures: Array<{ value: number }>,
  grossM2?: number,
): number {
  return terraceFigures(figures, grossM2).reduce((sum, fig) => sum + fig.value, 0);
}

export function cadTargetAreaM2(
  layout: FloorplanLayout,
  extra?: { printedTerraceM2?: number; truth?: PrintedUnitTruth },
): number | undefined {
  const known = extra?.truth;
  const gross = layout.grossAreaM2 ?? known?.grossM2;
  if (gross == null || !(gross > 0)) return undefined;
  if (known) {
    return known.grossM2 + floorPlateTerraceM2(known);
  }
  let terraces = 0;
  for (const room of layout.rooms) {
    if (room.kind === "balcony" && room.areaM2 != null && room.areaM2 > 0) {
      terraces += room.areaM2;
    }
  }
  if (terraces === 0 && extra?.printedTerraceM2 && extra.printedTerraceM2 > 0) {
    terraces = extra.printedTerraceM2;
  }
  return gross + terraces;
}

/**
 * Photographing CAD massing that dropped a bath or grew a roof stair as a
 * terrace makes the still copy those mistakes. Only lock photoreal to CAD
 * when the segmented program matches the printed sheet.
 */
export function cadMassingSafeToPhotograph(
  cad: FloorplanLayout,
  truth?: PrintedUnitTruth,
  measured?: { terraces?: number },
): boolean {
  const known = truth;
  if (!known) return true;
  const kindOf = (room: FloorplanLayout["rooms"][number]) =>
    room.kind ?? inferRoomKind(room.name);
  const rooms = cad.rooms.filter((room) => !isBuildingCoreRoom(room));
  const count = (kind: "bedroom" | "bathroom" | "balcony") =>
    rooms.filter((room) => kindOf(room) === kind).length;

  // A shelter room with a bed in it is a bedroom, and the sheet counts it as
  // one: דירה 14's fourth bedroom is its ממ"ד. Counting only "bedroom" made
  // the plate read three of four and withheld it — and the image model,
  // handed the bare sheet instead, moved the kitchen and lost a bedroom.
  const sleeping =
    count("bedroom") +
    rooms.filter((room) => kindOf(room) === "mmd" && (room.bedCount ?? 0) > 0).length;
  if (sleeping !== known.bedrooms) return false;

  // What this guards against is a plate that dropped the bath altogether, or
  // grew one. A small WC the segmenter folded into the corridor is not that:
  // its fixtures are still drawn on the plate, and the model sees them.
  const baths = count("bathroom");
  if (known.bathrooms > 0 && baths === 0) return false;
  if (baths > known.bathrooms) return false;

  // The original case: a roof stair measured as a terrace. A plate with more
  // terraces than the sheet prints copies that; one with fewer is caught
  // downstream, as a structural finding on the still.
  const terraces = count("balcony") + (measured?.terraces ?? 0);
  if (terraces > floorPlateTerraces(known).length) return false;
  return true;
}

/**
 * Measured terraces as boxes on the page.
 *
 * They are scan-line spans in drawing units, which is what the renderer wants
 * and not what a wash over the sheet wants. Page units are drawing units on
 * these sheets, so this is a bounding box and a division.
 */
export function terraceBoxesOnPage(
  terraces: SpanRow[][],
  page: { width: number; height: number },
): Array<{ x: number; y: number; w: number; h: number }> {
  if (!(page.width > 0) || !(page.height > 0)) return [];
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const rows of terraces) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const row of rows) {
      for (const [a, b] of row.spans) {
        if (a < x0) x0 = a;
        if (b > x1) x1 = b;
      }
      if (row.y < y0) y0 = row.y;
      if (row.y > y1) y1 = row.y;
    }
    if (!Number.isFinite(x0) || !(x1 > x0) || !(y1 > y0)) continue;
    out.push({
      x: x0 / page.width,
      y: y0 / page.height,
      w: (x1 - x0) / page.width,
      h: (y1 - y0) / page.height,
    });
  }
  return out;
}

/** Rooms measured off the CAD, keeping the sheet's printed title and area. */
export function layoutFromCadRooms(
  extracted: FloorplanLayout,
  rooms: SegmentedRoom[],
  unitsPerMetre: number,
  extra?: { sourceName?: string; page?: { width: number; height: number } },
): FloorplanLayout {
  const fromFile = extra?.sourceName
    ?.replace(/\.[^.]+$/u, "")
    .trim()
    .replace(/\s+/g, " ");
  const unitFromFile =
    fromFile && /דירה\s*\d+/u.test(fromFile)
      ? `דירה ${fromFile.match(/דירה\s*(\d+)/u)?.[1] ?? ""}`.trim()
      : undefined;
  return parseFloorplanLayout({
    title: extracted.title || unitFromFile,
    unitLabel: extracted.unitLabel || unitFromFile,
    floor: extracted.floor,
    ceilingHeightM: extracted.ceilingHeightM,
    north: extracted.north,
    grossAreaM2: extracted.grossAreaM2,
    rooms: withPageBbox(
      nameCadRoomsFromSheet(roomsForLayout(rooms, unitsPerMetre), rooms, extracted, extra?.page),
      rooms,
      extra?.page,
    ),
    dimensionStrings: extracted.dimensionStrings,
    notes: extracted.notes,
    islandStoolCount: extracted.islandStoolCount,
    internalStairs: extracted.internalStairs,
    requiresReview: false,
  });
}

/**
 * The sheet's own names, on the rooms the CAD measured.
 *
 * A measured room is named after what it holds — "חדר מגורים 1", "חלל 2" —
 * because that is all the geometry knows. The extractor read the sheet's own
 * labels and where each one sits, so a measured room that contains one of
 * those labels can take its name: the difference between a booklet listing
 * "חלל 1" and one listing ממ"ד.
 *
 * The two live in different coordinates — a label is a fraction of the page,
 * a room is in page units — and the first attempt at this compared them
 * through their own spans, which are not the same span: the measured rooms
 * cover most of the flat and the labels cover all of it, so every distance
 * came out too large and not one name was placed. Given the page size they
 * are the same coordinates, and the question is simply which room the label
 * sits in.
 */
/**
 * Where a measured room sits, as a fraction of the page.
 *
 * The same coordinates the extractor reports a label in, so everything
 * downstream — names, and the measurements the booklet stamps onto the
 * programme — can ask which room is which by position instead of by the order
 * two lists happen to be in.
 */
function withPageBbox(
  measured: FloorplanRoom[],
  rooms: SegmentedRoom[],
  page?: { width: number; height: number },
): FloorplanRoom[] {
  if (!page || !(page.width > 0) || !(page.height > 0)) return measured;
  return measured.map((room, index) => {
    const bounds = rooms[index]?.bounds;
    if (!bounds) return room;
    return {
      ...room,
      bbox: {
        x: bounds.x / page.width,
        y: bounds.y / page.height,
        w: bounds.width / page.width,
        h: bounds.height / page.height,
      },
    };
  });
}

function nameCadRoomsFromSheet(
  measured: FloorplanRoom[],
  rooms: SegmentedRoom[],
  extracted: FloorplanLayout,
  page?: { width: number; height: number },
): FloorplanRoom[] {
  if (!page || !(page.width > 0) || !(page.height > 0)) return measured;
  const labels = extracted.rooms
    .map((room) =>
      room.bbox
        ? {
            name: room.name,
            x: (room.bbox.x + room.bbox.w / 2) * page.width,
            y: (room.bbox.y + room.bbox.h / 2) * page.height,
          }
        : null,
    )
    .filter((label): label is { name: string; x: number; y: number } => label != null);
  if (labels.length === 0) return measured;

  const taken = new Set<number>();
  return measured.map((room, index) => {
    const bounds = rooms[index]?.bounds;
    if (!bounds) return room;
    let best: { at: number; distance: number } | undefined;
    labels.forEach((label, at) => {
      if (taken.has(at)) return;
      if (
        label.x < bounds.x ||
        label.x > bounds.x + bounds.width ||
        label.y < bounds.y ||
        label.y > bounds.y + bounds.height
      ) {
        return;
      }
      // Inside the room: the nearest to its middle wins, for the rooms the
      // segmenter merged and which therefore hold two labels.
      const distance = Math.hypot(
        label.x - (bounds.x + bounds.width / 2),
        label.y - (bounds.y + bounds.height / 2),
      );
      if (best === undefined || distance < best.distance) best = { at, distance };
    });
    if (best === undefined) return room;
    taken.add(best.at);
    return { ...room, name: labels[best.at]!.name };
  });
}

/**
 * CAD segmentation often merges rooms. Keep the printed names when the
 * extract listed more habitable rooms, but stamp usable CAD width/length
 * onto those names — do not throw the measurements away.
 */
export function layoutForCadBooklet(
  extracted: FloorplanLayout,
  cad: FloorplanLayout,
): FloorplanLayout {
  // The programme comes off the sheet; the CAD supplies geometry and measures.
  // The rule was "the sheet wins only if it read MORE habitable rooms", and a
  // tie handed the whole programme to the geometry: on 28-8-23-2 the sheet read
  // a work room with two desks, a store and a terrace, the CAD counted the same
  // number of habitable spaces without knowing what any of them were, and the
  // brief that reached the image model had no office in it at all. A room the
  // draughtsman labelled beats a room the geometry merely enclosed.
  const extractedHabitable = roomsForInteriorViz(extracted);
  const cadHabitable = roomsForInteriorViz(cad);
  const program =
    extractedHabitable.length >= cadHabitable.length ? extracted.rooms : cad.rooms;
  const rooms = applyCadMeasuresToBookletRooms(
    program,
    cad.rooms,
    cad.grossAreaM2 ?? extracted.grossAreaM2,
  );
  return parseFloorplanLayout({
    title: cad.title,
    unitLabel: cad.unitLabel,
    floor: cad.floor,
    ceilingHeightM: cad.ceilingHeightM,
    north: cad.north,
    grossAreaM2: cad.grossAreaM2,
    rooms: rooms.length > 0 ? rooms : cad.rooms,
    dimensionStrings:
      extracted.dimensionStrings.length > 0
        ? extracted.dimensionStrings
        : cad.dimensionStrings,
    notes: cad.notes,
    islandStoolCount: extracted.islandStoolCount,
    internalStairs: extracted.internalStairs,
    requiresReview: extracted.requiresReview,
  });
}

export function overviewImageFromCad(still: {
  mimeType: string;
  base64: string;
}): FloorplanVizImage {
  return {
    viewId: "overview",
    labelHe: "כל התוכנית — מבט על",
    mimeType: still.mimeType,
    base64: still.base64,
  };
}

export function geometryImageFromCad(geometry: {
  mimeType: string;
  base64: string;
}): FloorplanVizImage {
  return {
    viewId: "overview",
    roomName: "גיאומטריה",
    labelHe: "גיאומטריה מהתוכנית",
    mimeType: geometry.mimeType,
    base64: geometry.base64,
  };
}

/**
 * Pair a living still with the CAD plate as a companion. Prefer
 * mergeCadPhotorealImages when the still came from the sales sheet.
 */
export function cadHeroImages(input: {
  still: { mimeType: string; base64: string };
  geometry: { mimeType: string; base64: string };
}): FloorplanVizImage[] {
  return [overviewImageFromCad(input.still), geometryImageFromCad(input.geometry)];
}

/**
 * Geometry companion only — used when the living still comes from elsewhere.
 */
export function cadImagesForBooklet(geometry: {
  mimeType: string;
  base64: string;
}): FloorplanVizImage[] {
  return [geometryImageFromCad(geometry)];
}

/**
 * Brochure hero is the photoreal still traced from the sales sheet.
 * CAD is an internal geometry lock for generation only — never a gallery
 * still. Shipping coloured CAD blocks next to the hero made clients think
 * the product was the schematic.
 */
export function mergeCadPhotorealImages(input: {
  photoreal: FloorplanVizImage[];
  geometry: { mimeType: string; base64: string };
}): FloorplanVizImage[] {
  const overview = input.photoreal.filter((img) => img.viewId === "overview" && !img.roomName);
  const rest = input.photoreal.filter((img) => img.viewId !== "overview" || Boolean(img.roomName));
  if (overview.length === 0) {
    // Caller must not treat CAD as the sales hero; keep companion only for
    // rare recovery paths that already failed photoreal loudly upstream.
    return [...cadImagesForBooklet(input.geometry), ...rest];
  }
  void input.geometry;
  return [...overview, ...rest];
}

/** A scan / photo / failed scale lock: ship the old path, but say it is estimated. */
/**
 * Why a sheet was not measured, in the run's own report.
 *
 * "The plan is not vector CAD" was the only thing a raster run ever said, and
 * it is a guess dressed as a finding: a fully vectorial sheet lands here too,
 * when its walls cannot be read or its scale cannot be locked. Naming the step
 * that gave up is the difference between reading the answer and running the
 * pipeline again to find it.
 */
export function rasterFallbackConfidence(reason?: string): ConfidenceReport {
  return {
    tier: "raster",
    hard: [],
    soft: [
      "התוכנית אינה CAD וקטורי — הגיאומטריה משוערת ואינה מדודה",
      ...(reason ? [`מסלול מדוד לא נבחר: ${reason}`] : []),
    ],
    ok: true,
  };
}

/**
 * Whether a measured plate actually shows the flat the sheet describes.
 *
 * "The plate passed its own checks" turned out to be a low bar: a plate can
 * satisfy the audit and still be a different apartment, because the audit
 * grades what is drawn rather than what is missing. The sheet says how many
 * bedrooms this flat has, and that it has a kitchen and a living room. A
 * measured plate that cannot show those is not a measurement of this flat, and
 * the drawing itself is the better reference.
 */
export function measuredPlateMatchesSheet(
  sheet: FloorplanLayout,
  measured: SegmentedRoom[],
): boolean {
  const wanted = roomsForInteriorViz(sheet);
  if (wanted.length === 0) return true;
  const countKind = (rooms: Array<{ kind?: string; name?: string }>, kind: string) =>
    rooms.filter((room) => (room.kind ?? (room.name ? inferRoomKind(room.name) : "other")) === kind)
      .length;

  const bedroomsOnSheet = countKind(wanted, "bedroom");
  const bedroomsMeasured = countKind(measured, "bedroom");
  if (bedroomsMeasured < bedroomsOnSheet) return false;
  for (const kind of ["kitchen", "living"]) {
    if (countKind(wanted, kind) > 0 && countKind(measured, kind) === 0) return false;
  }
  return true;
}
