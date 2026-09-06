import { extractFloorplanLayout } from "@/lib/projects/floorplan-layout-extract";
import { generateFloorplanVisuals } from "@/lib/projects/floorplan-viz-generate";
import { titleFromFloorplanLayout } from "@/lib/projects/floorplan-viz-ids";
import { cropFloorplanRasterToUnit, isPortraitFloorplanRaster, prepareFloorplanSource } from "@/lib/projects/floorplan-photo-prep";
import { remapLayoutToCrop, unitCropFromLayout } from "@/lib/projects/floorplan-locator";
import { resolveFloorplanVizStyle, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import {
  capLayoutMmdRooms,
  parseFloorplanLayout,
  type FloorplanLayout,
  type FloorplanVizImage,
  type OcrGrounding,
} from "@/lib/projects/floorplan-layout";
import { mergeFloorplanVizImages, parseFloorplanVizScope, type FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

export type { FloorplanVizScope };
export { mergeFloorplanVizImages, parseFloorplanVizScope };

export type FloorplanVizResult = {
  runId?: string;
  title?: string;
  layout: FloorplanLayout;
  images: FloorplanVizImage[];
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
  grounding: Pick<OcrGrounding, "dimensionStrings" | "roomNameHits">;
  styleKit: FloorplanVizStyleKit;
  scope: FloorplanVizScope;
  /** Absent on the client payload — the API strips the plan bytes before responding. */
  planBase64?: string;
  planMimeType?: string;
  photo?: boolean;
};

/** What a generation run actually produces: the plan bytes are always present here. */
export type FloorplanVizRunResult = FloorplanVizResult & {
  planBase64: string;
  planMimeType: string;
  photo: boolean;
};

export async function visualizeFloorplanFromDrawing(
  base64: string,
  mimeType: string,
  options?: {
    styleId?: string;
    customKit?: unknown;
    planKind?: "sales-sheet" | "photo" | "auto";
    scope?: FloorplanVizScope;
    existingLayout?: unknown;
    existingImages?: Array<{ viewId: string; roomName?: string }>;
    /** The uploaded sheet's name, used for the caption when OCR reads no unit. */
    sourceName?: string;
  },
): Promise<FloorplanVizRunResult> {
  const styleKit = resolveFloorplanVizStyle(options?.styleId, options?.customKit);
  const scope = options?.scope ?? "full";
  const forceDrawing = options?.planKind === "sales-sheet";
  const prepared = await prepareFloorplanSource(base64, mimeType, { forceDrawing });
  const photo = options?.planKind === "photo" ? true : prepared.sourceKind === "photo";

  const reused =
    options?.existingLayout && typeof options.existingLayout === "object"
      ? parseFloorplanLayout(options.existingLayout as Record<string, unknown>)
      : null;
  const extracted = reused
    ? {
        layout: reused,
        grounding: {
          engine: "reuse",
          text: "",
          dimensionStrings: reused.dimensionStrings,
          roomNameHits: reused.rooms.map((r) => r.name),
        } satisfies OcrGrounding,
        enginesUsed: [] as string[],
        ocrEngines: [] as string[],
        visionEngines: [] as string[],
      }
    : await extractFloorplanLayout(prepared.base64, prepared.mimeType, { photo });

  const portraitSheet = await isPortraitFloorplanRaster(prepared.base64, prepared.mimeType);
  const crop = unitCropFromLayout(extracted.layout, { portraitSheet });
  const cropped = await cropFloorplanRasterToUnit(prepared.base64, prepared.mimeType, crop);
  const vizBase64 = cropped?.base64 ?? prepared.base64;
  const vizMime = cropped?.mimeType ?? prepared.mimeType;
  const vizLayout =
    cropped && (crop.w < 0.97 || crop.h < 0.97 || crop.x > 0.02 || crop.y > 0.02)
      ? remapLayoutToCrop(extracted.layout, crop)
      : extracted.layout;
  const images = await generateFloorplanVisuals(vizLayout, vizBase64, vizMime, {
    photo,
    styleKit,
    scope,
    existingImages: options?.existingImages,
    unitTitle: titleFromFloorplanLayout(vizLayout, options?.sourceName ?? ""),
  });
  return {
    layout: capLayoutMmdRooms(extracted.layout),
    images,
    enginesUsed: [...extracted.enginesUsed, "gemini-image"],
    ocrEngines: extracted.ocrEngines,
    visionEngines: extracted.visionEngines,
    grounding: {
      dimensionStrings: extracted.grounding.dimensionStrings,
      roomNameHits: extracted.grounding.roomNameHits,
    },
    styleKit,
    scope,
    planBase64: vizBase64,
    planMimeType: vizMime,
    photo,
  };
}
