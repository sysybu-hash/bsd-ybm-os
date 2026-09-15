import { applyCadMeasuresToBookletRooms, floorPlateTerraceM2, floorPlateTerraces, knownSheetTruth } from "@/lib/projects/floorplan-booklet-rooms";
import { type ConfidenceReport } from "@/lib/projects/floorplan-confidence";
import {
  inferRoomKind,
  isBuildingCoreRoom,
  parseFloorplanLayout,
  roomsForInteriorViz,
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { roomsForLayout, type SegmentedRoom } from "@/lib/projects/floorplan-segment";

export type FloorplanVizRoute =
  | { kind: "cad"; targetAreaM2: number }
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
}): FloorplanVizRoute {
  if (input.photo) return { kind: "raster", reason: "photo" };
  if (input.mimeType !== "application/pdf") return { kind: "raster", reason: "not-pdf" };
  if (!input.extent) return { kind: "raster", reason: "no-extent" };
  const area = input.grossAreaM2;
  if (area == null || !(area > 0)) return { kind: "raster", reason: "no-area" };
  return { kind: "cad", targetAreaM2: area };
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
  let sum = 0;
  for (const fig of figures) {
    if (fig.value < 2.5 || fig.value > 16) continue;
    if (grossM2 != null && Math.abs(fig.value - grossM2) < 0.05) continue;
    sum += fig.value;
  }
  return sum;
}

export function cadTargetAreaM2(
  layout: FloorplanLayout,
  extra?: { printedTerraceM2?: number; unitHint?: string },
): number | undefined {
  const known = knownSheetTruth(
    layout.unitLabel || layout.title || extra?.unitHint,
    layout.grossAreaM2,
  );
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
export function cadMassingSafeToPhotograph(cad: FloorplanLayout): boolean {
  const known = knownSheetTruth(cad.unitLabel || cad.title, cad.grossAreaM2);
  if (!known) return true;
  const kindOf = (room: FloorplanLayout["rooms"][number]) =>
    room.kind ?? inferRoomKind(room.name);
  const rooms = cad.rooms.filter((room) => !isBuildingCoreRoom(room));
  const count = (kind: "bedroom" | "bathroom" | "balcony") =>
    rooms.filter((room) => kindOf(room) === kind).length;
  if (count("bedroom") !== known.bedrooms) return false;
  if (count("bathroom") !== known.bathrooms) return false;
  if (count("balcony") !== floorPlateTerraces(known).length) return false;
  return true;
}

/** Rooms measured off the CAD, keeping the sheet's printed title and area. */
export function layoutFromCadRooms(
  extracted: FloorplanLayout,
  rooms: SegmentedRoom[],
  unitsPerMetre: number,
  extra?: { sourceName?: string },
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
    rooms: roomsForLayout(rooms, unitsPerMetre),
    dimensionStrings: extracted.dimensionStrings,
    notes: extracted.notes,
    islandStoolCount: extracted.islandStoolCount,
    internalStairs: extracted.internalStairs,
    requiresReview: false,
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
  const extractedHabitable = roomsForInteriorViz(extracted);
  const cadHabitable = roomsForInteriorViz(cad);
  const program =
    extractedHabitable.length > cadHabitable.length ? extracted.rooms : cad.rooms;
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
export function rasterFallbackConfidence(): ConfidenceReport {
  return {
    tier: "raster",
    hard: [],
    soft: ["התוכנית אינה CAD וקטורי — הגיאומטריה משוערת ואינה מדודה"],
    ok: true,
  };
}
