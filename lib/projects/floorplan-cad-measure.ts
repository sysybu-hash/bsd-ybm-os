import { bookletRoomsFromCadOrProgram } from "@/lib/projects/floorplan-booklet-rooms";
import { buildFlatFromPdf } from "@/lib/projects/floorplan-build";
import { createLogger } from "@/lib/logger";
import { inferRoomKind, parseFloorplanLayout, type FloorplanLayout, type FloorplanRoom } from "@/lib/projects/floorplan-layout";
import { flatExtentFromSheet } from "@/lib/projects/floorplan-render-flat";
import { roomsForLayout, segmentRooms } from "@/lib/projects/floorplan-segment";
import { extractFloorplanVectorGeometry } from "@/lib/projects/floorplan-vector";
import { cadTargetAreaM2 } from "@/lib/projects/floorplan-viz-route";

const log = createLogger("floorplan-cad-measure");

/**
 * Geometry-only room boxes from the sheet. No Gemini — used when a stored
 * run already dropped CAD measures and the booklet still needs them.
 */
export async function measureCadRoomsFromPdf(
  pdf: Buffer | Uint8Array,
  targetAreaM2: number,
): Promise<FloorplanRoom[] | null> {
  if (!(targetAreaM2 > 0)) return null;
  try {
    const extent = await flatExtentFromSheet(pdf);
    if (!extent) return null;
    const flat = await buildFlatFromPdf(pdf, targetAreaM2, { extent });
    if (!flat) return null;
    const sheet = await extractFloorplanVectorGeometry(pdf);
    const rooms = segmentRooms({
      bodies: flat.bodies,
      openings: flat.openings,
      floor: flat.floor,
      furniture: flat.furniture,
      terraces: flat.terraces,
      bounds: flat.bounds,
      unitsPerMetre: flat.unitsPerMetre,
      segments: sheet?.segments,
      shelterMarks: flat.shelterMarks,
    });
    return roomsForLayout(rooms, flat.unitsPerMetre);
  } catch (err: unknown) {
    log.warn("cad remasure failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Enrich first (gross + printed names), then stamp CAD boxes onto those names. */
export async function stampCadMeasuresOnLayout(
  layout: FloorplanLayout,
  pdf: Buffer | Uint8Array,
): Promise<FloorplanLayout> {
  const terraceM2 = layout.rooms
    .filter((room) => (room.kind ?? inferRoomKind(room.name)) === "balcony")
    .reduce((sum, room) => sum + (room.areaM2 ?? 0), 0);
  const target = cadTargetAreaM2(layout, { printedTerraceM2: terraceM2 }) ?? layout.grossAreaM2;
  if (target == null || !(target > 0)) return layout;
  const cadRooms = await measureCadRoomsFromPdf(pdf, target);
  if (!cadRooms || cadRooms.length === 0) return layout;
  const program = layout.rooms.length > 0 ? layout.rooms : cadRooms;
  const rooms = bookletRoomsFromCadOrProgram(program, cadRooms, layout.grossAreaM2);
  return parseFloorplanLayout({
    title: layout.title,
    unitLabel: layout.unitLabel,
    floor: layout.floor,
    ceilingHeightM: layout.ceilingHeightM,
    north: layout.north,
    grossAreaM2: layout.grossAreaM2,
    rooms,
    dimensionStrings: layout.dimensionStrings,
    notes: layout.notes,
    islandStoolCount: layout.islandStoolCount,
    internalStairs: layout.internalStairs,
    requiresReview: layout.requiresReview,
  });
}
