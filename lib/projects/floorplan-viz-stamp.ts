import sharp from "sharp";

import { createLogger } from "@/lib/logger";
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

    // Scaled off the frame so the bar reads the same on a 768px still and a
    // 1400px one.
    const barHeight = Math.round(height * 0.062);
    const mainSize = Math.round(barHeight * 0.4);
    const creditSize = Math.round(barHeight * 0.27);
    // Centre-anchored on purpose. librsvg inverts what text-anchor start and end
    // mean once direction is rtl, which pushed both captions off opposite edges
    // of the bar; middle means the same thing in either direction.
    const baseline = Math.round(barHeight * 0.5 + mainSize * 0.36);
    const creditBaseline = Math.round(barHeight * 0.5 + creditSize * 0.36);

    const credit = creditRunLayout(Math.round(width * (caption ? 0.28 : 0.5)), creditSize);
    const creditRuns = [credit.hebrew, credit.mark];

    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barHeight}">` +
        `<rect width="100%" height="100%" fill="#1c1917"/>` +
        (caption
          ? `<text x="${Math.round(width * 0.72)}" y="${baseline}" ` +
            `font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${mainSize}" ` +
            `font-weight="600" fill="#faf7f2" text-anchor="middle">${escapeXml(caption)}</text>`
          : "") +
        creditRuns
          .map(
            (run) =>
              `<text x="${run.x}" y="${creditBaseline}" ` +
              `font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${creditSize}" ` +
              `fill="#c8c2b8" text-anchor="${run.anchor}">${escapeXml(run.text)}</text>`,
          )
          .join("") +
        `</svg>`,
    );

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
