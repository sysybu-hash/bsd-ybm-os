/**
 * Painting against its render: the render is the authority (live research,
 * rule 4), so every strong edge of the render should still be in the painting
 * at the same place, and the painting should add no structure the render does
 * not have.
 *
 * Unlike structuralMatch (a pass/fail share within 2 px), this measures how
 * FAR each edge moved, in pixels at a fixed width — and, for orthographic
 * views (plans, elevations) where a pixel is a known length, in metres.
 *
 * Two things are told apart (factory out-eye-nw, 2026-11-11: chosen by eye,
 * the painter had moved the whole frame — horizon down, building lower):
 *   - the FRAME: one shift and scale of the whole picture, reported as such;
 *   - the GEOMETRY: each edge's distance after that frame is undone.
 * Both are graded: a moved frame changes what the buyer sees too.
 *
 * Painting edges far from any render edge (> 40 px) are counted apart as
 * dressing (rocks, grass, clouds the look asks for); edges 8–40 px from the
 * render's are invented structure near the building.
 */

import sharp from "sharp";
import { chamferDistance, distanceAt, edgeMask, type DistanceMap } from "./distance-map";
import { deviationStats, type Bounds, type DeviationStats } from "./stats";

/** All comparisons at this width, so pixel numbers mean the same everywhere. */
export const DRIFT_WIDTH = 960;
/** In pixels at DRIFT_WIDTH: ≤ 3 px is the same line, > 8 px has moved. */
export const DRIFT_BOUNDS_PX: Bounds = { close: 3, far: 8 };
/** Beyond this from every render edge, a painting edge is dressing, not structure. */
export const DRESSING_PX = 40;
const CAP = 40;

/** painting = s·(render − centre) + centre + (dx, dy), in pixels at DRIFT_WIDTH. */
export type FrameShift = { dx: number; dy: number; s: number };

export type PaintingDrift = {
  width: number;
  height: number;
  /** How far the whole frame moved: the shift's length plus the scale's effect at the frame's corner, px. */
  frameMovePx: number;
  frame: FrameShift;
  /** Render edges → nearest painting edge, in the render's own frame: what the buyer sees moved. */
  kept: DeviationStats;
  /** The same after the frame shift is undone: the geometry itself. */
  keptAligned: DeviationStats;
  /** Painting edges 8–40 px from every render edge, as a share of all painting edges (after alignment). */
  inventedNear: number;
  /** Painting edges more than 40 px from every render edge (dressing), as a share. */
  dressing: number;
  /** Painting edges → nearest render edge, after alignment. */
  invented: DeviationStats;
  /** kept / keptAligned in metres, when the view's metres per pixel is known (orthographic views). */
  keptM?: DeviationStats;
  keptAlignedM?: DeviationStats;
};

async function greyAt(img: Buffer, w: number, h: number): Promise<Buffer> {
  return (await sharp(img).resize(w, h, { fit: "fill" }).greyscale().blur(0.8).raw().toBuffer({ resolveWithObject: true })).data;
}

/** Distances from each `on` pixel of `from` to the nearest `on` pixel of `to`. */
export function edgeDistances(from: Uint8Array, to: Uint8Array, w: number, h: number): number[] {
  const map = chamferDistance(to, w, h);
  const out: number[] = [];
  for (let k = 0; k < from.length; k++) {
    if (!from[k]) continue;
    const x = k % w;
    out.push(distanceAt(map, x, (k - x) / w, CAP));
  }
  return out;
}

function onPoints(m: Uint8Array, w: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < m.length; k++) if (m[k]) pts.push([k % w, Math.floor(k / w)]);
  return pts;
}

const apply = (f: FrameShift, w: number, h: number, x: number, y: number): [number, number] => [f.s * (x - w / 2) + w / 2 + f.dx, f.s * (y - h / 2) + h / 2 + f.dy];

/** The frame shift that best lays the render's edges on the painting's. */
export function findFrameShift(renderPts: Array<[number, number]>, paintMap: DistanceMap, w: number, h: number): FrameShift {
  const every = Math.max(1, Math.floor(renderPts.length / 3000));
  const sub = renderPts.filter((_, i) => i % every === 0);
  const score = (f: FrameShift) => {
    let a = 0;
    for (const [x, y] of sub) {
      const [px, py] = apply(f, w, h, x, y);
      a += distanceAt(paintMap, px, py, 12);
    }
    return a / sub.length;
  };
  let best: FrameShift = { dx: 0, dy: 0, s: 1 };
  let bs = score(best);
  const span = Math.round(w * 0.08);
  for (const s of [0.94, 0.97, 1, 1.03, 1.06]) {
    for (let dy = -span; dy <= span; dy += 6) {
      for (let dx = -span; dx <= span; dx += 6) {
        const f = { dx, dy, s };
        const v = score(f);
        if (v < bs) {
          bs = v;
          best = f;
        }
      }
    }
  }
  for (const step of [3, 1, 0.5]) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 200) {
      moved = false;
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const f = { dx: best.dx + d[0] * step, dy: best.dy + d[1] * step, s: best.s * (1 + d[2] * 0.003 * step) };
        const v = score(f);
        if (v < bs - 1e-6) {
          bs = v;
          best = f;
          moved = true;
        }
      }
    }
  }
  return best;
}

