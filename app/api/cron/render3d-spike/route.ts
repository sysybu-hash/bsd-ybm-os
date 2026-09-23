import type { NextRequest } from "next/server";

import { withCronGuard } from "@/lib/cron-guard";
import { createLogger } from "@/lib/logger";
import { FLOORPLAN_VIZ_PRESETS, isFloorplanVizPresetId } from "@/lib/projects/floorplan-viz-styles";
import { buildScene, type SceneInput } from "@/lib/projects/scene3d/build-scene";
import { QUALITY } from "@/lib/projects/scene3d/quality";
import { chromiumSceneRenderer } from "@/lib/projects/scene3d/renderer";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";

/**
 * Does the deterministic renderer work on the platform?
 *
 * Not a WebGL triangle any more — that question was answered. This runs the
 * production path end to end inside a Vercel function: a measured flat, the
 * scene built from it, the style's own finishes, the headless Chromium, the
 * downsample. What comes back is what a booklet would carry.
 *
 * The flat is built here rather than read from a fixture, so nothing but code
 * is shipped to the function. Guarded by the cron secret because it has to be
 * callable with curl and by nobody else.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("render3d-spike");

/** A small measured flat: two rooms, a door between them, a window outside. */
function sampleFlat(): SceneInput {
  const upm = 100;
  const rows = (x0: number, x1: number, y0: number, y1: number) => [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
  return {
    unitsPerMetre: upm,
    bounds: { x: 0, y: 0, width: 800, height: 520 },
    bodies: [
      { orientation: "h", centre: 5, thickness: 10, from: 0, to: 800 },
      { orientation: "h", centre: 515, thickness: 10, from: 0, to: 800 },
      { orientation: "v", centre: 5, thickness: 10, from: 0, to: 520 },
      { orientation: "v", centre: 795, thickness: 10, from: 0, to: 520 },
      { orientation: "v", centre: 380, thickness: 8, from: 0, to: 520 },
    ],
    openings: [
      { orientation: "v", centre: 380, thickness: 8, from: 200, to: 290, kind: "door" },
      { orientation: "h", centre: 5, thickness: 10, from: 120, to: 300, kind: "window" },
      { orientation: "h", centre: 515, thickness: 10, from: 500, to: 700, kind: "window" },
    ],
    floorRects: [...rows(10, 376, 10, 510), ...rows(384, 790, 10, 510)],
    terraceRects: [],
    furniture: [
      { x: 60, y: 60, w: 160, h: 200, kind: "bed" },
      { x: 250, y: 60, w: 90, h: 200, kind: "storage" },
      { x: 430, y: 60, w: 300, h: 65, kind: "counter" },
      { x: 520, y: 62, w: 60, h: 60, kind: "hob" },
      { x: 640, y: 62, w: 60, h: 60, kind: "sink" },
      { x: 470, y: 250, w: 180, h: 110, kind: "table" },
      { x: 440, y: 260, w: 45, h: 45, kind: "seat" },
      { x: 660, y: 260, w: 45, h: 45, kind: "seat" },
    ],
    rooms: [
      { name: "ח.שינה", kind: "bedroom", areaM2: 18.3, rects: rows(10, 376, 10, 510) },
      { name: "ח.מגורים", kind: "living", areaM2: 20.3, rects: rows(384, 790, 10, 510) },
    ],
  };
}

export async function GET(req: NextRequest) {
  return withCronGuard(req, "render3d-spike", { type: "interval", value: 1, unit: "day" }, async () => {
    const styleParam = req.nextUrl.searchParams.get("style") ?? "haredi_classic";
    const styleId = isFloorplanVizPresetId(styleParam) ? styleParam : "haredi_classic";
    const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS[styleId]);
    const wantsImage = req.nextUrl.searchParams.get("image") === "1";

    const builtAt = Date.now();
    const scene = buildScene(sampleFlat(), { rules: style.rules });
    const buildMs = Date.now() - builtAt;

    const frame = await chromiumSceneRenderer({
      scene,
      style,
      view: { id: "overview" },
      quality: QUALITY.booklet,
    });

    const result = {
      style: styleId,
      buildMs,
      meshes: scene.meshes.length,
      lights: scene.lights.length,
      rendered: frame != null,
      quality: frame?.quality ?? null,
      renderMs: frame?.ms ?? null,
      px: frame ? `${frame.widthPx}x${frame.heightPx}` : null,
      bytes: frame ? Math.round((frame.base64.length * 3) / 4) : 0,
      ...(wantsImage && frame ? { image: `data:${frame.mimeType};base64,${frame.base64}` } : {}),
    };
    log.info("render3d spike", { ...result, image: undefined });
    return result;
  });
}
