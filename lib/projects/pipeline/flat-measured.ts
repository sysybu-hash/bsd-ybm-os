/**
 * One flat out of a DXF, measured and photographed with the free engine: the
 * reading scripts/render-unit.mts does, without a client's hand-made
 * overrides or a premium look. The geometry is the sheet's (unitByDoors), the
 * scene is built from it (buildScene), and every picture is a raster frame.
 * No paid call is made anywhere on this path.
 */
import sharp from "sharp";

import { profileFor, withLayerMap, type CadKind } from "@/lib/projects/building/cad-layers";
import { dollhouseView, flatToPrimitives, type FlatView } from "@/lib/projects/building/flat-model";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import { apartmentMarks } from "@/lib/projects/dxf-apartment";
import { readDxfDrawing, type DxfDrawing } from "@/lib/projects/dxf-drawing";
import { isUnitFailure, unitByDoors } from "@/lib/projects/dxf-unit-by-doors";
import { unitSceneInput } from "@/lib/projects/dxf-unit-scene";
import { renderDxfPageJpeg, unitGeometryFromDxf } from "@/lib/projects/floorplan-dxf";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { unitInteriorViews } from "@/lib/projects/pipeline/flat-views";
import { buildScene } from "@/lib/projects/scene3d/build-scene";
import { WALL_HEIGHT_M } from "@/lib/projects/scene3d/standards";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/** Metres per drawing unit, by the unit the client named. */
export const UNITS_M = { mm: 0.001, cm: 0.01, m: 1 } as const;
export type DrawingUnit = keyof typeof UNITS_M;

/** A slab's thickness under the storey height: the ceiling stands this much lower than the next floor. */
export const SLAB_M = 0.25;

export type MeasuredFlat = {
  unit: number;
  scene: FlatScene;
  /** The dollhouse first, then the rooms worth standing in. */
  views: FlatView[];
  wallHeightM: number;
  /** The drawing's header gave no unit and the client's answer was used. */
  unitsFromAnswer: boolean;
  assumptions: string[];
};

export type FlatFailure = {
  reason: "unreadable" | "no-units" | "unit-needed" | "no-mark" | "not-closed";
  /** Hebrew, for the client. */
  message: string;
  /** The flat numbers the drawing marks, where the number was the trouble. */
  units?: number[];
};

export function isFlatFailure(r: MeasuredFlat | FlatFailure): r is FlatFailure {
  return "reason" in r && "message" in r;
}

