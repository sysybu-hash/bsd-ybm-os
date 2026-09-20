import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";
import type { PlacedOpening } from "@/lib/projects/floorplan-wall-openings";

const log = createLogger("floorplan-marked-openings");

/**
 * The openings the sheet marks in colour, doors and windows both.
 *
 * readColouredDoorways already reads the green marks on these sheets and keeps
 * the short ones as doorways — eleven of them on 28-8-23-2, against two the
 * swing reader could find, because the swings there are single curves rather
 * than polylines. It throws the long marks away, and the long marks are what
 * this needed: the glazing.
 *
 * The long runs cannot simply be called windows, and trying that is what made
 * this worth writing down. Green on 28-8-23-2 means "new work", not "opening":
 * reading every long green run as glazing found eight windows, of which three
 * were real, two were doors counted a second time, and three were a new
 * partition wall between two bedrooms, drawn green along its whole length.
 *
 * A window is on the outside. Keeping only the long runs that lie in the
 * flat's own perimeter drops the partition and the duplicates, and what is
 * left is glazing in an outer wall — which is the thing a still has to get
 * right and has been guessing at.
 *
 * It reports what the sheet marks and nothing else: a façade the office drew
 * in plain black is not here, and inventing one would be the same mistake in
 * a new place.
 */

export type MarkedOpeningsInput = {
  page: { width: number; height: number };
  unitsPerMetre: number;
  /** The flat's own box in page units, so "outside" means this flat's outside. */
  extent: { x: number; y: number; width: number; height: number };
};

const MIN_DOOR_M = 0.55;
const MAX_DOOR_M = 1.4;
const MAX_WINDOW_M = 7;
/** An opening is a sliver across its wall, never a room-sized patch of colour. */
const MAX_DEPTH_M = 0.4;
/** How near the perimeter a run must sit to be in an outer wall. */
const OUTER_WALL_M = 0.6;

function isMarkColour(r: number, g: number, b: number): boolean {
  return g > 80 && g > r * 1.35 && g > b * 1.35;
}

type Blob = { x0: number; y0: number; x1: number; y1: number };

function overlaps(a: PlacedOpening, b: PlacedOpening): boolean {
  return (
    Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x) > 0 &&
    Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y) > 0
  );
}

/**
 * A run is in an outer wall when it lies ALONG one, not when it happens to
 * touch one. The first version asked only whether any edge of the box was
 * near the perimeter, and on 28-8-23-2 that let through the two partitions
 * that form the work room: horizontal runs across the middle of the flat
 * whose left end meets the left façade. A wall an opening sits in runs the
 * same way the opening does, so the test is on the cross axis only.
 */
export function isInOuterWall(
  box: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number },
  extent: { x: number; y: number; width: number; height: number },
  tolerance: number,
): boolean {
  const x0 = box.x * page.width;
  const y0 = box.y * page.height;
  const x1 = x0 + box.w * page.width;
  const y1 = y0 + box.h * page.height;
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  const horizontal = x1 - x0 >= y1 - y0;
  return horizontal
    ? near(y0, extent.y) ||
        near(y1, extent.y) ||
        near(y0, extent.y + extent.height) ||
        near(y1, extent.y + extent.height)
    : near(x0, extent.x) ||
        near(x1, extent.x) ||
        near(x0, extent.x + extent.width) ||
        near(x1, extent.x + extent.width);
}

export async function readMarkedOpenings(
  pdf: Buffer | Uint8Array,
  input: MarkedOpeningsInput,
  options?: { rasterWidth?: number },
): Promise<PlacedOpening[]> {
  const { page, unitsPerMetre, extent } = input;
  if (!(unitsPerMetre > 0) || !(page.width > 0) || !(page.height > 0)) return [];
  try {
    const rasterWidth = options?.rasterWidth ?? 1600;
    const jpeg = await rasterizePdfPageJpeg(pdf, rasterWidth);
    if (!jpeg) return [];
    const { data, info } = await sharp(Buffer.from(jpeg, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const channels = info.channels;
    const pxPerMetre = (w / page.width) * unitsPerMetre;
    if (!(pxPerMetre > 4)) return [];

    const mark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * channels;
      if (isMarkColour(data[o]!, data[o + 1]!, data[o + 2]!)) mark[i] = 1;
    }

    const seen = new Uint8Array(w * h);
    const blobs: Blob[] = [];
    const minPixels = Math.max(20, Math.round(pxPerMetre * 0.4));
    for (let i = 0; i < w * h; i++) {
      if (mark[i] !== 1 || seen[i] === 1) continue;
      const stack = [i];
      seen[i] = 1;
      let x0 = w;
      let x1 = 0;
      let y0 = h;
      let y1 = 0;
      let n = 0;
      while (stack.length > 0) {
        const j = stack.pop()!;
        const x = j % w;
        const y = (j - x) / w;
        n += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const around = [
          x > 0 ? j - 1 : -1,
          x < w - 1 ? j + 1 : -1,
          y > 0 ? j - w : -1,
          y < h - 1 ? j + w : -1,
        ];
        for (const k of around) {
          if (k < 0 || mark[k] !== 1 || seen[k] === 1) continue;
          seen[k] = 1;
          stack.push(k);
        }
      }
      if (n >= minPixels) blobs.push({ x0, y0, x1, y1 });
    }

    const doors: PlacedOpening[] = [];
    const windows: PlacedOpening[] = [];
    for (const blob of blobs) {
      const wM = (blob.x1 - blob.x0 + 1) / pxPerMetre;
      const hM = (blob.y1 - blob.y0 + 1) / pxPerMetre;
      const long = Math.max(wM, hM);
      const short = Math.min(wM, hM);
      if (short > MAX_DEPTH_M) continue;
      const box = {
        x: blob.x0 / w,
        y: blob.y0 / h,
        w: (blob.x1 - blob.x0 + 1) / w,
        h: (blob.y1 - blob.y0 + 1) / h,
      };
      const widthM = Math.round(long * 100) / 100;
      if (long >= MIN_DOOR_M && long <= MAX_DOOR_M) {
        doors.push({ kind: "door", widthM, box });
      } else if (long > MAX_DOOR_M && long <= MAX_WINDOW_M) {
        windows.push({ kind: "window", widthM, box });
      }
    }

    const tolerance = unitsPerMetre * OUTER_WALL_M;
    const kept = windows.filter(
      (candidate) =>
        isInOuterWall(candidate.box, page, extent, tolerance) &&
        !doors.some((door) => overlaps(candidate, door)),
    );
    log.info("openings read from the sheet's own marks", {
      doors: doors.length,
      windowsFound: windows.length,
      windowsInOuterWalls: kept.length,
    });
    return [...doors, ...kept];
  } catch (err: unknown) {
    log.warn("marked opening read failed; the still keeps whatever the model draws", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
