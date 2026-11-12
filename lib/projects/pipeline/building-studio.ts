/**
 * The studio of a house or a building (plan M3): what the DWF and house pipelines measured (model.json, each storey's
 * sheet and where it stands), made into what the browser studio opens — the model, its storeys, its perspective
 * cameras, and each storey's walls laid on that storey's own sheet with their measured distance to the ink.
 *
 * The sheet stands where the reader read it: page units ÷ DWF_FLOOR_UNITS_PER_METRE + the storey's shift (floor.cm is
 * the wall mask's cell, not a scale). A registration on line ink (hatch and fills are dense, a drawn line is not) is
 * the fallback for a sheet saved without that frame or one it misses. Distances are read against all the ink, so a
 * wall face along a hatched room's edge reads as on its line. Gottlieb, 2026-11-12: all six storeys in the reader's
 * frame, median 2–3 cm.
 */
import sharp from "sharp";

import { chamferDistance, distanceAt, inkMask, type DistanceMap } from "@/lib/projects/accuracy/distance-map";
import { fitModelToSheet, projectToSheet, samplePolyline, type KindPoint, type P2, type SheetFit } from "@/lib/projects/accuracy/sheet-fit";
import { deviationStats, SHEET_BOUNDS_M } from "@/lib/projects/accuracy/stats";
import type { BookletState } from "@/lib/projects/building/dwf-booklet";
import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { STUDIO_SHEET_WIDTH, type StudioCamera, type StudioOverlay } from "@/lib/projects/pipeline/flat-studio";

export const BUILDING_STUDIO_VERSION = 1;
const STEP_M = 0.1;
const CAP_PX = 96;

export type StudioStorey = { id: string; level: number; height: number; roof: boolean; title: string };
/** `frame`: "reader" when the sheet stands where the reader read it, "registered" when it was fitted to the walls. */
export type StudioStoreySheet = { storeyId: string; key: string; width: number; height: number; overlay: StudioOverlay | null; frame?: "reader" | "registered" };

export type BuildingStudioModel = {
  name: string;
  primitives: Primitive[];
  extent: BuildingModel["extent"];
  storeys: StudioStorey[];
  cameras: StudioCamera[];
  sheets: StudioStoreySheet[];
};

export type BuildingStudioData = { version: typeof BUILDING_STUDIO_VERSION; kind: "building"; models: BuildingStudioModel[] };

/** Not drawn by a storey's plan as its cut line: furniture, the site, the yard, a person or a car. */
const NOT_PLAN = /(^|:)(inside|site|yard|street|furniture|person|car|tree|plant)(:|$)/;

/**
 * A storey's plan lines from the model: the long faces of each wall box standing on it (at least 1 m tall, not a lintel
 * or a sill), and the rings of the prisms that stand that tall on it. Where the model tags its walls by the storey's id
 * (from-dwf.ts: a wall is tagged "floor-0" itself; its lining, doors and furniture "floor-0:…"), only those are taken.
 */
export function storeyWallPoints(primitives: Primitive[], storey: Pick<StudioStorey, "level" | "height"> & { id?: string }, step = STEP_M): KindPoint[] {
  const out: KindPoint[] = [];
  const onStorey = (bottom: number, top: number) => top - bottom >= 1 && bottom >= storey.level - 0.35 && bottom <= storey.level + 0.6;
  const tagged = storey.id != null && primitives.some((p) => p.tag === storey.id);
  for (const p of primitives) {
    if (tagged ? p.tag !== storey.id : p.tag && NOT_PLAN.test(p.tag)) continue;
    if (p.type === "box") {
      if (!onStorey(p.centre.y - p.size.y / 2, p.centre.y + p.size.y / 2)) continue;
      const r = -(p.rotY ?? 0);
      const [ux, uz] = [Math.cos(r), Math.sin(r)];
      const [hx, hz] = [p.size.x / 2, p.size.z / 2];
      const c = (sx: number, sz: number): P2 => [p.centre.x + ux * hx * sx - uz * hz * sz, p.centre.z + uz * hx * sx + ux * hz * sz];
      if (p.size.x >= p.size.z) out.push(...samplePolyline([c(-1, -1), c(1, -1)], "wall", step, false), ...samplePolyline([c(-1, 1), c(1, 1)], "wall", step, false));
      else out.push(...samplePolyline([c(-1, -1), c(-1, 1)], "wall", step, false), ...samplePolyline([c(1, -1), c(1, 1)], "wall", step, false));
    } else if (p.type === "prism" && !p.side && onStorey(p.y0, p.y1)) {
      out.push(...samplePolyline(p.ring, "wall", step));
    }
  }
  return out;
}

