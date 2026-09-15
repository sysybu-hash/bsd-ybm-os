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
import { type ConfidenceReport } from "@/lib/projects/floorplan-confidence";
import { createLogger } from "@/lib/logger";
import { isAnthropicConfigured } from "@/lib/ai-providers";
import {
  flatExtentFromSheet,
  renderFlatFromPdf,
} from "@/lib/projects/floorplan-render-flat";
import {
  cadHeroImages,
  cadImagesForBooklet,
  cadMassingSafeToPhotograph,
  cadTargetAreaM2,
  decideFloorplanVizRoute,
  geometryImageFromCad,
  layoutForCadBooklet,
  layoutFromCadRooms,
  mergeCadPhotorealImages,
  overviewImageFromCad,
  printedTerraceM2,
  rasterFallbackConfidence,
} from "@/lib/projects/floorplan-viz-route";
import { rasterNeedsOutlineConfirm, rasterToSegments } from "@/lib/projects/floorplan-raster";
import { extractPdfPageRaster, extractPrintedAreas } from "@/lib/projects/floorplan-vector";

export {
  cadHeroImages,
  cadImagesForBooklet,
  cadMassingSafeToPhotograph,
  cadTargetAreaM2,
  decideFloorplanVizRoute,
  geometryImageFromCad,
  layoutForCadBooklet,
  layoutFromCadRooms,
  mergeCadPhotorealImages,
  overviewImageFromCad,
  printedTerraceM2,
  rasterFallbackConfidence,
};
export type { FloorplanVizRoute } from "@/lib/projects/floorplan-viz-route";

export type { FloorplanVizScope };
export { mergeFloorplanVizImages, parseFloorplanVizScope };

