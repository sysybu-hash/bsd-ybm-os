import { buildSchematicPlateJpeg } from "@/lib/projects/floorplan-schematic-plate";
import { buildTintedPlanJpeg } from "@/lib/projects/floorplan-tinted-plan";
import { readMarkedOpenings } from "@/lib/projects/floorplan-marked-openings";
import type { PlacedOpening } from "@/lib/projects/floorplan-wall-openings";
import { scaleFromDoorways } from "@/lib/projects/floorplan-colour-openings";
import { readSheetScale } from "@/lib/projects/floorplan-sheet-scale";
import {
  extractFloorplanLayout,
  extractFloorplanRoomsWithVision,
  type FloorplanLayoutExtractResult,
} from "@/lib/projects/floorplan-layout-extract";
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
  measuredPlateMatchesSheet,
  rasterFallbackConfidence,
} from "@/lib/projects/floorplan-viz-route";
import { printedTruthFromSheet, type PrintedUnitTruth } from "@/lib/projects/floorplan-booklet-rooms";
import {
  emptyFloorplanSpend,
  runWithFloorplanSpend,
  type FloorplanSpend,
} from "@/lib/projects/floorplan-spend";
import { rasterNeedsOutlineConfirm, rasterToSegments } from "@/lib/projects/floorplan-raster";
import {
  floorplanGeometryPayload,
  type FloorplanGeometryPayload,
} from "@/lib/projects/floorplan-geometry-payload";
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
import {
  extractFloorplanVectorGeometry,
  extractPdfPageRaster,
  extractPrintedAreas,
} from "@/lib/projects/floorplan-vector";

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

/** Leaves the route about a minute to extract, persist and respond. */
const FLOORPLAN_VIZ_BUDGET_MS = 225_000;

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
  /** The measured flat, when the geometric path built one — what the 3D view draws. */
  geometry?: FloorplanGeometryPayload;
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

type VisualizeFloorplanOptions = {
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
};

/**
 * The whole run inside one spend scope, so the sheet reads, the scale reads
 * and the audits record their tokens alongside the image calls. Only the
 * image generation used to run inside it, and a run's bill came back missing
 * every call made before the first picture.
 */
export async function visualizeFloorplanFromDrawing(
  base64: string,
  mimeType: string,
  options?: VisualizeFloorplanOptions,
): Promise<FloorplanVizRunResult> {
  const spend = { ...emptyFloorplanSpend(), usageComplete: true };
  return runWithFloorplanSpend(spend, () => visualizeWithSpend(base64, mimeType, spend, options));
}

