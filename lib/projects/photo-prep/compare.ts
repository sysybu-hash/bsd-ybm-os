import sharp from "sharp";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";
import { isTrustworthyRoomGeometry, unitCropFromLayout } from "@/lib/projects/floorplan-locator";
import { isRasterFloorplanMime } from "@/lib/projects/photo-prep/mime";
import {
  detectInkCropBox,
  innerDoubleFrameRect,
  innerSheetRect,
} from "@/lib/projects/photo-prep/ink-crop";
import {
  peelIsolatedEdgeFrame,
  stripRightFrameRulesX,
  stripRightSparseChromeX,
  stripSheetFrameCorners,
  titleBlockCutX,
  titleDividerCutX,
} from "@/lib/projects/photo-prep/sheet-frame";
import { cropFloorplanRasterToUnit } from "@/lib/projects/photo-prep/source";
export async function cropSalesSheetForCompare(
  base64: string,
  mimeType: string,
  layout?: FloorplanLayout | null,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  try {
    let buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf, { failOn: "none", unlimited: true }).metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return null;
    const floor = layout && isTrustworthyRoomGeometry(layout) ? unitCropFromLayout(layout) : null;
    if (floor) {
      const greySheet = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const divider = titleDividerCutX(fullW, fullH, greySheet.data);
      const floorRight = floor.x + floor.w;
      if (divider < fullW && divider / fullW >= floorRight - 0.03) {
        const right = Math.min(1, Math.max(floorRight, divider / fullW));
        const wide = { x: floor.x, y: floor.y, w: Math.max(0.2, right - floor.x), h: floor.h };
        if (wide.w < 0.97 || wide.h < 0.97 || wide.x > 0.02 || wide.y > 0.02) {
          const unit = await cropFloorplanRasterToUnit(base64, mimeType, wide);
          if (unit) return unit;
        }
      }
    }
    let cutTitle = false;
    const floorRightPx = floor ? Math.round((floor.x + floor.w) * fullW) : 0;
    const insideFloor = (cutX: number): boolean =>
      Boolean(floor && cutX < floorRightPx - Math.round(fullW * 0.03));
    const applyTitleCut = async (): Promise<void> => {
      const g = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const gwCut = g.info.width ?? 0;
      const ghCut = g.info.height ?? 0;
      const divider = titleDividerCutX(gwCut, ghCut, g.data);
      if (divider < gwCut && !insideFloor(divider)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: divider, height: ghCut }).toBuffer();
        cutTitle = true;
        return;
      }
      const titleCut = titleBlockCutX(gwCut, ghCut, g.data);
      if (titleCut < gwCut && !insideFloor(titleCut)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: titleCut, height: ghCut }).toBuffer();
        cutTitle = true;
        return;
      }
      const chrome = Math.min(
        stripRightSparseChromeX(gwCut, ghCut, g.data),
        stripRightFrameRulesX(gwCut, ghCut, g.data),
      );
      if (chrome < gwCut && !insideFloor(chrome)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: chrome, height: ghCut }).toBuffer();
      }
    };
    await applyTitleCut();
    const grey0 = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const gw = grey0.info.width ?? 0;
    const gh = grey0.info.height ?? 0;
    let peeledFrame = false;
    if (!cutTitle) {
      const inner = innerSheetRect(gw, gh, grey0.data);
      peeledFrame = inner.width < gw * 0.95 && inner.height < gh * 0.95;
      if (inner.width < gw || inner.height < gh) {
        buf = await sharp(buf).extract(inner).toBuffer();
        if (peeledFrame) {
          const insetX = Math.max(4, Math.round(inner.width * 0.02));
          const insetY = Math.max(4, Math.round(inner.height * 0.02));
          const afterInner = await sharp(buf).metadata();
          const iw = afterInner.width ?? 0;
          const ih = afterInner.height ?? 0;
          if (iw > insetX * 2 + 8 && ih > insetY * 2 + 8) {
            buf = await sharp(buf)
              .extract({
                left: insetX,
                top: insetY,
                width: iw - insetX * 2,
                height: ih - insetY * 2,
              })
              .toBuffer();
          }
        }
      }
    }
    const afterFrame = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const dbl = innerDoubleFrameRect(afterFrame.info.width ?? 0, afterFrame.info.height ?? 0, afterFrame.data);
    let peeledDbl = false;
    if (
      dbl.width < (afterFrame.info.width ?? 0) * 0.98 ||
      dbl.height < (afterFrame.info.height ?? 0) * 0.98
    ) {
      buf = await sharp(buf).extract(dbl).toBuffer();
      peeledDbl = true;
    }
    const peelFrame = async (): Promise<void> => {
      const edgeGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const peeled = peelIsolatedEdgeFrame(
        edgeGrey.info.width ?? 0,
        edgeGrey.info.height ?? 0,
        edgeGrey.data,
      );
      if (
        peeled.width < (edgeGrey.info.width ?? 0) ||
        peeled.height < (edgeGrey.info.height ?? 0)
      ) {
        buf = await sharp(buf).extract(peeled).toBuffer();
      }
    };
    await peelFrame();
    const inkCrop = async (
      edgeIgnore: number | { left?: number; right?: number; top?: number; bottom?: number },
    ): Promise<void> => {
      const innerGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const box = detectInkCropBox(innerGrey.info.width ?? 0, innerGrey.info.height ?? 0, innerGrey.data, {
        edgeIgnore,
        padRatio: 0.03,
      });
      if (box) buf = await sharp(buf).extract(box).toBuffer();
    };
    await inkCrop(
      cutTitle || peeledDbl
        ? { left: 0.07, right: 0.015, top: 0.1, bottom: 0.1 }
        : 0.02,
    );
    const afterInk = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const leftover = Math.min(
      stripRightSparseChromeX(afterInk.info.width ?? 0, afterInk.info.height ?? 0, afterInk.data),
      stripRightFrameRulesX(afterInk.info.width ?? 0, afterInk.info.height ?? 0, afterInk.data),
    );
    if (leftover < (afterInk.info.width ?? 0)) {
      buf = await sharp(buf)
        .extract({ left: 0, top: 0, width: leftover, height: afterInk.info.height ?? 0 })
        .toBuffer();
    }
    const finalGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const stripped = stripSheetFrameCorners(
      finalGrey.info.width ?? 0,
      finalGrey.info.height ?? 0,
      finalGrey.data,
    );
    if (stripped.width < (finalGrey.info.width ?? 0) || stripped.height < (finalGrey.info.height ?? 0)) {
      buf = await sharp(buf).extract(stripped).toBuffer();
    }
    const edgeGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const peeled = peelIsolatedEdgeFrame(
      edgeGrey.info.width ?? 0,
      edgeGrey.info.height ?? 0,
      edgeGrey.data,
    );
    if (
      peeled.width < (edgeGrey.info.width ?? 0) ||
      peeled.height < (edgeGrey.info.height ?? 0)
    ) {
      buf = await sharp(buf).extract(peeled).toBuffer();
    }
    const out = await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function sampleCornerBackdrop(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { r: number; g: number; b: number } | null {
  const patch = Math.max(4, Math.min(12, Math.round(Math.min(width, height) * 0.04)));
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  const samples: Array<{ r: number; g: number; b: number }> = [];
  for (const [sx, sy] of corners) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = sy; y < sy + patch; y += 1) {
      for (let x = sx; x < sx + patch; x += 1) {
        const i = (y * width + x) * channels;
        r += data[i] ?? 255;
        g += data[i + 1] ?? 255;
        b += data[i + 2] ?? 255;
        n += 1;
      }
    }
    if (n === 0) return null;
    samples.push({ r: r / n, g: g / n, b: b / n });
  }
  const avg = {
    r: samples.reduce((s, c) => s + c.r, 0) / samples.length,
    g: samples.reduce((s, c) => s + c.g, 0) / samples.length,
    b: samples.reduce((s, c) => s + c.b, 0) / samples.length,
  };
  const luma = 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b;
  if (luma < 198) return null;
  for (const sample of samples) {
    const dist = Math.max(
      Math.abs(sample.r - avg.r),
      Math.abs(sample.g - avg.g),
      Math.abs(sample.b - avg.b),
    );
    if (dist > 18) return null;
  }
  return avg;
}

function isRasterBackdropPixel(
  r: number,
  g: number,
  b: number,
  backdrop: { r: number; g: number; b: number } | null,
): boolean {
  if (r >= 242 && g >= 242 && b >= 242) return true;
  if (!backdrop) return false;
  return (
    Math.max(Math.abs(r - backdrop.r), Math.abs(g - backdrop.g), Math.abs(b - backdrop.b)) <= 32
  );
}

/** Tight crop of studio/paper margins so a still fills its plate. */
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

