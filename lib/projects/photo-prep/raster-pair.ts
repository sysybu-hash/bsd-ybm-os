import sharp from "sharp";
import { isRasterFloorplanMime } from "@/lib/projects/photo-prep/mime";
import {
  isRasterBackdropPixel,
  sampleCornerBackdrop,
} from "@/lib/projects/photo-prep/sheet-crop";

export async function trimRasterWhitespace(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  try {
    const buf = Buffer.from(base64, "base64");
    const { data, info } = await sharp(buf, { failOn: "none", unlimited: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    const channels = info.channels ?? 3;
    if (width < 16 || height < 16) return null;
    const backdrop = sampleCornerBackdrop(data, width, height, channels);
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * channels;
        const r = data[i] ?? 255;
        const g = data[i + 1] ?? 255;
        const b = data[i + 2] ?? 255;
        if (!isRasterBackdropPixel(r, g, b, backdrop)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return { base64, mimeType };
    const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.02));
    const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.02));
    const left = Math.max(0, minX - padX);
    const top = Math.max(0, minY - padY);
    const cropW = Math.min(width - left, maxX - minX + 1 + padX * 2);
    const cropH = Math.min(height - top, maxY - minY + 1 + padY * 2);
    if (cropW < 16 || cropH < 16) return { base64, mimeType };
    if (cropW * cropH < width * height * 0.04) return { base64, mimeType };
    if (cropW >= width * 0.995 && cropH >= height * 0.995) return { base64, mimeType };
    const out = await sharp(buf)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Pad with white so two floorplan rasters share an aspect ratio and
 * therefore the same scale when they sit in equal frames.
 */
export async function padRasterToAspect(
  base64: string,
  mimeType: string,
  targetAspect: number,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType) || !(targetAspect > 0)) return null;
  try {
    const buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 8) return null;
    const current = width / height;
    if (Math.abs(current - targetAspect) < 0.02) {
      return { base64, mimeType };
    }
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;
    if (current < targetAspect) {
      const nextW = Math.max(width, Math.round(height * targetAspect));
      const extra = nextW - width;
      padLeft = Math.floor(extra / 2);
      padRight = extra - padLeft;
    } else {
      const nextH = Math.max(height, Math.round(width / targetAspect));
      const extra = nextH - height;
      padTop = Math.floor(extra / 2);
      padBottom = extra - padTop;
    }
    const out = await sharp(buf)
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 255, g: 255, b: 255 },
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function pairRastersForCompare(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
): Promise<{ still: { base64: string; mimeType: string }; plan: { base64: string; mimeType: string } }> {
  try {
    const stillBuf = Buffer.from(still.base64, "base64");
    const planBuf = Buffer.from(plan.base64, "base64");
    const stillMeta = await sharp(stillBuf, { failOn: "none", unlimited: true }).metadata();
    const planMeta = await sharp(planBuf, { failOn: "none", unlimited: true }).metadata();
    const stillW = stillMeta.width ?? 0;
    const stillH = stillMeta.height ?? 0;
    const planW = planMeta.width ?? 0;
    const planH = planMeta.height ?? 0;
    if (stillW < 8 || stillH < 8 || planW < 8 || planH < 8) return { still, plan };
    const shared = Math.min(stillW / stillH, planW / planH);
    const nextStill = (await padRasterToAspect(still.base64, still.mimeType, shared)) ?? still;
    const nextPlan = (await padRasterToAspect(plan.base64, plan.mimeType, shared)) ?? plan;
    return { still: nextStill, plan: nextPlan };
  } catch {
    return { still, plan };
  }
}

