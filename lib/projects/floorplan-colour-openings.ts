import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";
import type { WallBody } from "@/lib/projects/floorplan-solid";

const log = createLogger("floorplan-colour-openings");

/**
 * Doorways read from the colour the office drew them in.
 *
 * A room is closed by its walls and opened by its doors, and the segmenter has
 * to put the doors back to tell one room from the next. It finds them from the
 * swing, and on a plotted sheet that fails: 28-8-23-2 draws its swings as
 * single curves rather than as polylines, so the arc reader found three doors
 * out of twelve and the shelter room, the corridor and two bedrooms came back
 * as one region.
 *
 * The same sheet marks every threshold in green. pdfjs reports that colour on
 * neither the stroke nor the fill of the path — it arrives through a colour
 * space the operator list does not resolve — so it is read where it certainly
 * exists: in the rendered page. Green blobs of a door's width, and no wider,
 * are the doorways; the long ones are windows and are left alone.
 */

export type ColouredOpening = WallBody;

const MIN_DOOR_M = 0.55;
const MAX_DOOR_M = 1.4;
/** A threshold is a sliver across the wall, not a room-sized patch of colour. */
const MAX_DEPTH_M = 0.35;

function isMarkColour(r: number, g: number, b: number): boolean {
  // Green: the convention on these sheets. Kept deliberately narrow — a grey
  // wall wash or a warm hatch must not read as a door.
  return g > 80 && g > r * 1.35 && g > b * 1.35;
}

export async function readColouredDoorways(
  pdf: Buffer | Uint8Array,
  page: { width: number },
  unitsPerMetre: number,
  options?: { rasterWidth?: number },
): Promise<ColouredOpening[]> {
  if (!(unitsPerMetre > 0) || !(page.width > 0)) return [];
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
    const pxPerUnit = w / page.width;
    const pxPerMetre = pxPerUnit * unitsPerMetre;
    if (!(pxPerMetre > 4)) return [];

    const mark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * channels;
      if (isMarkColour(data[o]!, data[o + 1]!, data[o + 2]!)) mark[i] = 1;
    }

    const seen = new Uint8Array(w * h);
    const out: ColouredOpening[] = [];
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
      if (n < minPixels) continue;

      const wM = (x1 - x0 + 1) / pxPerMetre;
      const hM = (y1 - y0 + 1) / pxPerMetre;
      const long = Math.max(wM, hM);
      const short = Math.min(wM, hM);
      if (long < MIN_DOOR_M || long > MAX_DOOR_M || short > MAX_DEPTH_M) continue;

      const horizontal = wM >= hM;
      const thickness = Math.max(unitsPerMetre * 0.14, ((horizontal ? y1 - y0 : x1 - x0) + 1) / pxPerUnit);
      out.push({
        orientation: horizontal ? "h" : "v",
        centre: horizontal ? ((y0 + y1) / 2) / pxPerUnit : ((x0 + x1) / 2) / pxPerUnit,
        thickness,
        from: horizontal ? x0 / pxPerUnit : y0 / pxPerUnit,
        to: horizontal ? x1 / pxPerUnit : y1 / pxPerUnit,
      });
    }
    log.info("doorways read from the sheet's own colour", { doorways: out.length });
    return out;
  } catch (err: unknown) {
    log.warn("coloured doorway read failed; the segmenter keeps the swings it has", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
