/**
 * Distance maps: for every pixel, how far (in pixels) the nearest "on" pixel
 * is. Two-pass chamfer (1, √2), the same transform the factory overlay
 * (live research 5.37) measured with.
 */

export type DistanceMap = { w: number; h: number; d: Float32Array };

const INF = 1e9;

/** The chamfer distance from every pixel to the nearest pixel with `on[k] = 1`. */
export function chamferDistance(on: Uint8Array, w: number, h: number): DistanceMap {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = on[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w]! + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1]! + Math.SQRT2);
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + Math.SQRT2);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + Math.SQRT2);
        if (x > 0) v = Math.min(v, d[i + w - 1]! + Math.SQRT2);
      }
      d[i] = v;
    }
  }
  return { w, h, d };
}

/** Dark pixels of a greyscale raster (one byte per pixel at `stride`) are ink. */
export function inkMask(grey: Uint8Array | Buffer, w: number, h: number, stride = 1, threshold = 140): Uint8Array {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = grey[i * stride]! < threshold ? 1 : 0;
  return on;
}

/**
 * The strong edges of a greyscale raster: central-difference gradient, and the
 * strongest `share` of pixels are edges (the judge's own rule: 8 %).
 */
export function edgeMask(grey: Uint8Array | Buffer, w: number, h: number, share = 0.08): Uint8Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      mag[k] = Math.hypot(grey[k + 1]! - grey[k - 1]!, grey[k + w]! - grey[k - w]!);
    }
  }
  const sorted = Float32Array.from(mag).sort();
  const peak = sorted[sorted.length - 1] ?? 0;
  // a clean drawing has fewer than `share` edge pixels: then the share's cut is
  // zero, and a fifth of the strongest edge separates edges from flat paper
  const cut = Math.max(sorted[Math.floor(sorted.length * (1 - share))]!, peak * 0.2);
  const on = new Uint8Array(w * h);
  if (cut <= 0) return on;
  for (let k = 0; k < mag.length; k++) on[k] = mag[k]! > cut ? 1 : 0;
  return on;
}

/** The distance at a (sub-)pixel position, capped; outside the map is the cap. */
export function distanceAt(map: DistanceMap, x: number, y: number, cap: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= map.w || yi >= map.h) return cap;
  return Math.min(cap, map.d[yi * map.w + xi]!);
}
