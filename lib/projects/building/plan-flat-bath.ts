/**
 * Diff-based post-paint fix for invented tread bands beside toilets.
 * Only pixels that are flat pale floor in the measured plan and look like
 * steps/oak in the paint are rewritten — never whole rooms as solid blocks.
 */
import sharp from "sharp";

import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";

export type PlanFlatBathRoom = {
  kind: string;
  name?: string;
  areaM2?: number;
  x: number;
  z: number;
  w: number;
  d: number;
};

export type PlanFlatBathFloor = {
  shift?: { x: number; y: number };
  sheetWidth: number;
  rooms?: readonly PlanFlatBathRoom[];
};

const luma = (buf: Buffer, i: number) => 0.299 * buf[i]! + 0.587 * buf[i + 1]! + 0.114 * buf[i + 2]!;

const isFixtureWhite = (buf: Buffer, i: number) =>
  buf[i]! > 232 && buf[i + 1]! > 232 && buf[i + 2]! > 228 && Math.abs(buf[i]! - buf[i + 1]!) < 12;

const isOakish = (buf: Buffer, i: number) => {
  const r = buf[i]!;
  const g = buf[i + 1]!;
  const b = buf[i + 2]!;
  return r > 145 && g > 105 && b < 125 && r > b + 28 && r >= g;
};

export function flatBathRooms(rooms: readonly PlanFlatBathRoom[] | undefined): PlanFlatBathRoom[] {
  const list = rooms ?? [];
  const baths = list.filter((r) => /bathroom|toilet|wc|רחצה|שירות/i.test(`${r.kind} ${r.name ?? ""}`));
  const circBeside = list.filter((r) => {
    if (!/circulation|מסדרון|corridor|vestibule/i.test(`${r.kind} ${r.name ?? ""}`)) return false;
    return baths.some((b) => {
      const overlapX = r.x < b.x + b.w + 0.5 && r.x + r.w > b.x - 0.5;
      const overlapZ = r.z < b.z + b.d + 0.5 && r.z + r.d > b.z - 0.5;
      return overlapX && overlapZ;
    });
  });
  return [...baths, ...circBeside];
}

function dVert(buf: Buffer, W: number, x: number, y: number): number {
  if (y <= 0) return 0;
  const i = (y * W + x) * 3;
  const j = ((y - 1) * W + x) * 3;
  return Math.abs(buf[i]! - buf[j]!) + Math.abs(buf[i + 1]! - buf[j + 1]!) + Math.abs(buf[i + 2]! - buf[j + 2]!);
}

function dHoriz(buf: Buffer, W: number, x: number, y: number): number {
  if (x <= 0) return 0;
  const i = (y * W + x) * 3;
  const j = (y * W + x - 1) * 3;
  return Math.abs(buf[i]! - buf[j]!) + Math.abs(buf[i + 1]! - buf[j + 1]!) + Math.abs(buf[i + 2]! - buf[j + 2]!);
}

/** Strong horizontal tread edge across a short run of the row. */
function stepEdgeAt(buf: Buffer, W: number, x: number, y: number): boolean {
  let strong = 0;
  let n = 0;
  for (let dx = -6; dx <= 6; dx++) {
    const xx = x + dx;
    if (xx <= 0 || xx >= W) continue;
    n++;
    if (dVert(buf, W, xx, y) > 22) strong++;
  }
  return n > 0 && strong / n >= 0.4;
}

export async function flattenBathFloors(
  paintedJpeg: Buffer,
  measuredJpeg: Buffer,
  floor: PlanFlatBathFloor,
  options?: { padM?: number },
): Promise<{ image: Buffer; patched: number; rooms: number }> {
  const targets = flatBathRooms(floor.rooms);
  if (!targets.length) return { image: paintedJpeg, patched: 0, rooms: 0 };

  const painted = await sharp(paintedJpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const measuredSrc = await sharp(measuredJpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = painted.info.width;
  const H = painted.info.height;
  const measured = await sharp(measuredSrc.data, {
    raw: { width: measuredSrc.info.width, height: measuredSrc.info.height, channels: 3 },
  })
    .resize(W, H, { kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const k = W / (floor.sheetWidth / DWF_FLOOR_UNITS_PER_METRE);
  const shift = floor.shift ?? { x: 0, y: 0 };
  const pad = options?.padM ?? 0.35;
  const out = Buffer.from(painted.data);
  let patched = 0;

  for (const r of targets) {
    const left = Math.max(0, Math.round((r.x - pad - shift.x) * k));
    const top = Math.max(0, Math.round((r.z - pad - shift.y) * k));
    const width = Math.min(W - left, Math.round((r.w + 2 * pad) * k));
    const height = Math.min(H - top, Math.round((r.d + 2 * pad) * k));

    const samples: number[][] = [];
    for (let y = top + 2; y < top + height - 2; y++) {
      for (let x = left + 2; x < left + width - 2; x++) {
        const i = (y * W + x) * 3;
        if (isFixtureWhite(painted.data, i) || isOakish(painted.data, i)) continue;
        if (stepEdgeAt(painted.data, W, x, y)) continue;
        if (dVert(painted.data, W, x, y) > dHoriz(painted.data, W, x, y) * 1.3) continue;
        const L = luma(painted.data, i);
        if (L < 155 || L > 215) continue;
        samples.push([painted.data[i]!, painted.data[i + 1]!, painted.data[i + 2]!]);
      }
    }
    const [tr, tg, tb] =
      samples.length >= 25
        ? (() => {
            samples.sort((a, b) => a[0]! + a[1]! + a[2]! - (b[0]! + b[1]! + b[2]!));
            return samples[samples.length >> 1]!;
          })()
        : [205, 190, 172];

    for (let y = top + 1; y < top + height - 1; y++) {
      for (let x = left + 1; x < left + width - 1; x++) {
        const i = (y * W + x) * 3;
        if (isFixtureWhite(painted.data, i) || isFixtureWhite(measured.data, i)) continue;

        const mL = luma(measured.data, i);
        if (mL < 145 || mL > 235) continue;
        // Measured must not itself look like a tread edge
        if (stepEdgeAt(measured.data, W, x, y)) continue;

        const invent =
          isOakish(painted.data, i) ||
          stepEdgeAt(painted.data, W, x, y) ||
          (dVert(painted.data, W, x, y) > 28 && dVert(painted.data, W, x, y) > dHoriz(painted.data, W, x, y) * 1.4);
        if (!invent) continue;

        out[i] = Math.round(painted.data[i]! * 0.2 + tr! * 0.8);
        out[i + 1] = Math.round(painted.data[i + 1]! * 0.2 + tg! * 0.8);
        out[i + 2] = Math.round(painted.data[i + 2]! * 0.2 + tb! * 0.8);
        patched++;
      }
    }
  }

  const image = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  return { image, patched, rooms: targets.length };
}