const log = createLogger("floorplan-viz");

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
  confidence?: ConfidenceReport;
  /** Absent on the client payload — the API strips the plan bytes before responding. */
  planBase64?: string;
  planMimeType?: string;
  sourceFileName?: string;
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
    /** Companion views besides the living overview. Each one multiplies cost. */
    maxViews?: number;
    /** Booklet / sales-sheet run: skip invented room interiors. */
    skipInteriors?: boolean;
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
    : await extractFloorplanLayout(prepared.base64, prepared.mimeType, {
        photo,
        lean: !photo && prepared.mimeType === "application/pdf",
      });

  const cadResult = await tryCadOverview({
    prepared,
    photo,
    extractedLayout: extracted.layout,
    styleKit,
    sourceName: options?.sourceName,
  });
  if (cadResult.outcome === "ok") {
    const layout = layoutForCadBooklet(extracted.layout, cadResult.layout);
    const alreadyHasOverview = (options?.existingImages ?? []).some(
      (img) => img.viewId === "overview" && !img.roomName,
    );
    let images: FloorplanVizImage[] = [];
    const enginesUsed = [...extracted.enginesUsed, "geometry-cad"];
    if (!alreadyHasOverview) {
      const lockCad = cadMassingSafeToPhotograph(cadResult.layout);
      if (!lockCad) {
        log.info("cad massing omitted from photoreal; segmented program does not match the sheet");
      }
      try {
        const photoreal = await generateFloorplanVisuals(layout, prepared.base64, prepared.mimeType, {
          photo,
          styleKit,
          scope: "overview",
          existingImages: options?.existingImages,
          unitTitle: titleFromFloorplanLayout(layout, options?.sourceName ?? ""),
          skipInteriors: true,
          geometryLock: lockCad ? cadResult.geometry : undefined,
        });
        images = mergeCadPhotorealImages({ photoreal, geometry: cadResult.geometry });
        const hasLivingOverview = images.some(
          (img) => img.viewId === "overview" && !img.roomName && img.base64 !== cadResult.geometry.base64,
        );
        if (!hasLivingOverview) {
          throw new Error("יצירת ההדמיה נכשלה — לא התקבלה הדמיה פוטוריאליסטית");
        }
        enginesUsed.push("gemini-image");
        if (isAnthropicConfigured()) {
          enginesUsed.push("claude-audit");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Never ship the blocky CAD plate as the brochure hero — that is a
        // geometry companion, not a sales still. Prefer an honest failure over
        // billing the client for coloured rectangles.
        log.warn("photoreal overview failed; not shipping CAD as hero", { error: message });
        throw new Error(
          message.includes("יצירת ההדמיה") ||
            message.includes("ביקורת") ||
            message.includes("בדיקת דיוק") ||
            message.includes("צניעות")
            ? message
            : `יצירת ההדמיה הפוטוריאליסטית נכשלה — לא נשלח CAD במקומה. ${message}`,
        );
      }
    } else {
      images = cadImagesForBooklet(cadResult.geometry);
    }
    return {
      layout,
      images,
      enginesUsed,
      ocrEngines: extracted.ocrEngines,
      visionEngines: extracted.visionEngines,
      grounding: {
        dimensionStrings: extracted.grounding.dimensionStrings,
        roomNameHits: extracted.grounding.roomNameHits,
      },
      styleKit,
      scope,
      confidence: cadResult.confidence,
      planBase64: prepared.base64,
      planMimeType: prepared.mimeType,
      photo,
    };
  }
  if (cadResult.outcome === "locked") {
    throw new Error(
      "לא ניתן לנעול את גיאומטריית התוכנית — לא הופקה הדמיה מומצאת",
    );
  }

  const portraitSheet = await isPortraitFloorplanRaster(prepared.base64, prepared.mimeType);
  const crop = unitCropFromLayout(extracted.layout, { portraitSheet });
  const cropped = await cropFloorplanRasterToUnit(prepared.base64, prepared.mimeType, crop);
  const vizBase64 = cropped?.base64 ?? prepared.base64;
  const vizMime = cropped?.mimeType ?? prepared.mimeType;
  const vizLayout =
    cropped && (crop.w < 0.97 || crop.h < 0.97 || crop.x > 0.02 || crop.y > 0.02)
      ? remapLayoutToCrop(extracted.layout, crop)
      : extracted.layout;
  let images: FloorplanVizImage[] = [];
  try {
    images = await generateFloorplanVisuals(vizLayout, vizBase64, vizMime, {
      photo,
      styleKit,
      scope,
      existingImages: options?.existingImages,
      unitTitle: titleFromFloorplanLayout(vizLayout, options?.sourceName ?? ""),
      skipInteriors: options?.skipInteriors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("אין הדמיות נוספות")) throw err;
  }
  const layout = capLayoutMmdRooms(extracted.layout);
  const rasterReview = await outlineConfirmIfNeeded(prepared.base64, prepared.mimeType);
  if (rasterReview) {
    layout.requiresReview = true;
    layout.notes = [...layout.notes, rasterReview];
  }
  return {
    layout,
    images,
    enginesUsed: [
      ...extracted.enginesUsed,
      "gemini-image",
      ...(isAnthropicConfigured() ? ["claude-audit"] : []),
    ],
    ocrEngines: extracted.ocrEngines,
    visionEngines: extracted.visionEngines,
    grounding: {
      dimensionStrings: extracted.grounding.dimensionStrings,
      roomNameHits: extracted.grounding.roomNameHits,
    },
    styleKit,
    scope,
    confidence: rasterFallbackConfidence(),
    planBase64: prepared.mimeType === "application/pdf" ? prepared.base64 : vizBase64,
    planMimeType: prepared.mimeType === "application/pdf" ? prepared.mimeType : vizMime,
    photo,
  };
}

type CadOverviewAttempt =
  | {
      outcome: "ok";
      layout: FloorplanLayout;
      geometry: { mimeType: "image/jpeg"; base64: string };
      confidence: ConfidenceReport;
    }
  | { outcome: "skip" }
  | { outcome: "locked" };

async function tryCadOverview(input: {
  prepared: { base64: string; mimeType: string };
  photo: boolean;
  extractedLayout: FloorplanLayout;
  styleKit: FloorplanVizStyleKit;
  sourceName?: string;
}): Promise<CadOverviewAttempt> {
  if (input.prepared.mimeType !== "application/pdf") {
    return { outcome: "skip" };
  }
  const pdfBytes = Buffer.from(input.prepared.base64, "base64");
  let extent: { x: number; y: number; width: number; height: number } | null = null;
  try {
    extent = await flatExtentFromSheet(pdfBytes);
  } catch (err: unknown) {
    log.warn("vector extent failed; falling back to raster", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: "skip" };
  }
  const printed = await extractPrintedAreas(pdfBytes);
  const route = decideFloorplanVizRoute({
    mimeType: input.prepared.mimeType,
    photo: input.photo,
    extent,
    grossAreaM2: cadTargetAreaM2(input.extractedLayout, {
      printedTerraceM2: printedTerraceM2(printed, input.extractedLayout.grossAreaM2),
      unitHint: input.sourceName,
    }),
  });
  if (route.kind !== "cad" || !extent) {
    log.info("floorplan viz using raster path", { reason: route.kind === "raster" ? route.reason : "no-extent" });
    return { outcome: "skip" };
  }
  try {
    const rendered = await renderFlatFromPdf(pdfBytes, {
      targetAreaM2: route.targetAreaM2,
      extent,
      styleKit: input.styleKit,
      haredi: input.styleKit.audience === "haredi",
      label: input.sourceName,
    });
    if (!rendered) {
      log.warn("cad render refused scale lock; not inventing a layout", {
        targetAreaM2: route.targetAreaM2,
      });
      return { outcome: "locked" };
    }
    return {
      outcome: "ok",
      layout: capLayoutMmdRooms(
        layoutFromCadRooms(input.extractedLayout, rendered.rooms, rendered.flat.unitsPerMetre, {
          sourceName: input.sourceName,
        }),
      ),
      geometry: {
        mimeType: "image/jpeg",
        base64: rendered.geometry.toString("base64"),
      },
      confidence: { ...rendered.confidence, tier: "cad" },
    };
  } catch (err: unknown) {
    log.warn("cad render threw; not inventing a layout", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: "locked" };
  }
}

/**
 * A scan whose hatch is too thin to trust: ask the operator to confirm
 * the outline rather than silently selling a guessed geometry.
 */
async function outlineConfirmIfNeeded(
  base64: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const bytes = Buffer.from(base64, "base64");
    const rasterB64 =
      mimeType === "application/pdf" ? await extractPdfPageRaster(bytes) : base64;
    if (!rasterB64) return null;
    const result = await rasterToSegments(Buffer.from(rasterB64, "base64"));
    if (!rasterNeedsOutlineConfirm(result)) return null;
    return "קו המתאר משוער מסריקה — יש לאשר לפני הפקת חוברת";
  } catch (err: unknown) {
    log.warn("raster outline check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
