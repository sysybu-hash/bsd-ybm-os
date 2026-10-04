import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { applyContentFrame, contentFrame, type ContentFrame } from "@/lib/projects/building/flat-finish";
import { dollhousePixel, dollhouseView, flatToPrimitives, type FlatView } from "@/lib/projects/building/flat-model";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import { measurementCoverage } from "@/lib/projects/scene3d/coverage";
import { buildSceneFromPayload, sceneInputFromPayload } from "@/lib/projects/scene3d/from-payload";
import { flatPieces, inventoryByPlace, listedKind, openFloorSquares, planPlace, type ListedKind } from "@/lib/projects/scene3d/inventory";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import type { FlatScene } from "@/lib/projects/scene3d/types";

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
  /** The walls alone, black on white, in the same frame: where a painting's walls must be. */
  walls?: Buffer;
  /** What stands in each room, as lines — what a design must keep, and is counted against. */
  inventory?: string;
  /** Each of those pieces' box in the plain frame, pixels: where a design is checked for it. */
  pieceBoxes?: PieceBox[];
};

export type PieceBox = { kind: ListedKind | "open floor"; place: string; x: number; y: number; w: number; h: number };

/** The listed pieces' boxes in the cropped frame. */
function boxesInFrame(scene: FlatScene, view: FlatView, size: { width: number; height: number }, crop: ContentFrame): PieceBox[] {
  const out: PieceBox[] = [];
  for (const p of flatPieces(scene)) {
    const kind = listedKind(p.what);
    if (!kind || !p.box) continue;
    const a = dollhousePixel(view, size, { x: p.box.x0, y: p.box.top, z: p.box.z0 });
    const b = dollhousePixel(view, size, { x: p.box.x1, y: p.box.top, z: p.box.z1 });
    out.push({
      kind,
      place: planPlace(p.x, p.z, scene.extent),
      x: Math.round(Math.min(a.x, b.x) - crop.left + crop.padLeft),
      y: Math.round(Math.min(a.y, b.y) - crop.top + crop.padTop),
      w: Math.round(Math.abs(b.x - a.x)),
      h: Math.round(Math.abs(b.y - a.y)),
    });
  }
  // And the open floor, where a design may add decor and nothing else.
  for (const sq of openFloorSquares(scene)) {
    const a = dollhousePixel(view, size, { x: sq.x - 0.5, y: 0, z: sq.z - 0.5 });
    const b = dollhousePixel(view, size, { x: sq.x + 0.5, y: 0, z: sq.z + 0.5 });
    out.push({ kind: "open floor", place: sq.place, x: Math.round(a.x - crop.left + crop.padLeft), y: Math.round(a.y - crop.top + crop.padTop), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) });
  }
  return out;
}

/**
 * Milliseconds a frame is given, the browser's launch included. A flat's two
 * frames take about 8 s; 120 s reserved skipped the render whenever the sheet's
 * reading was slow, and the run fell back to the model drawing from the sheet.
 */
const FRAME_MS = 45_000;
const OUTPUT_WIDTH_PX = 2000;

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
    const [frame, wallsFrame] = await renderBuildingFrames(
      [
        { ...view.payload, model: flatToPrimitives(scene, { cutAboveM: view.cutAboveM }), ...(samples > 0 ? { pathTrace: { samples } } : {}) },
        { ...view.payload, ao: false, model: flatToPrimitives(scene, { cutAboveM: view.cutAboveM, wallsOnly: true }), camera: { ...view.payload.camera, mask: true } },
      ],
      { outputWidthPx: OUTPUT_WIDTH_PX, timeoutMs: FRAME_MS },
    );
    if (!frame) return null;
    const crop = await contentFrame(frame, "auto");
    const plain = await applyContentFrame(frame, crop);
    const walls = wallsFrame ? await applyContentFrame(wallsFrame, crop, { r: 255, g: 255, b: 255 }) : undefined;
    // The frame's size as the renderer returns it: scaled to OUTPUT_WIDTH_PX.
    const scale = Math.min(1, OUTPUT_WIDTH_PX / view.payload.width);
    const size = { width: Math.round(view.payload.width * scale), height: Math.round(view.payload.height * scale) };
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
      ...(walls ? { walls } : {}),
      inventory: inventoryByPlace(flatPieces(scene), scene.extent),
      pieceBoxes: boxesInFrame(scene, view, size, crop),
    };
  } catch (err: unknown) {
    log.warn("measured still failed; the run keeps the still it has", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
