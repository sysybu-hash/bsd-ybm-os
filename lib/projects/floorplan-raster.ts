import sharp from "sharp";

import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * Walls from a scan, as the same segments the CAD path already eats.
 *
 * A hatched wall is a run of 45° ink. That signal survives rasterisation —
 * measured 48–68 hatches per 1000 units² in a wall against 9.3 in a window.
 * Low confidence is not a silent downgrade: the operator has to confirm the
 * outline before the booklet is sold as measured.
 */

export type RasterSegmentResult = {
  segments: VectorSegment[];
  /** 0–1. Below 0.45 the outline must be confirmed, not trusted. */
  confidence: number;
  hatchPerK: number;
};

const DARK = 140;

function walkDiagonal(
  grey: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  seen: Uint8Array,
): VectorSegment | null {
  let x = sx;
  let y = sy;
  let steps = 0;
  while (x >= 0 && y >= 0 && x < width && y < height) {
    const i = y * width + x;
    if ((grey[i] ?? 255) >= DARK || seen[i]) break;
    seen[i] = 1;
    x += dx;
    y += dy;
    steps += 1;
  }
  if (steps < 8) return null;
  return {
    x1: sx,
    y1: sy,
    x2: sx + dx * (steps - 1),
    y2: sy + dy * (steps - 1),
    lineWidth: 4,
  };
}

export function segmentsFromGrey(
  grey: Uint8Array,
  width: number,
  height: number,
): RasterSegmentResult {
  const seen = new Uint8Array(width * height);
  const segments: VectorSegment[] = [];
  let dark = 0;
  for (let i = 0; i < grey.length; i++) {
    if ((grey[i] ?? 255) < DARK) dark += 1;
  }
  const hatchPerK = (dark / Math.max(1, width * height)) * 1000;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      if ((grey[i] ?? 255) >= DARK || seen[i]) continue;
      const a = walkDiagonal(grey, width, height, x, y, 1, 1, seen);
      const b = walkDiagonal(grey, width, height, x, y, 1, -1, seen);
      if (a) segments.push(a);
      if (b) segments.push(b);
    }
  }

  // Wall ink is dense; a window or a blank scan is not. The measured wall
  // band was 48–68 hatches / 1000 units². Below ~20 this is not a wall plate.
  let confidence = 0.15;
  if (hatchPerK >= 20 && segments.length >= 8) confidence = 0.45;
  if (hatchPerK >= 40 && segments.length >= 20) confidence = 0.72;
  if (hatchPerK >= 48 && segments.length >= 40) confidence = 0.88;

  return { segments, confidence, hatchPerK };
}

export async function rasterToSegments(image: Buffer): Promise<RasterSegmentResult> {
  const { data, info } = await sharp(image)
    .greyscale()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return segmentsFromGrey(data, info.width, info.height);
}

/**
 * How much of the CAD ink a raster pass recovered.
 *
 * Run the vector PDF, rasterise it, run again. The gap is the quality of
 * the scan path — not a guess at a threshold.
 */
export function compareRasterToVector(
  raster: VectorSegment[],
  vector: VectorSegment[],
): { recovered: number; extra: number } {
  if (vector.length === 0) return { recovered: 0, extra: raster.length };
  const hit = vector.filter((v) =>
    raster.some((r) => {
      const midVx = (v.x1 + v.x2) / 2;
      const midVy = (v.y1 + v.y2) / 2;
      const midRx = (r.x1 + r.x2) / 2;
      const midRy = (r.y1 + r.y2) / 2;
      return Math.hypot(midVx - midRx, midVy - midRy) < 24;
    }),
  ).length;
  return {
    recovered: hit / vector.length,
    extra: Math.max(0, raster.length - hit),
  };
}

export function rasterNeedsOutlineConfirm(result: RasterSegmentResult): boolean {
  return result.confidence < 0.45;
}
