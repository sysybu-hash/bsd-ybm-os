import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";

const log = createLogger("floorplan-viz-stamp");

/**
 * Prints the unit number, the area and the system credit onto a finished still.
 *
 * Deliberately composited after the fact rather than asked of the image model.
 * Every prompt lock forbids letters inside the frame and the audit fails a still
 * that has any, because a model asked for Hebrew text renders it malformed and
 * sprays room labels across the floor. Drawing the caption here means it is
 * always legible, always spelled right, and always carries the real numbers off
 * the extracted layout instead of whatever the model felt like inventing.
 */

export type FloorplanStampFields = {
  unitLabel?: string;
  areaM2?: number;
};

/** The unit number and area as printed on the sheet, where the sheet gives them. */
export function stampFieldsFromLayout(
  layout: FloorplanLayout,
  fallbackTitle?: string,
): FloorplanStampFields {
  const rawUnit = layout.unitLabel?.trim() || fallbackTitle?.trim() || "";
  // "דירה 14" and "14" both arrive; keep the digits so the caption reads once.
  const unit = rawUnit.replace(/^דירה\s*/u, "").trim();
  return {
    unitLabel: unit || undefined,
    areaM2: layout.grossAreaM2 && layout.grossAreaM2 > 0 ? layout.grossAreaM2 : undefined,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStampCaption(fields: FloorplanStampFields): string {
  const parts: string[] = [];
  if (fields.unitLabel) parts.push(`דירה ${fields.unitLabel}`);
  if (fields.areaM2 != null) parts.push(`${fields.areaM2.toFixed(2)} מ"ר`);
  return parts.join("  ·  ");
}

/**
 * librsvg draws SVG text as LTR. A Hebrew run stored logically comes out
 * backwards on the bar. Reverse only for the SVG overlay — the caption string
 * itself stays readable in tests and in the HTML booklet.
 */
export function forSvgHebrew(text: string): string {
  return Array.from(text).reverse().join("");
}

export type StampRun = {
  text: string;
  x: number;
  anchor: "start";
  hebrew?: boolean;
};

/** Reading order is right-to-left: the first run sits against the right edge. */
export function placeRtlRuns(
  runs: Array<{ text: string; hebrew?: boolean }>,
  rightX: number,
  fontSize: number,
): StampRun[] {
  let x = rightX;
  const placed: StampRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const em = run.hebrew ? HE_CHAR_EM : LATIN_CHAR_EM;
    const width = run.text.length * fontSize * em;
    x -= width;
    placed.push({
      text: run.text,
      x: Math.round(x),
      anchor: "start",
      hebrew: run.hebrew,
    });
    x -= fontSize * 0.35;
  }
  return placed;
}

export function captionRuns(fields: FloorplanStampFields, rightX: number, fontSize: number): StampRun[] {
  const runs: Array<{ text: string; hebrew?: boolean }> = [];
  if (fields.unitLabel) {
    runs.push({ text: "דירה", hebrew: true });
    runs.push({ text: fields.unitLabel });
  }
  if (fields.areaM2 != null) {
    if (runs.length) runs.push({ text: "·" });
    runs.push({ text: fields.areaM2.toFixed(2) });
    runs.push({ text: 'מ"ר', hebrew: true });
  }
  return placeRtlRuns(runs, rightX, fontSize);
}

const CREDIT_HE = "הופק על ידי מערכת";
const CREDIT_MARK = "BSD-YBM";

/**
 * The credit is drawn as two separate runs, not one mixed-script string.
 *
 * "הופק על ידי מערכת BSD-YBM" in a single text element came out with the
 * Hebrew words in reverse reading order and the Latin mark on the wrong side —
 * the renderer reorders script runs but not the words inside the Hebrew one.
 * Splitting the runs and placing them by hand removes anything for bidi to get
 * wrong: Hebrew on the right, the mark to its left, which is the reading order.
 *
 * Widths are estimated rather than measured. Only the gap between the two runs
 * depends on the estimate, so being a few percent out moves the mark slightly,
 * never past the Hebrew.
 */
const HE_CHAR_EM = 0.5;
const LATIN_CHAR_EM = 0.6;

/** Right-to-left: the Hebrew phrase, then the Latin mark to its left. */
export function creditRunLayout(centreX: number, fontSize: number) {
  const heWidth = CREDIT_HE.length * fontSize * HE_CHAR_EM;
  const markWidth = CREDIT_MARK.length * fontSize * LATIN_CHAR_EM;
  const gap = fontSize * 0.45;
  const total = heWidth + gap + markWidth;
  return {
    hebrew: { text: CREDIT_HE, x: Math.round(centreX + total / 2), anchor: "end" as const },
    mark: { text: CREDIT_MARK, x: Math.round(centreX - total / 2), anchor: "start" as const },
  };
}

function registerStampFonts(GlobalFonts: {
  has: (name: string) => boolean;
  register: (font: Buffer, name?: string) => unknown;
  registerFromPath: (path: string, name?: string) => unknown;
}): void {
  const winBold = "C:\\Windows\\Fonts\\arialbd.ttf";
  const winReg = "C:\\Windows\\Fonts\\arial.ttf";
  if (existsSync(winBold) && !GlobalFonts.has("BookletStampBold")) {
    GlobalFonts.registerFromPath(winBold, "BookletStampBold");
  }
  if (existsSync(winReg) && !GlobalFonts.has("BookletStamp")) {
    GlobalFonts.registerFromPath(winReg, "BookletStamp");
  }
  if (GlobalFonts.has("BookletStamp") && GlobalFonts.has("BookletStampBold")) return;
  const { regular, bold } = loadPdfFontBuffers();
  const dir = tmpdir();
  const boldPath = path.join(dir, "booklet-stamp-bold.ttf");
  const regPath = path.join(dir, "booklet-stamp.ttf");
  if (!existsSync(boldPath)) writeFileSync(boldPath, bold);
  if (!existsSync(regPath)) writeFileSync(regPath, regular);
  if (!GlobalFonts.has("BookletStampBold")) GlobalFonts.registerFromPath(boldPath, "BookletStampBold");
  if (!GlobalFonts.has("BookletStamp")) GlobalFonts.registerFromPath(regPath, "BookletStamp");
}

/**
 * librsvg draws SVG Hebrew backwards. Skia (canvas) shapes RTL correctly
 * when the font actually contains Hebrew glyphs — Arial on Windows, Noto on Linux.
 */
async function paintStampBar(
  width: number,
  barHeight: number,
  fields: FloorplanStampFields,
): Promise<Buffer | null> {
  try {
    const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
    registerStampFonts(GlobalFonts);
    const canvas = createCanvas(width, barHeight);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(0, 0, width, barHeight);
    const pad = Math.round(width * 0.04);
    const mainSize = Math.round(barHeight * 0.4);
    const creditSize = Math.round(barHeight * 0.27);
    const mid = barHeight / 2;
    ctx.textBaseline = "middle";
    const caption = buildStampCaption(fields);
    if (caption) {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#faf7f2";
      ctx.font = `bold ${mainSize}px BookletStampBold`;
      ctx.fillText(caption, width - pad, mid);
    }
    ctx.direction = "rtl";
    ctx.textAlign = "left";
    ctx.fillStyle = "#c8c2b8";
    ctx.font = `${creditSize}px BookletStamp`;
    ctx.fillText(`${CREDIT_HE} ${CREDIT_MARK}`, pad, mid);
    return Buffer.from(canvas.toBuffer("image/png"));
  } catch (err: unknown) {
    log.warn("canvas stamp unavailable, falling back to SVG", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Composites the caption bar onto the bottom of a still.
 *
 * Returns the original bytes unchanged if anything goes wrong: a missing caption
 * is a cosmetic loss, while failing the whole generation over one would throw
 * away a still that cost real image-model calls.
 */
export async function stampFloorplanStill(
  image: { base64: string; mimeType: string },
  fields: FloorplanStampFields,
): Promise<{ base64: string; mimeType: string }> {
  const caption = buildStampCaption(fields);
  try {
    const input = Buffer.from(image.base64, "base64");
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 200 || height < 200) return image;

    const barHeight = Math.round(height * 0.062);
    const painted = await paintStampBar(width, barHeight, fields);
    const overlay =
      painted ??
      (() => {
        const mainSize = Math.round(barHeight * 0.4);
        const creditSize = Math.round(barHeight * 0.27);
        const baseline = Math.round(barHeight * 0.5 + mainSize * 0.36);
        const creditBaseline = Math.round(barHeight * 0.5 + creditSize * 0.36);
        const pad = Math.round(width * 0.04);
        const captionPlaced = captionRuns(fields, width - pad, mainSize);
        const creditPlaced = placeRtlRuns(
          [
            { text: CREDIT_HE, hebrew: true },
            { text: CREDIT_MARK },
          ],
          caption ? Math.round(width * 0.36) : width - pad,
          creditSize,
        );
        return Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barHeight}">` +
            `<rect width="100%" height="100%" fill="#1c1917"/>` +
            captionPlaced
              .map(
                (run) =>
                  `<text x="${run.x}" y="${baseline}" ` +
                  `font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${mainSize}" ` +
                  `font-weight="600" fill="#faf7f2" text-anchor="${run.anchor}">${escapeXml(run.text)}</text>`,
              )
              .join("") +
            creditPlaced
              .map(
                (run) =>
                  `<text x="${run.x}" y="${creditBaseline}" ` +
                  `font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${creditSize}" ` +
                  `fill="#c8c2b8" text-anchor="${run.anchor}">${escapeXml(run.text)}</text>`,
              )
              .join("") +
            `</svg>`,
        );
      })();

    const out = await sharp({
      create: {
        width,
        height: height + barHeight,
        channels: 3,
        background: "#1c1917",
      },
    })
      .composite([
        { input, top: 0, left: 0 },
        { input: overlay, top: height, left: 0 },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch (err: unknown) {
    log.warn("stamp failed, shipping the unstamped still", {
      error: err instanceof Error ? err.message : String(err),
    });
    return image;
  }
}

/** Drop previous caption bars so a still can be stamped again. */
export async function stripStampBar(jpeg: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width < 200 || height < 200) return jpeg;
  let cut = 0;
  const step = 4;
  for (let y = height - 1; y >= Math.floor(height * 0.72); y -= 1) {
    let luma = 0;
    let samples = 0;
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels;
      samples += 1;
      luma += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    }
    if (samples > 0 && luma / samples < 95) cut += 1;
    else break;
  }
  if (cut < 8) return jpeg;
  return sharp(jpeg)
    .extract({ left: 0, top: 0, width, height: height - cut })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
