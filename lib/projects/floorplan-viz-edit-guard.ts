import sharp from "sharp";

import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-viz-edit-guard");

/**
 * How much of the frame an edit was allowed to touch.
 *
 * "Swap this door for a window" is a few hundred pixels. When an edit comes
 * back with most of the frame different, the model did not edit the still —
 * it drew a new picture, and shipping that costs the user the frame they had
 * already paid for and approved. This measures the change and lets the caller
 * refuse, which is cheaper and far more honest than storing the wreck and
 * asking the user to undo it.
 *
 * Deliberately a pixel measure, not another paid auditor call: an edit that
 * restages the apartment is obvious at 128 pixels wide.
 */

/**
 * Small and blurred on purpose. A faithful edit is still a fresh render, so
 * wood grain, rug pile and shelf clutter come back different pixel by pixel
 * even where nothing moved. Blurring at 64 pixels wide throws that texture
 * away and leaves the thing being measured: where the walls, rooms and
 * furniture blocks sit in the frame.
 */
const SAMPLE_WIDTH = 64;
const SAMPLE_BLUR = 1.5;
/** Per-channel difference that counts as "this part of the frame changed". */
const PIXEL_DELTA = 32;

export type EditChange = {
  /** Fraction of the frame whose pixels moved, 0..1. */
  changed: number;
};

async function sample(base64: string, height: number): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(base64, "base64"))
      .resize(SAMPLE_WIDTH, height, { fit: "fill" })
      .blur(SAMPLE_BLUR)
      .removeAlpha()
      .raw()
      .toBuffer();
  } catch (err: unknown) {
    log.warn("edit change measure skipped; frame did not decode", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function measureEditChange(
  before: { base64: string },
  after: { base64: string },
): Promise<EditChange | null> {
  const meta = await sharp(Buffer.from(before.base64, "base64"))
    .metadata()
    .catch(() => null);
  if (!meta?.width || !meta.height) return null;
  const height = Math.max(16, Math.round((SAMPLE_WIDTH * meta.height) / meta.width));
  const [a, b] = await Promise.all([sample(before.base64, height), sample(after.base64, height)]);
  if (!a || !b || a.length !== b.length || a.length === 0) return null;

  let moved = 0;
  const pixels = a.length / 3;
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    const d =
      Math.abs(a[o]! - b[o]!) + Math.abs(a[o + 1]! - b[o + 1]!) + Math.abs(a[o + 2]! - b[o + 2]!);
    if (d / 3 > PIXEL_DELTA) moved += 1;
  }
  return { changed: moved / pixels };
}

/**
 * A whole-frame edit is allowed to move a lot — new flooring is a legitimate
 * request — but not nearly everything. Above this the still has been replaced
 * rather than edited.
 */
export const EDIT_REDRAW_LIMIT = 0.7;

export function editRedrewTheFrame(change: EditChange | null): boolean {
  return change != null && change.changed > EDIT_REDRAW_LIMIT;
}