/** Ink that is a line: dark pixels whose neighbourhood is not mostly dark (a hatch or a fill is). */
export function lineMask(on: Uint8Array, w: number, h: number, r: number, maxShare = 0.5): Uint8Array {
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += on[y * w + x]!;
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1]! + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on[y * w + x]) continue;
      const [x0, x1, y0, y1] = [Math.max(0, x - r), Math.min(w, x + r + 1), Math.max(0, y - r), Math.min(h, y + r + 1)];
      const n = I[y1 * (w + 1) + x1]! - I[y0 * (w + 1) + x1]! - I[y1 * (w + 1) + x0]! + I[y0 * (w + 1) + x0]!;
      out[y * w + x] = n / ((x1 - x0) * (y1 - y0)) <= maxShare ? 1 : 0;
    }
  }
  return out;
}

async function lineMapAt(jpeg: Buffer, width: number): Promise<DistanceMap> {
  const g = await sharp(jpeg).resize({ width }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const on = lineMask(inkMask(g.data, g.info.width, g.info.height, g.info.channels), g.info.width, g.info.height, Math.max(2, Math.round(width / 200)));
  return chamferDistance(on, g.info.width, g.info.height);
}

/** Scales tried, as divisors of "the walls span 70 % of the sheet's width": from filling the sheet to a quarter of it. */
const SCALE_TRIES = Array.from({ length: 9 }, (_, i) => 0.72 * Math.pow(1.2, i));
const SEARCH_WIDTH = 300;

/**
 * Where the storey's walls stand on its sheet, at STUDIO_SHEET_WIDTH: for each scale the best place, and of those the
 * one that agrees both ways — model points on sheet lines, and sheet lines inside the model's box next to a model
 * point. Either alone has a bias: mean distance pushes points off the sheet, points-on-lines shrinks the model into the
 * sheet's busiest corner.
 */
export async function registerStorey(pts: KindPoint[], sheetJpeg: Buffer): Promise<SheetFit> {
  const xs = pts.map((q) => q.p[0]);
  const zs = pts.map((q) => q.p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const small = await lineMapAt(sheetJpeg, SEARCH_WIDTH);
  let best: { fit: SheetFit; score: number } | null = null;
  for (const t of SCALE_TRIES) {
    const { fit } = fitModelToSheet(pts, small, { pxPerM: (SEARCH_WIDTH * 0.7) / span, scaleTries: [t], coarseStep: 2, coarsePoints: 400 });
    const score = agreement(pts, fit, small);
    if (!best || score > best.score) best = { fit, score };
  }
  const k = 2;
  const mid = fitModelToSheet(pts, await lineMapAt(sheetJpeg, SEARCH_WIDTH * k), { pxPerM: best!.fit.s * k, scaleTries: [0.96, 1, 1.04] });
  const up = STUDIO_SHEET_WIDTH / (SEARCH_WIDTH * k);
  return { ...mid.fit, s: mid.fit.s * up, tx: mid.fit.tx * up, ty: mid.fit.ty * up };
}

/** F1 of the two directions at 1.5 px: model points near a line, and line pixels in the model's box near a model point. */
export function agreement(pts: KindPoint[], fit: SheetFit, lines: DistanceMap): number {
  const { w, h } = lines;
  const drawn = new Uint8Array(w * h);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  let near = 0;
  for (const q of pts) {
    const [x, y] = projectToSheet(fit, q.p);
    if (distanceAt(lines, x, y, 99) <= 1.5) near++;
    const [xi, yi] = [Math.round(x), Math.round(y)];
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
    drawn[yi * w + xi] = 1;
    [x0, y0, x1, y1] = [Math.min(x0, xi), Math.min(y0, yi), Math.max(x1, xi), Math.max(y1, yi)];
  }
  const recall = near / pts.length;
  if (x1 <= x0 || y1 <= y0) return 0;
  const model = chamferDistance(drawn, w, h);
  let inBox = 0;
  let explained = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (lines.d[y * w + x] !== 0) continue;
      inBox++;
      if (model.d[y * w + x]! <= 1.5) explained++;
    }
  }
  const precision = inBox ? explained / inBox : 0;
  return recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
}

/** The reader's frame agrees this well with the lines: taken as is, no registration run. */
const READER_HOLDS = 0.5;

/**
 * The reader's own frame when it holds: a sheet point (x, y) in page units stands at x / DWF_FLOOR_UNITS_PER_METRE +
 * shift.x (from-dwf.ts: cell·cm/100 + shift, a cell being cm/100·upm page units). Registration is the fallback, for a
 * sheet saved without its frame or one the frame misses (it agrees less with the lines than a registration does).
 */
async function placeStorey(
  pts: KindPoint[],
  floor: { shift?: { x: number; y: number }; sheetWidth?: number },
  sheetJpeg: Buffer,
  width: number,
): Promise<SheetFit & { frame: "reader" | "registered" }> {
  if (!floor.shift || !floor.sheetWidth) return { ...(await registerStorey(pts, sheetJpeg)), frame: "registered" };
  const s = (DWF_FLOOR_UNITS_PER_METRE * width) / floor.sheetWidth;
  const reader: SheetFit = { s, th: 0, tx: -floor.shift.x * s, ty: -floor.shift.y * s, cx: 0, cz: 0 };
  const lines = await lineMapAt(sheetJpeg, width);
  const byReader = agreement(pts, reader, lines);
  if (byReader >= READER_HOLDS) return { ...reader, frame: "reader" };
  const registered = await registerStorey(pts, sheetJpeg);
  return byReader >= agreement(pts, registered, lines) ? { ...reader, frame: "reader" } : { ...registered, frame: "registered" };
}

