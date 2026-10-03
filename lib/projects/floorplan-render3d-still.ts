import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { frameToContent } from "@/lib/projects/building/flat-finish";
import { dollhouseView, flatToPrimitives } from "@/lib/projects/building/flat-model";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import { measurementCoverage } from "@/lib/projects/scene3d/coverage";
import { buildSceneFromPayload, sceneInputFromPayload } from "@/lib/projects/scene3d/from-payload";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";

/**
 * The measured flat, photographed by the renderer rather than imagined.
 *
 * Everything here is free and certain: the geometry was measured from the
 * sheet, the scene is built from it by rule, and a renderer draws it — the
 * building renderer the booklets use, so a flat on its own and a flat in its
 * building look the same: walls cut solid, oak and porcelain, upholstered
 * furniture, doors open as drawn. There is no sampling, so there is nothing
 * to audit, and the cost of the frame is seconds of CPU.
 *
 * It never throws. A run that cannot draw this still has the one it already
 * has; the point of the deterministic path is to add certainty, not risk.
 */

const log = createLogger("floorplan-render3d-still");

export type Render3dStillOptions = {
  geometry: FloorplanGeometryPayload;
  styleKit: FloorplanVizStyleKit;
  unitTitle?: string;
  areaM2?: number;
  /** Epoch ms after which the render may not start. */
  deadlineMs?: number;
  /** True when this still is the one the booklet should use. */
  selected?: boolean;
};

export type MeasuredStill = FloorplanVizImage & {
  /** The frame before its caption bar: what a finish is painted over and checked against. */
  plain: Buffer;
};

/** Milliseconds a frame is given, the browser's launch included. */
const FRAME_MS = 120_000;

export async function renderMeasuredStill(options: Render3dStillOptions): Promise<MeasuredStill | null> {
  try {
    const style = sceneStyleFor(options.styleKit);
    // The renderer draws what was measured and nothing else. Where the
    // measurement is short of the flat — walls never found, doorways never
    // sealed — the still would be correct and useless, so none is offered and
    // the run keeps the one it has.
    const input = sceneInputFromPayload(options.geometry);
    const coverage = measurementCoverage(input);
    if (coverage.shortfall) {
      log.info("measured still not offered; the measurement is short of the flat", {
        shortfall: coverage.shortfall,
        named: coverage.named,
        labelled: coverage.labelled,
        openings: coverage.openings,
      });
      return null;
    }
    const scene = buildSceneFromPayload(options.geometry, { rules: style.rules });
    if (scene.meshes.length === 0) return null;
    if (options.deadlineMs && Date.now() + FRAME_MS > options.deadlineMs) {
      log.warn("out of time for the measured still");
      return null;
    }

    const started = Date.now();
    const view = dollhouseView(scene);
    // Traced on a machine that has the tracer (a development dependency);
    // rasterised on the platform.
    const samples = Number(env.FLOORPLAN_TRACE_SAMPLES ?? 0);
    const [frame] = await renderBuildingFrames(
      [{ ...view.payload, model: flatToPrimitives(scene, { cutAboveM: view.cutAboveM }), ...(samples > 0 ? { pathTrace: { samples } } : {}) }],
      { outputWidthPx: 2000, timeoutMs: FRAME_MS },
    );
    if (!frame) return null;
    const plain = await frameToContent(frame, "auto");
    const stamped = await stampFloorplanStill(
      { base64: plain.toString("base64"), mimeType: "image/jpeg" },
      { unitLabel: options.unitTitle, areaM2: options.areaM2 },
    );
    log.info("measured still rendered", { ms: Date.now() - started, meshes: scene.meshes.length, traced: samples > 0 });
    return {
      viewId: "overview",
      labelHe: "כל התוכנית — מבט על (מדוד)",
      mimeType: stamped.mimeType,
      base64: stamped.base64,
      origin: "render3d",
      selected: options.selected ?? false,
      plain,
    };
  } catch (err: unknown) {
    log.warn("measured still failed; the run keeps the still it has", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
