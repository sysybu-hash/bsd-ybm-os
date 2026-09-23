import { createLogger } from "@/lib/logger";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { QUALITY } from "@/lib/projects/scene3d/quality";
import { chromiumSceneRenderer } from "@/lib/projects/scene3d/renderer";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";

/**
 * The measured flat, photographed by the renderer rather than imagined.
 *
 * Everything here is free and certain: the geometry was measured from the
 * sheet, the scene is built from it by rule, and a renderer draws it. There is
 * no sampling, so there is nothing to audit and nothing to retry — and the
 * cost of the frame is a second of CPU rather than a dollar of image model.
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

export async function renderMeasuredStill(
  options: Render3dStillOptions,
): Promise<FloorplanVizImage | null> {
  try {
    const style = sceneStyleFor(options.styleKit);
    const scene = buildSceneFromPayload(options.geometry, { rules: style.rules });
    if (scene.meshes.length === 0) return null;

    const frame = await chromiumSceneRenderer({
      scene,
      style,
      view: { id: "overview" },
      quality: QUALITY.booklet,
      deadlineMs: options.deadlineMs,
    });
    if (!frame) return null;

    const stamped = await stampFloorplanStill(
      { base64: frame.base64, mimeType: frame.mimeType },
      { unitLabel: options.unitTitle, areaM2: options.areaM2 },
    );
    log.info("measured still rendered", {
      ms: frame.ms,
      quality: frame.quality,
      px: `${frame.widthPx}x${frame.heightPx}`,
      meshes: scene.meshes.length,
    });
    return {
      viewId: "overview",
      labelHe: "כל התוכנית — מבט על (מדוד)",
      mimeType: stamped.mimeType,
      base64: stamped.base64,
      origin: "render3d",
      selected: options.selected ?? false,
    };
  } catch (err: unknown) {
    log.warn("measured still failed; the run keeps the still it has", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
