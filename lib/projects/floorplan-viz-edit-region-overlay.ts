import sharp, { type OutputInfo } from "sharp";
import { createLogger } from "@/lib/logger";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";

const log = createLogger("floorplan-viz-edit-region-overlay");

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Hue/chroma of the locator stroke #ff00dc — not oak, plaster, or stone. */
export function isLocatorMagenta(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40) return false;
  const delta = max - min;
  if (delta / max < 0.28) return false;
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const mx = Math.max(rr, gg, bb);
  const mn = Math.min(rr, gg, bb);
  const d = mx - mn;
  let hue: number;
  if (mx === rr) hue = 60 * (((gg - bb) / d) % 6);
  else if (mx === gg) hue = 60 * ((bb - rr) / d + 2);
  else hue = 60 * ((rr - gg) / d + 4);
  if (hue < 0) hue += 360;
  return hue >= 270 && hue <= 340;
}

/**
 * Black mask with a magenta rectangle. Never paint this onto the apartment
 * still — the model copies that stroke into the booklet.
 */
export async function overlayFloorplanVizEditRegion(
  still: { mimeType: string; base64: string },
  region: FloorplanVizEditRegion,
): Promise<{ mimeType: "image/jpeg"; base64: string }> {
  const input = Buffer.from(still.base64, "base64");
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 8 || height < 8) {
    return { mimeType: "image/jpeg", base64: still.base64 };
  }
  const left = Math.round(region.x * width);
  const top = Math.round(region.y * height);
  const rw = Math.max(4, Math.round(region.w * width));
  const rh = Math.max(4, Math.round(region.h * height));
  const stroke = Math.max(4, Math.round(Math.min(width, height) * 0.008));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#000"/>
    <rect x="${left}" y="${top}" width="${rw}" height="${rh}" fill="rgba(255,0,220,0.35)" stroke="#ff00dc" stroke-width="${stroke}"/>
  </svg>`;
  const jpeg = await sharp(Buffer.from(svg))
    .jpeg({ quality: 92 })
    .toBuffer();
  return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
}

/**
 * Pull a copied locator out of a still. The model treats the magenta box as
 * furniture; the booklet then prints it. Inpaint from neighbouring real pixels.
 */
export async function stripMagentaLocatorFromJpeg(still: {
  mimeType: string;
  base64: string;
}): Promise<{ mimeType: string; base64: string }> {
  const input = Buffer.from(still.base64, "base64");
  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (err: unknown) {
    log.warn("locator strip skipped; still did not decode", { error: reasonOf(err) });
    return still;
  }
  const { data, info } = decoded;
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  if (width < 8 || height < 8 || channels < 3) return still;
  const marked: boolean[] = new Array(width * height);
  let found = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const hit = isLocatorMagenta(data[o]!, data[o + 1]!, data[o + 2]!);
    marked[i] = hit;
    if (hit) found += 1;
  }
  if (found === 0) return still;
  const out = Buffer.from(data);
  const done = marked.map((hit) => !hit);
  let remaining = found;
  while (remaining > 0) {
    let progressed = 0;
    const newly: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (done[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        const take = (xx: number, yy: number) => {
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) return;
          const j = yy * width + xx;
          if (!done[j]) return;
          const o = j * channels;
          r += out[o]!;
          g += out[o + 1]!;
          b += out[o + 2]!;
          n += 1;
        };
        take(x - 1, y);
        take(x + 1, y);
        take(x, y - 1);
        take(x, y + 1);
        if (n === 0) continue;
        const o = i * channels;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
        newly.push(i);
        progressed += 1;
      }
    }
    if (progressed === 0) break;
    for (const i of newly) done[i] = true;
    remaining -= progressed;
  }
  const jpeg = await sharp(out, { raw: { width, height, channels } })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
}

/**
 * Keep pixels outside the operator's mark. The model regenerates the whole
 * still; without this paste-back every edit restages rooms the user did not
 * touch, which is why eleven attempts on one frame still drifted.
 */
export async function compositeFloorplanVizEditRegion(
  original: { mimeType: string; base64: string },
  edited: { mimeType: string; base64: string },
  region: FloorplanVizEditRegion,
): Promise<{ mimeType: string; base64: string }> {
  const origBuf = Buffer.from(original.base64, "base64");
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(origBuf).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (err: unknown) {
    log.warn("region paste-back skipped; shipping the unmasked edit", { error: reasonOf(err) });
    return edited;
  }
  if (width < 8 || height < 8) return edited;

  let editedResized: Buffer;
  try {
    editedResized = await sharp(Buffer.from(edited.base64, "base64"))
      .resize(width, height, { fit: "fill" })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (err: unknown) {
    log.warn("region paste-back skipped; shipping the unmasked edit", { error: reasonOf(err) });
    return edited;
  }

  const left = Math.max(0, Math.round(region.x * width));
  const top = Math.max(0, Math.round(region.y * height));
  const rw = Math.max(1, Math.min(width - left, Math.round(region.w * width)));
  const rh = Math.max(1, Math.min(height - top, Math.round(region.h * height)));
  const right = left + rw - 1;
  const bottom = top + rh - 1;
  const feather = Math.max(2, Math.round(Math.min(rw, rh) * 0.12));

  let origRaw: { data: Buffer; info: OutputInfo };
  let editRaw: { data: Buffer; info: OutputInfo };
  try {
    origRaw = await sharp(origBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    editRaw = await sharp(editedResized).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (err: unknown) {
    log.warn("region paste-back skipped; shipping the unmasked edit", { error: reasonOf(err) });
    return edited;
  }
  const channels = origRaw.info.channels;
  if (channels < 3 || editRaw.info.channels < 3) return edited;
  const out = Buffer.from(origRaw.data);
  const cover = (x: number, y: number): number => {
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    const d = Math.hypot(dx, dy);
    if (d <= 0) return 1;
    if (d >= feather) return 0;
    return 1 - d / feather;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = cover(x, y);
      if (a <= 0) continue;
      const o = (y * width + x) * channels;
      out[o] = Math.round((origRaw.data[o] ?? 0) * (1 - a) + (editRaw.data[o] ?? 0) * a);
      out[o + 1] = Math.round((origRaw.data[o + 1] ?? 0) * (1 - a) + (editRaw.data[o + 1] ?? 0) * a);
      out[o + 2] = Math.round((origRaw.data[o + 2] ?? 0) * (1 - a) + (editRaw.data[o + 2] ?? 0) * a);
    }
  }
  try {
    const jpeg = await sharp(out, { raw: { width, height, channels } })
      .jpeg({ quality: 92 })
      .toBuffer();
    return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
  } catch (err: unknown) {
    log.warn("region paste-back skipped; shipping the unmasked edit", { error: reasonOf(err) });
    return edited;
  }
}

