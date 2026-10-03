import { readDwfStrip } from "@/lib/projects/dwf-building";
import { FloorplanCadUnreadableError } from "@/lib/projects/floorplan-dxf";
import { floorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import { capLayoutMmdRooms, type FloorplanLayout } from "@/lib/projects/floorplan-layout";
import { renderFlatFromDwf } from "@/lib/projects/floorplan-render-dwf";
import type { FloorplanSpend } from "@/lib/projects/floorplan-spend";
import type { CadOverviewAttempt } from "@/lib/projects/floorplan-viz";
import { layoutFromCadRooms } from "@/lib/projects/floorplan-viz-route";

/** Which apartment of a permit strip a run draws, and on which floor of a duplex. */
export type DwfUnitChoice = { unit: number; level?: "lower" | "upper" | null };

/**
 * A permit strip's apartment, as the CAD route's overview.
 *
 * Everything the CAD route has to settle before it can draw — the scale, which
 * lines are this flat's, what each room is — the strip's reader already knows,
 * so nothing is read off a raster and no model is asked. The result goes on
 * down the same road as a drawing's: the photoreal finish over the measured
 * massing, the measured interiors, the deterministic render beside them.
 */
export async function tryDwfOverview(input: {
  base64: string;
  choice: DwfUnitChoice | undefined;
  extractedLayout: FloorplanLayout;
  spend: FloorplanSpend;
}): Promise<CadOverviewAttempt> {
  if (!input.choice) {
    throw new FloorplanCadUnreadableError("זוהתה גרמושקת היתר — יש לבחור דירה להדמיה");
  }
  const strip = readDwfStrip(Buffer.from(input.base64, "base64"));
  if (!strip) throw new FloorplanCadUnreadableError("לא ניתן לקרוא את קובץ ה-DWF שהועלה");
  const { unit, level } = input.choice;
  const rendered = await renderFlatFromDwf(strip, unit, { level: level ?? null, spend: input.spend });
  if (!rendered) {
    throw new FloorplanCadUnreadableError(`דירה ${unit} לא נמצאה בתוכניות הקומה שבקובץ`);
  }
  const label = `דירה ${unit}`;
  return {
    outcome: "ok",
    layout: capLayoutMmdRooms(
      layoutFromCadRooms(input.extractedLayout, rendered.rooms, rendered.flat.unitsPerMetre, {
        sourceName: label,
        page: rendered.page,
      }),
    ),
    geometry: { mimeType: "image/jpeg", base64: rendered.geometry.toString("base64") },
    confidence: { ...rendered.confidence, tier: "cad" },
    sourceRaster: rendered.sheetRaster,
    spend: rendered.spend,
    rooms: rendered.rooms,
    measured: floorplanGeometryPayload(rendered.flat, rendered.rooms, { labelled: [], page: rendered.page }),
    measuredTerraces: rendered.flat.terraces.length,
  };
}
