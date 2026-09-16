import sharp from "sharp";

/**
 * CAD structure at print resolution, materials sampled from the model still.
 *
 * The model finish is ~768 px. The geometric render is ~3889 px. Every
 * structural pixel must come from the CAD — a chair that vanished in the
 * still is still there, a sofa that drifted is put back. Colour is taken
 * from the still inside each mask and applied at full resolution, then a
 * lighting pass from the geometry keeps the shadows from going flat.
 */

export type CompositeInput = {
  geometry: Buffer;
  still: Buffer;
  /** Darken geometry shadows this much when the still looks flat. 0–1. */
  shadowGain?: number;
};

/** Below this the still is a different apartment — do not sample its chroma. */
export const SILHOUETTE_IOU_MIN = 0.88;

const SILHOUETTE_INK = 720;

/**
 * How much the still's ink mass overlaps the CAD ink mass.
 *
 * A model that redrew a rectangle apartment over an irregular plate scores
 * far below the gate. Colour transfer from that frame would paint the
 * wrong rooms onto the right walls.
 */
export async function measureSilhouetteIou(
  geometry: Buffer,
  still: Buffer,
): Promise<number> {
  const geoMeta = await sharp(geometry).metadata();
  const stillMeta = await sharp(still).metadata();
  const gw = geoMeta.width ?? 0;
  const gh = geoMeta.height ?? 0;
  const sw = stillMeta.width ?? 0;
  const sh = stillMeta.height ?? 0;
  if (gw < 8 || gh < 8 || sw < 8 || sh < 8) return 0;
  const drawingHeight = Math.min(sh, Math.round((sw * gh) / gw));
  const width = Math.min(480, sw);
  const height = Math.max(1, Math.round((width * drawingHeight) / sw));
  const geo = await sharp(geometry)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const painted = await sharp(still)
    .extract({ left: 0, top: 0, width: sw, height: drawingHeight })
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let geoInk = 0;
  let stillInk = 0;
  let both = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const gi = geo[o]! + geo[o + 1]! + geo[o + 2]! < SILHOUETTE_INK;
    const si = painted[o]! + painted[o + 1]! + painted[o + 2]! < SILHOUETTE_INK;
    if (gi) geoInk += 1;
    if (si) stillInk += 1;
    if (gi && si) both += 1;
  }
  return both / Math.max(1, geoInk + stillInk - both);
}

function clamp(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Keep the CAD's luminance (walls, furniture blocks, shadows) and take
 * chroma from the still. If the still is flatter than the geometry, push
 * the geometry's own shadows back in before giving up on the composite.
 */
export function transferStillOntoGeometry(
  geometry: Buffer,
  still: Buffer,
  width: number,
  height: number,
  shadowGain = 0.35,
): Buffer {
  const out = Buffer.alloc(width * height * 3);
  let geoContrast = 0;
  let stillContrast = 0;
  let n = 0;
  for (let i = 0; i < geometry.length; i += 3) {
    const yg = luma(geometry[i]!, geometry[i + 1]!, geometry[i + 2]!);
    const ys = luma(still[i]!, still[i + 1]!, still[i + 2]!);
    geoContrast += Math.abs(yg - 200);
    stillContrast += Math.abs(ys - 200);
    n += 1;
  }
  const flat = n > 0 && stillContrast / n < (geoContrast / n) * 0.55;
  const gain = flat ? Math.max(shadowGain, 0.55) : shadowGain;

  for (let i = 0; i < geometry.length; i += 3) {
    const gr = geometry[i]!;
    const gg = geometry[i + 1]!;
    const gb = geometry[i + 2]!;
    const sr = still[i]!;
    const sg = still[i + 1]!;
    const sb = still[i + 2]!;
    const yg = luma(gr, gg, gb) / 255;
    const ys = luma(sr, sg, sb) / 255;
    const shade = 1 - (1 - yg) * (0.45 + gain);
    const chroma = ys > 0.08 ? yg / ys : 1;
    out[i] = clamp(sr * chroma * shade);
    out[i + 1] = clamp(sg * chroma * shade);
    out[i + 2] = clamp(sb * chroma * shade);
  }
  return out;
}

export async function compositeMaterialsOntoGeometry(
  input: CompositeInput,
): Promise<Buffer> {
  const geoMeta = await sharp(input.geometry).metadata();
  const width = geoMeta.width ?? 0;
  const height = geoMeta.height ?? 0;
  if (width < 8 || height < 8) return input.geometry;

  const geometry = await sharp(input.geometry)
    .removeAlpha()
    .raw()
    .toBuffer();
  const still = await sharp(input.still)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const raw = transferStillOntoGeometry(
    geometry,
    still,
    width,
    height,
    input.shadowGain,
  );
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 94 })
    .toBuffer();
}