async function visualizeWithSpend(
  base64: string,
  mimeType: string,
  spend: FloorplanSpend,
  options?: VisualizeFloorplanOptions,
): Promise<FloorplanVizRunResult> {
  // The route is capped at 300 seconds and a timeout returns nothing — not
  // even the frames already paid for. Everything downstream stops re-rolling
  // once this passes and ships the best frame it has.
  const deadlineMs = Date.now() + FLOORPLAN_VIZ_BUDGET_MS;
  const styleKit = resolveFloorplanVizStyle(options?.styleId, options?.customKit);
  const scope = options?.scope ?? "full";
  const forceDrawing = options?.planKind === "sales-sheet";
  const prepared = await prepareFloorplanSource(base64, mimeType, { forceDrawing });
  const photo = options?.planKind === "photo" ? true : prepared.sourceKind === "photo";

  const reused =
    options?.existingLayout && typeof options.existingLayout === "object"
      ? parseFloorplanLayout(options.existingLayout as Record<string, unknown>)
      : null;
  let extracted: FloorplanLayoutExtractResult = reused
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

  // The lean extract reads printed text only. A sheet whose room names are
  // drawn as outlines has no such text, and then neither route has anything to
  // work with: the raster route briefs the image model with no rooms at all
  // and invents the programme, and the measured route has no labels to put on
  // the rooms it measures — which is why a measured run listed "חלל 1" for a
  // flat whose sheet says ממ"ד. One vision read of the drawn labels, before
  // the routes part, serves both.
  if (!reused && extracted.layout.rooms.length === 0) {
    log.info("lean extract found no rooms; reading them with one vision engine");
    try {
      const seen = await extractFloorplanRoomsWithVision(prepared.base64, prepared.mimeType, {
        photo,
        spend,
      });
      if (seen) {
        extracted = {
          ...seen,
          enginesUsed: [...new Set([...extracted.enginesUsed, ...seen.enginesUsed])],
          ocrEngines: extracted.ocrEngines,
        };
      }
    } catch (err: unknown) {
      log.warn("vision room read failed; painting from the lean extract", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }


  const cadResult = await tryCadOverview({
    prepared,
    photo,
    extractedLayout: extracted.layout,
    styleKit,
    sourceName: options?.sourceName,
    spend,
    deadlineMs,
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
        const photoreal = await runWithFloorplanSpend(cadResult.spend, () =>
          generateFloorplanVisuals(layout, prepared.base64, prepared.mimeType, {
            photo,
            styleKit,
            scope: "overview",
            existingImages: options?.existingImages,
            unitTitle: titleFromFloorplanLayout(layout, options?.sourceName ?? ""),
            skipInteriors: true,
            geometryLock: lockCad ? cadResult.geometry : undefined,
            truth: cadResult.truth,
            deadlineMs,
          }),
        );
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
        const companions = await runWithFloorplanSpend(cadResult.spend, () =>
          generateGeometryCompanions({
            rooms: cadResult.rooms,
            styleKit,
            plan: { base64: prepared.base64, mimeType: prepared.mimeType },
            geometry: cadResult.geometry,
            layout,
            haredi: styleKit.audience === "haredi",
            maxViews: scope === "rooms" ? 6 : 3,
            existingImages: options?.existingImages,
          }),
        );
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
      geometry: cadResult.measured,
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
  // No measured geometry for this sheet — so the reference is the sheet
  // itself, cropped to the flat and washed room by room. A reconstruction of a
  // drawing is an approximation of it; the drawing is not.
  // The openings the measured pass read before its plate was set aside. They
  // are in page fractions of the whole sheet, which is what the tinted plate
  // is cropped from, so they land on the drawing without being remapped.
  // Only on an uncropped sheet: a crop moves the layout into its own
  // coordinates and these are still the page's.
  const markedOpenings =
    cadResult.outcome === "skip" && vizLayout === extracted.layout
      ? (cadResult.openings ?? [])
      : [];
  // The plate itself is left exactly as it is. Painting the openings onto it
  // was tried and measured: the same sheet, the same prompt, one run with
  // coloured bars over the thresholds and one without, and the run with the
  // bars came back with "2D CAD annotation copied into the render" and four
  // screens in a haredi still, while the control was clean. A mark on the
  // reference is a mark the model paints. The openings are carried as words
  // and as data instead, where nothing can copy them.
  const tinted = await buildTintedPlanJpeg(
    { base64: prepared.base64, mimeType: prepared.mimeType },
    vizLayout,
  );
  const plate = tinted ? null : await buildSchematicPlateJpeg(vizLayout);
  let images: FloorplanVizImage[] = [];
  try {
    images = await runWithFloorplanSpend(spend, () =>
      generateFloorplanVisuals(vizLayout, vizBase64, vizMime, {
        tintedPlan: tinted ?? undefined,
        schematicPlate: plate ?? undefined,
        photo,
        styleKit,
        scope,
        existingImages: options?.existingImages,
        unitTitle: titleFromFloorplanLayout(vizLayout, options?.sourceName ?? ""),
        skipInteriors: options?.skipInteriors,
        deadlineMs,
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("אין הדמיות נוספות")) throw err;
  }
  const layout = capLayoutMmdRooms(extracted.layout);
  // The measured openings, kept on the run. The extractors fill this array
  // from what a model reads, with no place on the page; these have one, which
  // is what lets a later edit be told where the sheet puts a window.
  if (markedOpenings.length > 0) {
    layout.openings = markedOpenings.map((opening) => ({
      kind: opening.kind,
      widthM: opening.widthM,
      box: opening.box,
      source: "cad" as const,
    }));
  }
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
    confidence: rasterFallbackConfidence(cadResult.outcome === "skip" ? cadResult.reason : undefined),
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
      /** The same flat as a structure, for the viewer rather than for a picture. */
      measured: FloorplanGeometryPayload;
      /** Doors and windows the sheet marks, in page fractions. */
      openings?: PlacedOpening[];
    }
  | { outcome: "skip"; reason?: string; openings?: PlacedOpening[] }
  | { outcome: "locked" };

type CadOverviewInput = {
  prepared: { base64: string; mimeType: string };
  photo: boolean;
  extractedLayout: FloorplanLayout;
  styleKit: FloorplanVizStyleKit;
  sourceName?: string;
  /** Counts the one vision call that reads the sheet's dimension chains. */
  spend?: FloorplanSpend;
  /** Epoch ms the whole run must be finished by. */
  deadlineMs?: number;
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
  // The sheet's own coordinates, so a room can be given the label that sits
  // inside it — the extractor reports a label as a fraction of the page.
  const pageSize = { width: geometry.pageWidth, height: geometry.pageHeight };
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
          page: pageSize,
        }),
      ),
      geometry: { mimeType: "image/jpeg", base64: rendered.geometry.toString("base64") },
      confidence: { ...rendered.confidence, tier: "cad" },
      truth,
      spend: rendered.spend,
      rooms: rendered.rooms,
      measured: floorplanGeometryPayload(rendered.flat, rendered.rooms),
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
    return { outcome: "skip", reason: `לא PDF (${input.prepared.mimeType})` };
  }
  const pdfBytes = Buffer.from(input.prepared.base64, "base64");
  const sheetGeometry = await extractFloorplanVectorGeometry(pdfBytes).catch(() => null);
  const pageSize = sheetGeometry
    ? { width: sheetGeometry.pageWidth, height: sheetGeometry.pageHeight }
    : undefined;
  let extent: { x: number; y: number; width: number; height: number } | null = null;
  try {
    extent = await flatExtentFromSheet(pdfBytes);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("vector extent failed; falling back to raster", { error: message });
    return { outcome: "skip", reason: `קריאת הקירות נכשלה (${message.slice(0, 80)})` };
  }
  const printed = await extractPrintedAreas(pdfBytes);
  const truth = printedTruthFromSheet(input.extractedLayout, { areas: printed });
  const grossAreaM2 = cadTargetAreaM2(input.extractedLayout, {
    printedTerraceM2: printedTerraceM2(printed, input.extractedLayout.grossAreaM2),
    truth,
  });
  // No printed area — a plotted sheet, or one whose text is drawn as outlines.
  // Two ways to the scale, and they answer to different weaknesses: the
  // dimension chains have to be read by a model, which reads them a little
  // differently each time (31.1 on one run, 24.5 on the next, against the
  // sheet's own 29.2), while the doorways are measured — an internal door is
  // 80 cm, and eleven of them make a ruler. The chains seed the search; the
  // doorways settle it, because a measured figure beats a read one.
  const needScale = Boolean(extent) && (grossAreaM2 == null || !(grossAreaM2 > 0));
  const chainReading =
    needScale && extent
      ? await readSheetScale(input.prepared.base64, input.prepared.mimeType, extent, {
          spend: input.spend,
        })
      : null;
  const geometryPage = pageSize ? { width: pageSize.width } : null;
  const doorwayReading =
    needScale && geometryPage
      ? await scaleFromDoorways(
          pdfBytes,
          geometryPage,
          [chainReading?.unitsPerMetre, 28, 42, 56].filter((n): n is number => typeof n === "number"),
        )
      : null;
  const unitsPerMetreHint = doorwayReading?.unitsPerMetre ?? chainReading?.unitsPerMetre;
  if (needScale) {
    log.info("scale for a sheet that prints no area", {
      chains: chainReading?.unitsPerMetre,
      doorways: doorwayReading?.unitsPerMetre,
      doorwayCount: doorwayReading?.doorways,
      chosen: unitsPerMetreHint,
    });
  }
  const route = decideFloorplanVizRoute({
    mimeType: input.prepared.mimeType,
    photo: input.photo,
    extent,
    grossAreaM2,
    unitsPerMetreHint,
  });
  if (route.kind !== "cad" || !extent) {
    const reason = route.kind === "raster" ? route.reason : "no-extent";
    log.info("floorplan viz using raster path", {
      reason,
      extent: Boolean(extent),
      grossAreaM2,
      scaleHint: unitsPerMetreHint,
    });
    return {
      outcome: "skip",
      reason:
        reason === "no-extent"
          ? "לא נמצאו קירות וקטוריים בגיליון"
          : reason === "no-area"
            ? "אין שטח מודפס, וגם קווי המידות לא נקראו"
            : `ניתוב: ${reason}`,
    };
  }
  // Read before the plate is judged, and carried out whichever way that goes:
  // a plate too rough to photograph was still measured on a sheet whose doors
  // and windows are marked, and the raster route has nothing else to tell it
  // which openings are glazed.
  const openings =
    pageSize && unitsPerMetreHint
      ? await readMarkedOpenings(pdfBytes, {
          page: pageSize,
          unitsPerMetre: unitsPerMetreHint,
          extent,
        })
      : [];

  try {
    const rendered = await renderFlatFromPdf(pdfBytes, {
      targetAreaM2: route.targetAreaM2,
      unitsPerMetreHint: route.unitsPerMetreHint,
      extent,
      styleKit: input.styleKit,
      haredi: input.styleKit.audience === "haredi",
      label: input.sourceName,
      deadlineMs: input.deadlineMs,
      programme: input.extractedLayout,
      // One counter for the whole run. The measured branch used to report only
      // what the render cost, so a run that read the sheet, read its scale and
      // then measured it came back claiming no extraction calls at all.
      spend: input.spend,
    });
    if (!rendered) {
      log.warn("cad render refused scale lock; not inventing a layout", {
        targetAreaM2: route.targetAreaM2,
      });
      // A sheet that never printed an area was not promised a measured render:
      // it took this route on a scale read off its dimension chains, and if
      // that does not lock there is a raster path behind it. A sheet that did
      // print one is a different matter — refusing is the honest answer there.
      return route.unitsPerMetreHint
        ? { outcome: "skip", reason: `קנה המידה (${route.unitsPerMetreHint.toFixed(1)} יח׳/מ׳) לא ננעל על הקירות` }
        : { outcome: "locked" };
    }
    // A sheet that printed its area earned the measured route; one that took it
    // on a scale nobody printed has to earn it twice. 28-8-23-2 came back
    // measured and wrong — a plate with no bedroom anywhere in it — while the
    // raster route, handed a schematic of the rooms the extractor placed, got
    // the flat's own programme right. Measured has to mean measured well.
    // Measured has to mean measured well, and "it passed its own checks" is a
    // low bar: the audit grades what is drawn, not what is missing. A plate
    // that cannot show the bedrooms, the kitchen and the living room the sheet
    // reads is not a measurement of this flat.
    if (route.unitsPerMetreHint && !measuredPlateMatchesSheet(input.extractedLayout, rendered.rooms)) {
      log.info("measured plate does not reproduce the sheet's programme; using the drawing itself", {
        measured: rendered.rooms.map((room) => room.kind),
      });
      return {
        outcome: "skip",
        reason: "הלוח המדוד לא משחזר את תוכנית החללים שבגיליון",
        openings,
      };
    }
    if (route.unitsPerMetreHint && rendered.confidence.ok === false) {
      log.info("measured plate failed its own checks on an inferred scale; using the raster route", {
        hard: rendered.confidence.hard,
      });
      return {
        outcome: "skip",
        reason: `הלוח המדוד לא עבר בדיקה עצמית (${rendered.confidence.hard.join(", ") || "ללא פירוט"})`,
        openings,
      };
    }
    return {
      outcome: "ok",
      layout: capLayoutMmdRooms(
        layoutFromCadRooms(input.extractedLayout, rendered.rooms, rendered.flat.unitsPerMetre, {
          sourceName: input.sourceName,
          page: pageSize,
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
      measured: floorplanGeometryPayload(rendered.flat, rendered.rooms),
      openings,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("cad render threw; not inventing a layout", { error: message });
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
