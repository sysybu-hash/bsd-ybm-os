import sharp from "sharp";

import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";

/**
 * Whether the finished still still contains what the geometry drew.
 *
 * The auditor is a vision model counting objects, and a frame that turned the
 * living-room suite into a length of wall has the right number of everything.
 * One such frame scored 0 and would have shipped; another lost four of six
 * dining chairs and all four island stools and scored 1.
 *
 * The geometry render and the finish are the same picture, so the question can
 * be asked of the pixels instead: for each block the geometry drew, is there
 * something standing there in the finish, or is that patch of floor bare? A
 * rendered object differs from the boards around it — in colour, in brightness,
 * or in the shadow it casts — and a block that vanished does not.
 *
 * This is not a likeness test. It cannot say the chair is a good chair, only
 * that the chair is there, which is the failure that was shipping.
 */
export type BlockFidelity = {
  kind: FurniturePiece["kind"];
  present: boolean;
  /** How far the block's patch stands out from the ring of floor around it. */
  contrast: number;
};

export type FidelityReport = {
  blocks: BlockFidelity[];
  /** Missing blocks by kind, for the grader to name. */
  missing: Partial<Record<FurniturePiece["kind"], number>>;
  present: number;
  total: number;
};

/**
 * Mean colour of a rectangle.
 *
 * Colour, not brightness. A dark oak dining table standing on dark oak boards
 * is within a shade of them in luminance and plainly a different thing in hue,
 * and measuring the grey alone reported דירה 14's table as missing when it was
 * there in front of me.
 */
function patch(
  data: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { r: number; g: number; b: number; n: number } {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  const left = Math.max(0, Math.floor(x0));
  const right = Math.min(width - 1, Math.ceil(x1));
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.min(height - 1, Math.ceil(y1));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 3;
      sr += data[i]!;
      sg += data[i + 1]!;
      sb += data[i + 2]!;
      n++;
    }
  }
  return n > 0
    ? { r: sr / n, g: sg / n, b: sb / n, n }
    : { r: 0, g: 0, b: 0, n: 0 };
}

export async function measureBlockFidelity(input: {
  /** The deterministic render, as written to disk. */
  geometry: Buffer;
  /** The finished frame. A caption bar below the drawing is cropped off. */
  still: Buffer;
  furniture: FurniturePiece[];
  /** The frame the geometry was drawn in, in drawing units. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Padding renderFlatSvg leaves round the bounds. */
  paddingUnits?: number;
  /** Below this the patch is indistinguishable from the floor round it. */
  minContrast?: number;
}): Promise<FidelityReport> {
  const pad = input.paddingUnits ?? 30;
  const minContrast = input.minContrast ?? 6;
  const empty: FidelityReport = {
    blocks: [],
    missing: {},
    present: 0,
    total: 0,
  };
  if (input.furniture.length === 0) return empty;

  const geoMeta = await sharp(input.geometry).metadata();
  const stillMeta = await sharp(input.still).metadata();
  if (!geoMeta.width || !geoMeta.height || !stillMeta.width || !stillMeta.height) {
    return empty;
  }

  // The still carries a caption bar under the drawing; the drawing itself keeps
  // the geometry's aspect, which is what locates it.
  const drawingHeight = Math.min(
    stillMeta.height,
    Math.round((stillMeta.width * geoMeta.height) / geoMeta.width),
  );
  const { data, info } = await sharp(input.still)
    .extract({ left: 0, top: 0, width: stillMeta.width, height: drawingHeight })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Drawing units to pixels of that crop.
  const frameW = input.bounds.width + pad * 2;
  const frameH = input.bounds.height + pad * 2;
  const originX = input.bounds.x - pad;
  const originY = input.bounds.y - pad;
  const sx = info.width / frameW;
  const sy = info.height / frameH;

  const blocks: BlockFidelity[] = [];
  const missing: Partial<Record<FurniturePiece["kind"], number>> = {};

  for (const piece of input.furniture) {
    const x0 = (piece.x - originX) * sx;
    const y0 = (piece.y - originY) * sy;
    const x1 = (piece.x + piece.w - originX) * sx;
    const y1 = (piece.y + piece.h - originY) * sy;
    const inside = patch(data, info.width, info.height, x0, y0, x1, y1);
    // A ring of floor just outside it, at half the block's own size.
    const grow = Math.max(3, Math.min(x1 - x0, y1 - y0) * 0.5);
    const outer = patch(
      data,
      info.width,
      info.height,
      x0 - grow,
      y0 - grow,
      x1 + grow,
      y1 + grow,
    );
    if (inside.n === 0 || outer.n <= inside.n) {
      blocks.push({ kind: piece.kind, present: true, contrast: 0 });
      continue;
    }
    // The ring alone, with the block's own pixels taken back out of it.
    const ringOnly = (a: number, b: number) =>
      (a * outer.n - b * inside.n) / (outer.n - inside.n);
    const contrast = Math.max(
      Math.abs(inside.r - ringOnly(outer.r, inside.r)),
      Math.abs(inside.g - ringOnly(outer.g, inside.g)),
      Math.abs(inside.b - ringOnly(outer.b, inside.b)),
    );
    const present = contrast >= minContrast;
    blocks.push({ kind: piece.kind, present, contrast });
    if (!present) missing[piece.kind] = (missing[piece.kind] ?? 0) + 1;
  }

  return {
    blocks,
    missing,
    present: blocks.filter((b) => b.present).length,
    total: blocks.length,
  };
}

/** What the grader should say about it, or nothing when every block is there. */
export function fidelityFailures(report: FidelityReport): string[] {
  const out: string[] = [];
  for (const [kind, count] of Object.entries(report.missing)) {
    const total = report.blocks.filter((b) => b.kind === kind).length;
    out.push(`${count} of ${total} ${kind} block(s) missing from the still`);
  }
  return out;
}