/** One storey's sheet at the studio's width, and the model's walls registered on it and measured against its ink. */
export async function storeyOverlay(
  primitives: Primitive[],
  floor: { id?: string; level: number; height: number; shift?: { x: number; y: number }; sheetWidth?: number },
  sheetJpeg: Buffer,
): Promise<{ jpeg: Buffer; width: number; height: number; overlay: StudioOverlay | null; frame?: "reader" | "registered" }> {
  const resized = sharp(sheetJpeg).resize({ width: STUDIO_SHEET_WIDTH });
  const jpeg = await resized.clone().jpeg({ quality: 85 }).toBuffer();
  const { data, info } = await resized.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const pts = storeyWallPoints(primitives, floor);
  const on = inkMask(data, info.width, info.height, info.channels);
  if (pts.length < 20 || !on.some((v) => v)) return { jpeg, width: info.width, height: info.height, overlay: null };
  const fit = await placeStorey(pts, floor, sheetJpeg, info.width);
  const map = chamferDistance(on, info.width, info.height);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const points = pts.map((q): [number, number, number] => {
    const [x, y] = projectToSheet(fit, q.p);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, distanceAt(map, x, y, CAP_PX) / fit.s];
  });
  const all = deviationStats(points.map((p) => p[2]), SHEET_BOUNDS_M);
  return { jpeg, width: info.width, height: info.height, frame: fit.frame, overlay: { points: points.map(([x, y, d]) => [x, y, r2(d)]), all, byKind: [{ kind: "wall", ...all }], bounds: SHEET_BOUNDS_M } };
}

/** A terrain's photograph is a data URL of megabytes: the studio paints that ground in its own colour instead. */
function lean(primitives: Primitive[]): Primitive[] {
  return primitives.map((p) => (p.type === "terrain" && p.photo ? { ...p, photo: undefined } : p));
}

/** The booklet's perspective views (not the elevations, the plans or the sections), as cameras the viewer can stand at. */
function perspectiveCameras(state: BookletState, model: BuildingModel): StudioCamera[] {
  if (!state.floors?.length || !state.extent) return [];
  const views = dwfBuildingViews({ floors: state.floors, model: { extent: state.extent, primitives: model.primitives } }, undefined, state.elevationFrames ?? {}, {
    house: state.finish === "house",
    north: state.north,
    street: state.street,
    plot: state.plot,
    public: state.public,
  });
  return views
    .filter((v) => v.payload.camera.orthoHalfWidth == null && v.payload.camera.cutAboveM == null && !v.payload.camera.section)
    .map((v) => ({ id: v.id, title: v.title, position: { ...v.payload.camera.position }, target: { ...v.payload.camera.target }, fovDeg: v.payload.camera.fovDeg }));
}

const storeyTitle = (f: BuildingFloorMeta, i: number) => (f.roof ? "גג" : Math.abs(f.level) < 0.5 && i === 0 ? "קומת קרקע" : `מפלס ${f.level >= 0 ? "+" : ""}${f.level.toFixed(2)}`);

/**
 * One measured model's studio: what it holds, and the storeys' sheets as files of their own (`sheet-<key>.jpg`). Null
 * when the state holds no model.
 */
export async function buildingStudioModel(
  name: string,
  state: BookletState,
  artefacts: Map<string, Buffer>,
  keyPrefix: string,
): Promise<{ model: BuildingStudioModel; sheets: Map<string, Buffer> } | null> {
  const ref = state.artefacts?.["model.json"];
  const raw = ref ? artefacts.get(ref) : undefined;
  if (!raw) return null;
  const model = JSON.parse(raw.toString("utf8")) as BuildingModel;
  const floors = state.floors ?? [];
  const sheets = new Map<string, Buffer>();
  const studioSheets: StudioStoreySheet[] = [];
  for (const f of floors) {
    if (f.roof) continue;
    const sheetRef = state.artefacts?.[`sheet-${f.id}.jpg`];
    const jpeg = sheetRef ? artefacts.get(sheetRef) : undefined;
    if (!jpeg) continue;
    const o = await storeyOverlay(model.primitives, f, jpeg);
    const key = `${keyPrefix}${f.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    sheets.set(key, o.jpeg);
    studioSheets.push({ storeyId: f.id, key, width: o.width, height: o.height, overlay: o.overlay, ...(o.frame ? { frame: o.frame } : {}) });
  }
  return {
    model: {
      name,
      primitives: lean(model.primitives),
      extent: model.extent,
      storeys: floors.map((f, i) => ({ id: f.id, level: f.level, height: f.height, roof: f.roof, title: storeyTitle(f, i) })),
      cameras: perspectiveCameras(state, model),
      sheets: studioSheets,
    },
    sheets,
  };
}
