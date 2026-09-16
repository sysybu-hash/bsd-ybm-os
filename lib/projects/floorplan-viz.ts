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
  renderFlatFromGeometry,
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
import { printedTruthFromSheet, type PrintedUnitTruth } from "@/lib/projects/floorplan-booklet-rooms";
import { emptyFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";
import { rasterNeedsOutlineConfirm, rasterToSegments } from "@/lib/projects/floorplan-raster";
import { geometryFromDxf } from "@/lib/projects/floorplan-dxf";
import { dwgToDxf } from "@/lib/projects/floorplan-dwg-convert";
import { DWG_MIME, isCadFloorplanMime } from "@/lib/projects/photo-prep/mime";
import {
  companionImage,
  geometryViewPrompt,
  listGeometryCompanionViews,
} from "@/lib/projects/floorplan-geometry-views";
import { generateAuditedImage } from "@/lib/projects/viz-generate/attempts";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
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
  /** Model calls this run paid for, so "how much is a booklet" stops being a guess. */
  spend?: FloorplanSpend;
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

/**
 * Interior and isometric views built from the geometry, not from a vision pass.
 *
 * Each job's brief is the room the walls already cut — its measured area and
 * the furniture blocks standing in it — so the model has nothing left to invent.
 * Every view is a paid image call, which is why the count is capped by scope.
 */
async function generateGeometryCompanions(input: {
  rooms: SegmentedRoom[];
  styleKit: FloorplanVizStyleKit;
  plan: { base64: string; mimeType: string };
  geometry: { mimeType: string; base64: string };
  layout: FloorplanLayout;
  haredi: boolean;
  maxViews: number;
  existingImages?: Array<{ viewId: string; roomName?: string }>;
}): Promise<FloorplanVizImage[]> {
  const jobs = listGeometryCompanionViews(input.rooms, { maxViews: input.maxViews });
  const have = new Set(
    (input.existingImages ?? []).map((img) => `${img.viewId}::${img.roomName ?? ""}`),
  );
  const out: FloorplanVizImage[] = [];
  for (const job of jobs) {
    if (have.has(`${job.viewId}::${job.roomName ?? ""}`)) continue;
    try {
      const still = await generateAuditedImage(
        {
          viewId: job.viewId,
          labelHe: job.labelHe,
          roomName: job.roomName,
          prompt: geometryViewPrompt(input.styleKit, job),
        },
        [input.plan, input.geometry],
        undefined,
        { layout: input.layout, plan: input.plan, haredi: input.haredi },
      );
      out.push(companionImage(job, still));
    } catch (err: unknown) {
      log.warn("companion view failed", {
        view: job.labelHe,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

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
  const spend = emptyFloorplanSpend();
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
        spend,
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
      const lockCad = cadMassingSafeToPhotograph(cadResult.layout, cadResult.truth);
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
          truth: cadResult.truth,
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

    // Interiors, measured rather than invented: the brief for each one is the
    // room the walls cut and the furniture already placed in it. A failure here
    // never sinks the run — the overview is what the client is buying.
    if (scope === "full" || scope === "rooms") {
      try {
        const companions = await generateGeometryCompanions({
          rooms: cadResult.rooms,
          styleKit,
          plan: { base64: prepared.base64, mimeType: prepared.mimeType },
          geometry: cadResult.geometry,
          layout,
          haredi: styleKit.audience === "haredi",
          maxViews: scope === "rooms" ? 6 : 3,
          existingImages: options?.existingImages,
        });
        if (companions.length > 0) {
          images = [...images, ...companions];
          if (!enginesUsed.includes("gemini-image")) enginesUsed.push("gemini-image");
        }
      } catch (err: unknown) {
        log.warn("geometry companions failed; shipping the overview alone", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
      spend: cadResult.spend,
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
    spend,
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
      /** The program the sheet prints, when the extract and the text layer carry it. */
      truth?: PrintedUnitTruth;
      spend: FloorplanSpend;
      /** Rooms measured off the CAD, for the interiors a companion view shows. */
      rooms: SegmentedRoom[];
    }
  | { outcome: "skip" }
  | { outcome: "locked" };

type CadOverviewInput = {
  prepared: { base64: string; mimeType: string };
  photo: boolean;
  extractedLayout: FloorplanLayout;
  styleKit: FloorplanVizStyleKit;
  sourceName?: string;
};

/**
 * A drawing the client exported from CAD, rather than a sales sheet.
 *
 * There is no page to rasterise and no printed area figure to verify terraces
 * against — the layers carry what a PDF forces the pipeline to infer. Scale
 * still comes from the gross area the extract read, so a drawing with no area
 * anywhere on it falls back to the raster path rather than inventing one.
 */
async function tryCadDrawingOverview(input: CadOverviewInput): Promise<CadOverviewAttempt> {
  const bytes = Buffer.from(input.prepared.base64, "base64");
  let text: string | null = null;
  if (input.prepared.mimeType === DWG_MIME) {
    text = await dwgToDxf(bytes);
  } else {
    text = bytes.toString("utf8");
  }
  if (!text) return { outcome: "skip" };

  const geometry = await geometryFromDxf(text);
  if (!geometry) {
    log.info("cad drawing carried no readable geometry");
    return { outcome: "skip" };
  }
  const truth = printedTruthFromSheet(input.extractedLayout, { areas: [] });
  const targetAreaM2 = cadTargetAreaM2(input.extractedLayout, { truth });
  if (targetAreaM2 == null) {
    log.info("cad drawing has no printed area to lock scale against");
    return { outcome: "skip" };
  }
  try {
    const rendered = await renderFlatFromGeometry(geometry, {
      targetAreaM2,
      styleKit: input.styleKit,
      haredi: input.styleKit.audience === "haredi",
      label: input.sourceName,
    });
    if (!rendered) return { outcome: "locked" };
    return {
      outcome: "ok",
      layout: capLayoutMmdRooms(
        layoutFromCadRooms(input.extractedLayout, rendered.rooms, rendered.flat.unitsPerMetre, {
          sourceName: input.sourceName,
        }),
      ),
      geometry: { mimeType: "image/jpeg", base64: rendered.geometry.toString("base64") },
      confidence: { ...rendered.confidence, tier: "cad" },
      truth,
      spend: rendered.spend,
      rooms: rendered.rooms,
    };
  } catch (err: unknown) {
    log.warn("cad drawing render threw; not inventing a layout", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: "locked" };
  }
}

async function tryCadOverview(input: CadOverviewInput): Promise<CadOverviewAttempt> {
  if (isCadFloorplanMime(input.prepared.mimeType)) {
    return tryCadDrawingOverview(input);
  }
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
  const truth = printedTruthFromSheet(input.extractedLayout, { areas: printed });
  const route = decideFloorplanVizRoute({
    mimeType: input.prepared.mimeType,
    photo: input.photo,
    extent,
    grossAreaM2: cadTargetAreaM2(input.extractedLayout, {
      printedTerraceM2: printedTerraceM2(printed, input.extractedLayout.grossAreaM2),
      truth,
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
      truth,
      spend: rendered.spend,
      rooms: rendered.rooms,
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
