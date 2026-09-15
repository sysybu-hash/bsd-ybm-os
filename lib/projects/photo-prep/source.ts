import sharp from "sharp";
import type { FloorplanBbox } from "@/lib/projects/floorplan-layout";
import {
  MAX_LONG_EDGE,
  MIN_SHORT_EDGE,
  TARGET_SHORT_EDGE,
  isRasterFloorplanMime,
  sniffFloorplanMime,
  type PreparedFloorplanSource,
} from "@/lib/projects/photo-prep/mime";
import { detectPaperCropBox, paperPixelRatio } from "@/lib/projects/photo-prep/ink-crop";
/**
 * מיישר EXIF, מגביר ניגודיות בצל, ומגדיל צילום טלפון קטן — כדי ש-OCR יקרא תוכנית מודפסת.
 */
export async function prepareFloorplanSource(
  base64: string,
  mimeType: string,
  options?: { forceDrawing?: boolean },
): Promise<PreparedFloorplanSource> {
  const mime = sniffFloorplanMime(base64, mimeType);
  if (mime === "application/pdf" || !isRasterFloorplanMime(mime)) {
    return { base64, mimeType: mime, sourceKind: "pdf" };
  }

  try {
    const input = Buffer.from(base64, "base64");
    const rotated = await sharp(input, { failOn: "none", unlimited: true }).rotate().toBuffer();
    const preview = await sharp(rotated)
      .greyscale()
      .resize(800, 800, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ratio = paperPixelRatio(preview.info.width, preview.info.height, preview.data);
    const asDrawing = options?.forceDrawing === true || ratio >= 0.88;
    const previewBox = asDrawing ? null : detectPaperCropBox(preview.info.width, preview.info.height, preview.data);
    let working = rotated;
    if (previewBox) {
      const rotMeta = await sharp(rotated).metadata();
      const sx = (rotMeta.width ?? preview.info.width) / preview.info.width;
      const sy = (rotMeta.height ?? preview.info.height) / preview.info.height;
      const fullW = rotMeta.width ?? preview.info.width;
      const fullH = rotMeta.height ?? preview.info.height;
      const left = Math.max(0, Math.min(fullW - 1, Math.round(previewBox.left * sx)));
      const top = Math.max(0, Math.min(fullH - 1, Math.round(previewBox.top * sy)));
      const width = Math.max(8, Math.min(fullW - left, Math.round(previewBox.width * sx)));
      const height = Math.max(8, Math.min(fullH - top, Math.round(previewBox.height * sy)));
      working = await sharp(rotated).extract({ left, top, width, height }).toBuffer();
    }

    const meta = await sharp(working).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);

    let pipeline = sharp(working, { failOn: "none", unlimited: true });

    if (shortEdge > 0 && shortEdge < MIN_SHORT_EDGE) {
      const scale = TARGET_SHORT_EDGE / shortEdge;
      const nextW = Math.round(width * scale);
      const nextH = Math.round(height * scale);
      const longest = Math.max(nextW, nextH);
      const clamp = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
      pipeline = pipeline.resize(Math.round(nextW * clamp), Math.round(nextH * clamp), {
        kernel: "lanczos3",
        withoutEnlargement: false,
      });
    } else if (longEdge > MAX_LONG_EDGE) {
      pipeline = pipeline.resize(MAX_LONG_EDGE, MAX_LONG_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (!asDrawing) {
      pipeline = pipeline.normalize().modulate({ brightness: 1.06, saturation: 0.92 }).sharpen({ sigma: 0.8 });
    }

    const out = await pipeline.jpeg({ quality: asDrawing ? 92 : 90, mozjpeg: true }).toBuffer();

    return {
      base64: out.toString("base64"),
      mimeType: "image/jpeg",
      sourceKind: asDrawing ? "drawing" : "photo",
    };
  } catch {
    return { base64, mimeType: mime, sourceKind: options?.forceDrawing ? "drawing" : "photo" };
  }
}

export async function isPortraitFloorplanRaster(base64: string, mimeType: string): Promise<boolean> {
  if (!isRasterFloorplanMime(mimeType)) return false;
  try {
    const meta = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    return height > width * 1.12;
  } catch {
    return false;
  }
}

/** חיתוך בלוק כותרות / איחוד חללים לפני סינתזת תלת־ממד */
export async function cropFloorplanRasterToUnit(
  base64: string,
  mimeType: string,
  bbox: FloorplanBbox,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  if (bbox.w >= 0.97 && bbox.h >= 0.97 && bbox.x <= 0.02 && bbox.y <= 0.02) {
    return { base64, mimeType };
  }
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return null;
    const left = Math.max(0, Math.min(fullW - 8, Math.round(bbox.x * fullW)));
    const top = Math.max(0, Math.min(fullH - 8, Math.round(bbox.y * fullH)));
    const width = Math.max(8, Math.min(fullW - left, Math.round(bbox.w * fullW)));
    const height = Math.max(8, Math.min(fullH - top, Math.round(bbox.h * fullH)));
    const out = await sharp(input)
      .extract({ left, top, width, height })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

