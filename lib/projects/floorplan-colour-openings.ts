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

/**
 * Scale from the doorways themselves.
 *
 * The dimension chains have to be read by a model, and it reads them a little
 * differently each time: 31.1 units per metre on one run and 24.5 on the next,
 * where the sheet says 29.2, and a flat drawn at 24.5 has rooms the size of
 * cupboards. The doorways are measured rather than read — eleven of them on
 * 28-8-23-2 — and an internal door in Israel is 80 cm, which makes their
 * median a ruler: 23.4 units per door, 29.3 units per metre, within one per
 * cent of the chains' own figure.
 *
 * Two passes, because finding the doorways needs a scale to sieve by width:
 * a rough one first, then the same question again at the answer.
 */
const STANDARD_DOOR_M = 0.8;
const MIN_DOORWAYS_FOR_SCALE = 5;

type DoorwayScale = { unitsPerMetre: number; doorways: number; spread: number };

/** One pass: what scale the doorways imply, when sieved at this one. */
async function doorwayScaleAt(
  pdf: Buffer | Uint8Array,
  page: { width: number },
  unitsPerMetre: number,
): Promise<DoorwayScale | null> {
  const found = await readColouredDoorways(pdf, page, unitsPerMetre);
  if (found.length < MIN_DOORWAYS_FOR_SCALE) return null;
  const widths = found.map((d) => d.to - d.from).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  if (!(median > 0)) return null;
  const low = widths[Math.floor(widths.length * 0.25)]!;
  const high = widths[Math.floor(widths.length * 0.75)]!;
  return {
    unitsPerMetre: median / STANDARD_DOOR_M,
    doorways: found.length,
    // How tightly the doors agree with each other. Doors are all much of a
    // size; a sieve at the wrong scale lets in window strips and wall stubs,
    // and they do not agree at all.
    spread: (high - low) / median,
  };
}

export async function scaleFromDoorways(
  pdf: Buffer | Uint8Array,
  page: { width: number },
  seeds: number[],
): Promise<DoorwayScale | null> {
  const settled: DoorwayScale[] = [];
  for (const seed of seeds) {
    if (!(seed > 0)) continue;
    let scale = seed;
    let last: DoorwayScale | null = null;
    // A sieve needs a scale and the scale comes from the sieve, so this is a
    // fixed point: iterate until the answer stops moving, and keep it only if
    // it does. A seed far from the truth wanders and is dropped.
    for (let pass = 0; pass < 5; pass += 1) {
      const step = await doorwayScaleAt(pdf, page, scale);
      if (!step) break;
      const settledHere = Math.abs(step.unitsPerMetre - scale) / scale < 0.02;
      scale = step.unitsPerMetre;
      last = step;
      if (settledHere) {
        settled.push(step);
        break;
      }
    }
    void last;
  }
  if (settled.length === 0) return null;
  // Among the fixed points, the one whose doors agree best with each other.
  return settled.reduce((best, cur) => (cur.spread < best.spread ? cur : best));
}