export function measureFlatFromDxf(input: {
  bytes: Uint8Array;
  /** The flat's number on a whole-floor drawing; may be left out when the drawing marks one flat only. */
  unit?: number;
  /** Layers the client confirmed (the rescan), by layer name. */
  layerMap?: Record<string, CadKind>;
  /** The drawing's unit when its header gives none. */
  units?: DrawingUnit;
  /** Floor to floor, metres: the ceiling stands a slab lower. */
  storeyHeightM?: number;
  /** "none" builds the shell alone. */
  furniture?: "none" | "basic" | "full";
  /** Interior views too, beside the dollhouse. */
  interiors?: boolean;
  widthPx?: number;
}): MeasuredFlat | FlatFailure {
  const assumptions: string[] = [];
  const read = readDxfDrawing(input.bytes);
  if (!read) return { reason: "unreadable", message: "קובץ ה־DXF לא נקרא" };
  let drawing: DxfDrawing = read;
  if (!drawing.headerUnitsM) {
    if (!input.units) return { reason: "no-units", message: "הקובץ לא כותב את יחידות השרטוט, ולא נבחרו יחידות בשאלון" };
    drawing = { ...drawing, headerUnitsM: UNITS_M[input.units] };
    assumptions.push(`יחידות השרטוט: ${input.units}, כפי שנבחר בשאלון (הקובץ לא כותב אותן)`);
  }
  const marks = [...new Set(apartmentMarks(drawing).map((m) => m.number))].sort((a, b) => a - b);
  let unit = input.unit;
  if (unit == null) {
    if (marks.length !== 1) {
      return marks.length
        ? { reason: "unit-needed", message: `הקובץ הוא קומה עם ${marks.length} דירות; צריך לבחור מספר דירה`, units: marks }
        : { reason: "no-mark", message: "לא נמצא בקובץ סימון מספר דירה", units: [] };
    }
    unit = marks[0]!;
    assumptions.push(`דירה ${unit}: הדירה היחידה שהקובץ מסמן`);
  }
  const confirmed = input.layerMap && Object.keys(input.layerMap).length ? input.layerMap : null;
  const base = profileFor(drawing.layers.keys());
  const profile = confirmed ? withLayerMap(base, confirmed) : base;
  if (confirmed) assumptions.push(`${Object.keys(confirmed).length} שכבות נקראו לפי מה שאושר בסריקה הנוספת`);
  const plan = unitByDoors(drawing, unit, { profile });
  if (isUnitFailure(plan)) {
    const message = plan.reason === "no-mark" ? `דירה ${unit} לא מסומנת בקובץ` : `דירה ${unit} לא נסגרה מהשרטוט (${plan.reason})`;
    return { reason: plan.reason === "no-mark" ? "no-mark" : "not-closed", message, units: marks };
  }

  const sceneInput = unitSceneInput(plan);
  if (input.furniture === "none") {
    sceneInput.furniture = [];
    assumptions.push("בלי ריהוט, כפי שנבחר בשאלון");
  }
  const preset = FLOORPLAN_VIZ_PRESETS.haredi_classic;
  const style = sceneStyleFor(preset);
  const wallHeightM = input.storeyHeightM ? Math.max(2.3, Math.min(6, input.storeyHeightM - SLAB_M)) : WALL_HEIGHT_M;
  if (!input.storeyHeightM) assumptions.push(`גובה תקרה ${WALL_HEIGHT_M.toFixed(2)} מ' (תקני), לא נמסר גובה קומה`);
  else assumptions.push(`גובה תקרה ${wallHeightM.toFixed(2)} מ': גובה הקומה ${input.storeyHeightM} מ' פחות תקרה של ${SLAB_M} מ'`);
  const scene = buildScene(sceneInput, { rules: style.rules, wallHeightM });

  const width = input.widthPx ?? 1600;
  const top = dollhouseView(scene, width);
  // A margin of background round the flat, as the client asked of the top view (04/11/2026).
  top.payload.camera.position = { ...top.payload.camera.position, y: top.payload.camera.position.y * 1.2 };
  const height = Math.round((width * 10) / 16);
  const interiors: FlatView[] =
    input.interiors === false
      ? []
      : unitInteriorViews(scene).map((v) => ({
          id: v.id,
          title: v.title,
          ceiling: true,
          payload: {
            width,
            height,
            exposure: 0.7,
            ao: true,
            camera: { position: v.position, target: v.target, fovDeg: v.fovDeg, interior: true, studio: true },
            sun: { azimuthDeg: 200, elevationDeg: 40 },
          },
        }));
  return { unit, scene, views: [top, ...interiors], wallHeightM, unitsFromAnswer: !read.headerUnitsM, assumptions };
}

/** The flat's own part of the sheet, as the client's sheet draws it. */
export async function flatSheetPage(bytes: Uint8Array, unit: number): Promise<Buffer | null> {
  const read = unitGeometryFromDxf(bytes, unit);
  return "reason" in read ? null : renderDxfPageJpeg(read.geometry);
}

/** Each view as a raster frame, graded as render-unit grades its free frames. A view that does not draw is left out. */
export async function renderFlatPictures(
  flat: Pick<MeasuredFlat, "scene" | "views" | "wallHeightM">,
  onPicture?: (id: string, done: number, total: number) => Promise<void> | void,
): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  let done = 0;
  for (const view of flat.views) {
    const model = flatToPrimitives(flat.scene, { cutAboveM: view.cutAboveM, ceiling: view.ceiling });
    if (view.ceiling) {
      const e = flat.scene.extent;
      model.primitives.push({
        type: "box",
        centre: { x: e.x + e.width / 2, y: flat.wallHeightM + 0.09, z: e.z + e.depth / 2 },
        size: { x: e.width + 2, y: 0.1, z: e.depth + 2 },
        material: "ceiling",
        tag: "ceiling:slab",
      } as (typeof model.primitives)[number]);
    }
    const [frame] = await renderBuildingFrames([{ ...view.payload, model }], { outputWidthPx: view.payload.width, timeoutMs: 180_000 });
    done++;
    if (frame) {
      const graded = await sharp(frame).gamma(2.2, 1.5).modulate({ saturation: 0.9 }).linear([1.12, 1.1, 1.14], [-8, -6, -4]).jpeg({ quality: 92 }).toBuffer();
      out.set(view.id, graded);
    }
    await onPicture?.(view.id, done, flat.views.length);
  }
  return out;
}
