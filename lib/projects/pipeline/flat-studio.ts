/**
 * What the studio shows of a measured flat (plan M3): the scene the booklet's pictures were rendered from, the cameras
 * they were taken with, and the model laid on the client's sheet with every sampled wall point's distance to the ink
 * (live research 5.37, through lib/projects/accuracy — the same registration the certificate measures with).
 *
 * Nothing here is drawn by hand: the viewer builds the same FlatScene with scene3d, and the overlay's colours are the
 * measured distances, graded by SHEET_BOUNDS_M.
 */
import sharp from "sharp";

import { chamferDistance, distanceAt, inkMask } from "@/lib/projects/accuracy/distance-map";
import { fitModelToSheet, projectToSheet, type KindDeviation, type KindPoint, type SheetFit } from "@/lib/projects/accuracy/sheet-fit";
import { deviationStats, SHEET_BOUNDS_M, type DeviationStats } from "@/lib/projects/accuracy/stats";
import type { FlatView } from "@/lib/projects/building/flat-model";
import type { FlatScene, SceneBox } from "@/lib/projects/scene3d/types";

export const STUDIO_VERSION = 1;
/** The sheet is kept and measured at this width: wide enough to read, small enough to fit in a few seconds. */
export const STUDIO_SHEET_WIDTH = 1200;
/** The registration is searched at this width, then measured at the full one. */
const FIT_WIDTH = 600;
/** A point farther than this from any ink (sheet pixels) reads as this far: far enough to be red at any flat's scale. */
const CAP_PX = 96;
/** Wall points are sampled this far apart along each face, metres. */
const STEP_M = 0.1;
/** The most cameras a client may add to a flat. */
export const MAX_CLIENT_CAMERAS = 8;

type V3 = { x: number; y: number; z: number };
export type StudioCamera = { id: string; title: string; position: V3; target: V3; fovDeg: number; top?: boolean; client?: boolean };

export type StudioOverlay = {
  /** Sheet pixels and metres: [x, y, distance] for every sampled point. */
  points: Array<[number, number, number]>;
  all: DeviationStats;
  byKind: KindDeviation[];
  bounds: { close: number; far: number };
};

export type StudioData = {
  version: typeof STUDIO_VERSION;
  unit: number;
  wallHeightM: number;
  scene: FlatScene;
  cameras: StudioCamera[];
  sheet: { width: number; height: number } | null;
  overlay: StudioOverlay | null;
};

/** The booklet's own views, as cameras the viewer can stand at. */
export function studioCameras(views: FlatView[], clientIds: ReadonlySet<string> = new Set()): StudioCamera[] {
  return views.map((v, i) => {
    const c = v.payload.camera;
    return {
      id: v.id,
      title: v.title,
      position: { ...c.position },
      target: { ...c.target },
      fovDeg: c.fovDeg ?? 50,
      ...(i === 0 && !c.interior ? { top: true } : {}),
      ...(clientIds.has(v.id) ? { client: true } : {}),
    };
  });
}

/** The four corners of a box's footprint (x, z), turned by its rotY. */
export function footprint(b: Pick<SceneBox, "centre" | "size" | "rotY">): Array<[number, number]> {
  const hx = b.size.x / 2;
  const hz = b.size.z / 2;
  const co = Math.cos(b.rotY ?? 0);
  const si = Math.sin(b.rotY ?? 0);
  // three.js turns about +y: x' = x cos + z sin, z' = −x sin + z cos
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as Array<[number, number]>).map(([x, z]) => [
    b.centre.x + x * co + z * si,
    b.centre.z - x * si + z * co,
  ]);
}

/** Every wall face of the plan, sampled: the lines a sheet draws for a wall. */
export function wallPoints(scene: FlatScene, step = STEP_M): KindPoint[] {
  const out: KindPoint[] = [];
  for (const b of scene.meshes) {
    if (b.kind !== "wall") continue;
    const c = footprint(b);
    for (let i = 0; i < 4; i++) {
      const a = c[i]!;
      const e = c[(i + 1) % 4]!;
      const n = Math.max(1, Math.round(Math.hypot(e[0] - a[0], e[1] - a[1]) / step));
      for (let j = 0; j < n; j++) out.push({ p: [a[0] + ((e[0] - a[0]) * j) / n, a[1] + ((e[1] - a[1]) * j) / n], kind: "wall" });
    }
  }
  return out;
}

/**
 * The sheet at the studio's width, and the model registered on it. `pxPerM` is the sheet's own scale at its rendered
 * width; the fit searches round it. Null overlay when the flat has no walls or the sheet has no ink.
 */
export async function sheetOverlay(scene: FlatScene, sheetJpeg: Buffer, pxPerM: number): Promise<{ jpeg: Buffer; width: number; height: number; overlay: StudioOverlay | null }> {
  const meta = await sharp(sheetJpeg).metadata();
  const k = STUDIO_SHEET_WIDTH / (meta.width ?? STUDIO_SHEET_WIDTH);
  const jpeg = await sharp(sheetJpeg).resize({ width: STUDIO_SHEET_WIDTH }).jpeg({ quality: 85 }).toBuffer();
  const grey = async (width: number) => sharp(sheetJpeg).resize({ width }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const full = await grey(STUDIO_SHEET_WIDTH);
  const pts = wallPoints(scene);
  const on = inkMask(full.data, full.info.width, full.info.height, full.info.channels);
  if (!pts.length || !on.some((v) => v)) return { jpeg, width: full.info.width, height: full.info.height, overlay: null };
  // The search runs on a copy half as wide (a quarter of the positions); the distances are then read at full width.
  const half = await grey(FIT_WIDTH);
  const h = FIT_WIDTH / STUDIO_SHEET_WIDTH;
  const halfMap = chamferDistance(inkMask(half.data, half.info.width, half.info.height, half.info.channels), half.info.width, half.info.height);
  const coarse = fitModelToSheet(pts, halfMap, { pxPerM: pxPerM * k * h });
  const fit: SheetFit = { ...coarse.fit, s: coarse.fit.s / h, tx: coarse.fit.tx / h, ty: coarse.fit.ty / h };
  const map = chamferDistance(on, full.info.width, full.info.height);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const points = pts.map((q): [number, number, number] => {
    const [x, y] = projectToSheet(fit, q.p);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, distanceAt(map, x, y, CAP_PX) / fit.s];
  });
  const all = deviationStats(points.map((p) => p[2]), SHEET_BOUNDS_M);
  return {
    jpeg,
    width: full.info.width,
    height: full.info.height,
    overlay: { points: points.map(([x, y, m]) => [x, y, r2(m)]), all, byKind: [{ kind: "wall", ...all }], bounds: SHEET_BOUNDS_M },
  };
}

/** A client camera for the flat route: kept inside the flat's extent, at a person's eye height or above. */
export function clientViews(cameras: StudioCamera[], scene: FlatScene, width = 1600): FlatView[] {
  const e = scene.extent;
  const inside = (p: V3) => p.x >= e.x - 1 && p.x <= e.x + e.width + 1 && p.z >= e.z - 1 && p.z <= e.z + e.depth + 1;
  return cameras
    .filter((c) => inside(c.position) && inside(c.target))
    .slice(0, MAX_CLIENT_CAMERAS)
    .map((c) => ({
      id: c.id,
      title: c.title,
      ceiling: true,
      payload: {
        width,
        height: Math.round((width * 10) / 16),
        exposure: 0.7,
        ao: true,
        camera: { position: c.position, target: c.target, fovDeg: c.fovDeg, interior: true, studio: true },
        sun: { azimuthDeg: 200, elevationDeg: 40 },
      },
    })) as FlatView[];
}