async function edgesOf(render: Buffer, painting: Buffer) {
  const meta = await sharp(render).metadata();
  const w = DRIFT_WIDTH;
  const h = Math.max(8, Math.round((w * (meta.height ?? 600)) / (meta.width ?? w)));
  const a = edgeMask(await greyAt(render, w, h), w, h);
  const b = edgeMask(await greyAt(painting, w, h), w, h);
  return { w, h, a, b, srcW: meta.width ?? w };
}

/**
 * @param metresPerPixel metres per pixel of the ORIGINAL render (orthographic views only).
 */
export async function paintingDrift(render: Buffer, painting: Buffer, metresPerPixel?: number): Promise<PaintingDrift> {
  const { w, h, a, b, srcW } = await edgesOf(render, painting);
  const toB = chamferDistance(b, w, h);
  const aPts = onPoints(a, w);
  const frame = findFrameShift(aPts, toB, w, h);

  const keptPx = aPts.map(([x, y]) => distanceAt(toB, x, y, CAP));
  const keptAlignedPx = aPts.map(([x, y]) => {
    const [px, py] = apply(frame, w, h, x, y);
    return distanceAt(toB, px, py, CAP);
  });
  // painting edges measured against the render's edges carried into the painting's frame
  const aMoved = new Uint8Array(w * h);
  for (const [x, y] of aPts) {
    const [px, py] = apply(frame, w, h, x, y);
    const xi = Math.round(px);
    const yi = Math.round(py);
    if (xi >= 0 && yi >= 0 && xi < w && yi < h) aMoved[yi * w + xi] = 1;
  }
  const inventedPx = edgeDistances(b, aMoved, w, h);
  const nb = inventedPx.length || 1;

  const corner = Math.abs(frame.s - 1) * Math.hypot(w / 2, h / 2);
  const out: PaintingDrift = {
    width: w,
    height: h,
    frame,
    frameMovePx: Math.hypot(frame.dx, frame.dy) + corner,
    kept: deviationStats(keptPx, DRIFT_BOUNDS_PX),
    keptAligned: deviationStats(keptAlignedPx, DRIFT_BOUNDS_PX),
    inventedNear: inventedPx.filter((v) => v > DRIFT_BOUNDS_PX.far && v < DRESSING_PX).length / nb,
    dressing: inventedPx.filter((v) => v >= DRESSING_PX).length / nb,
    invented: deviationStats(inventedPx, DRIFT_BOUNDS_PX),
  };
  if (metresPerPixel && metresPerPixel > 0) {
    const mpp = (metresPerPixel * srcW) / w;
    const bm: Bounds = { close: DRIFT_BOUNDS_PX.close * mpp, far: DRIFT_BOUNDS_PX.far * mpp };
    out.keptM = deviationStats(keptPx.map((v) => v * mpp), bm);
    out.keptAlignedM = deviationStats(keptAlignedPx.map((v) => v * mpp), bm);
  }
  return out;
}

/**
 * The proof picture, in the render's frame: the painting faded, the render's
 * edges green where the painting kept them (≤ 3 px), orange 3–8 px, red where
 * it lost or moved them (> 8 px), and the painting's edges magenta where the
 * render has none within 8–40 px (invented near the structure).
 */
export async function driftPicture(render: Buffer, painting: Buffer): Promise<Buffer> {
  const { w, h, a, b } = await edgesOf(render, painting);
  const toB = chamferDistance(b, w, h);
  const toA = chamferDistance(a, w, h);
  const base = (await sharp(painting).resize(w, h, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })).data;
  const rgb = Buffer.alloc(w * h * 3);
  for (let k = 0; k < w * h; k++) {
    const g = 150 + Math.round(base[k]! * 0.4);
    let c: [number, number, number] = [g, g, g];
    const dA = toA.d[k]!;
    if (b[k] && dA > DRIFT_BOUNDS_PX.far && dA < DRESSING_PX) c = [220, 0, 200];
    if (a[k]) c = toB.d[k]! <= DRIFT_BOUNDS_PX.close ? [0, 170, 70] : toB.d[k]! > DRIFT_BOUNDS_PX.far ? [230, 0, 0] : [240, 170, 0];
    rgb[k * 3] = c[0];
    rgb[k * 3 + 1] = c[1];
    rgb[k * 3 + 2] = c[2];
  }
  return sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}
