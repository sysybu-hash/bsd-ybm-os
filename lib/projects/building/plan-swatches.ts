import sharp from "sharp";

import type { Primitive } from "./model";

/**
 * A storey's floor finishes as swatches cut from its own measured plan: each
 * finish handed to the painter beside the plan, as a reference to hold. On
 * the plan of Gottlieb C floor 1 (15/10/2026) a room and its mirror in the
 * other home came back painted oak and pale stone.
 */
export type PlanFinish = { material: string; x0: number; z0: number; x1: number; z1: number };
export type PlanSwatchRoom = { kind: string; x: number; z: number; w: number; d: number };
export type PlanSwatch = { material: string; rooms: string[]; image: Buffer };

/** The finishes laid on a storey's rooms (`<floor>:inside:finish`), in metres on the plan. */
export function storeyFinishes(primitives: readonly Primitive[], floorId: string): PlanFinish[] {
  const tag = `${floorId}:inside:finish`;
  return primitives.flatMap((p) =>
    p.type === "box" && p.tag === tag
      ? [{ material: p.material, x0: p.centre.x - p.size.x / 2, z0: p.centre.z - p.size.z / 2, x1: p.centre.x + p.size.x / 2, z1: p.centre.z + p.size.z / 2 }]
      : [],
  );
}

/** What stands on a storey's floor — furniture, the stair, walls — seen from above: no swatch is cut where it is. */
export function storeyCover(primitives: readonly Primitive[], floorId: string): Array<Omit<PlanFinish, "material">> {
  const under = new Set(["inside:finish", "inside:ceiling", "slab", "floor", "balcony"].map((t) => `${floorId}:${t}`));
  return primitives.flatMap((p) =>
    p.type === "box" && p.tag?.startsWith(`${floorId}:`) && !under.has(p.tag)
      ? [{ x0: p.centre.x - p.size.x / 2, z0: p.centre.z - p.size.z / 2, x1: p.centre.x + p.size.x / 2, z1: p.centre.z + p.size.z / 2 }]
      : [],
  );
}

const area = (f: PlanFinish) => (f.x1 - f.x0) * (f.z1 - f.z0);

/**
 * One swatch a finish, the largest first, at most `most`: from each finish's
 * largest piece, the square of plain floor in it — the one nearest the piece's
 * median colour and least varied, so not a bed or a table standing on it.
 * The plan is framed on its sheet: a metre is `width / metresWide` pixels, from `shift`.
 */
export async function planSwatches(
  render: Buffer,
  finishes: readonly PlanFinish[],
  frame: { metresWide: number; shift?: { x: number; y: number }; rooms?: readonly PlanSwatchRoom[]; cover?: ReadonlyArray<Omit<PlanFinish, "material">> },
  options?: { size?: number; most?: number },
): Promise<PlanSwatch[]> {
  const size = options?.size ?? 256;
  const { data, info } = await sharp(render).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const k = W / frame.metresWide;
  const shift = frame.shift ?? { x: 0, y: 0 };
  const cover = (frame.cover ?? []).map((c) => ({ x0: (c.x0 - shift.x) * k, y0: (c.z0 - shift.y) * k, x1: (c.x1 - shift.x) * k, y1: (c.z1 - shift.y) * k }));
  const byMaterial = new Map<string, PlanFinish[]>();
  for (const f of finishes) byMaterial.set(f.material, [...(byMaterial.get(f.material) ?? []), f]);
  const order = [...byMaterial].sort((a, b) => b[1].reduce((s, f) => s + area(f), 0) - a[1].reduce((s, f) => s + area(f), 0));
  const out: PlanSwatch[] = [];
  for (const [material, pieces] of order) {
    if (out.length >= (options?.most ?? 6)) break;
    const square = [...pieces].sort((a, b) => area(b) - area(a)).map((f) => plainSquare(data, W, H, f, k, shift, cover)).find((s) => s != null);
    if (!square) continue;
    const image = await sharp(data, { raw: { width: W, height: H, channels: 3 } })
      .extract(square)
      .resize(size, size, { kernel: "lanczos3" })
      .jpeg({ quality: 92 })
      .toBuffer();
    const rooms = [...new Set(
      (frame.rooms ?? [])
        .filter((r) => pieces.some((f) => within(r, (f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2)))
        .map((r) => (r.kind === "mmd" ? "safe room" : r.kind.replace(/_/g, " ")))
        // Oak boards are bedrooms only — never label circulation/wet rooms as oak (Gottlieb C: invented stairs by WC).
        .filter((r) => material !== "floorOak" || !/circulation|bathroom|kitchen|laundry|toilet|other|living/.test(r)),
    )];
    out.push({ material, rooms, image });
  }
  return out;
}

const within = (r: PlanSwatchRoom, x: number, z: number) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;

/** The plainest square inside a finish's piece, its edges kept off (a wall's shadow, a skirting); null where the piece is too small. */
function plainSquare(
  data: Buffer,
  W: number,
  H: number,
  f: PlanFinish,
  k: number,
  shift: { x: number; y: number },
  cover: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>,
) {
  const [px0, px1] = [(f.x0 - shift.x) * k, (f.x1 - shift.x) * k];
  const [pz0, pz1] = [(f.z0 - shift.y) * k, (f.z1 - shift.y) * k];
  const inset = 0.15;
  const x0 = Math.max(0, Math.round(px0 + (px1 - px0) * inset));
  const x1 = Math.min(W, Math.round(px1 - (px1 - px0) * inset));
  const y0 = Math.max(0, Math.round(pz0 + (pz1 - pz0) * inset));
  const y1 = Math.min(H, Math.round(pz1 - (pz1 - pz0) * inset));
  const most = Math.min(96, x1 - x0, y1 - y0);
  if (most < 24) return null;
  const near = cover.filter((c) => c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1);
  const covered = (left: number, top: number, side: number) => near.some((c) => c.x1 > left && c.x0 < left + side && c.y1 > top && c.y0 < top + side);
  const luma = (x: number, y: number) => {
    const i = (y * W + x) * 3;
    return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  };
  const all: number[] = [];
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) all.push(luma(x, y));
  all.sort((a, b) => a - b);
  const median = all[all.length >> 1]!;
  // The largest square that is plain floor; smaller where furniture leaves no larger one clear.
  type Square = { left: number; top: number; side: number; score: number };
  let best: Square | null = null;
  for (const side of [96, 64, 48, 32, 24].filter((s) => s <= most)) {
    const step = Math.max(2, side >> 3);
    let here: Square | null = null;
    for (let top = y0; top + side <= y1; top += step) {
      for (let left = x0; left + side <= x1; left += step) {
        if (covered(left, top, side)) continue;
        let [s, s2, n] = [0, 0, 0];
        for (let y = top; y < top + side; y += 3) {
          for (let x = left; x < left + side; x += 3) {
            const v = luma(x, y);
            s += v;
            s2 += v * v;
            n++;
          }
        }
        const mean = s / n;
        const score = 2 * Math.abs(mean - median) + Math.sqrt(Math.max(0, s2 / n - mean * mean));
        if (!here || score < here.score) here = { left, top, side, score };
      }
    }
    if (here && (!best || here.score < best.score)) best = here;
    if (best && best.score <= PLAIN) break;
  }
  return best ? { left: best.left, top: best.top, width: best.side, height: best.side } : null;
}

/** A square this plain (its luma off the piece's median twice over, plus its spread) is floor alone. */
const PLAIN = 12;

/**
 * The swatches told to the painter: images `first`… after the plan, image
 * `plan`. A finish's material held where the plan lays it, the two homes alike.
 */
export function swatchPrompt(swatches: readonly PlanSwatch[], first: number, plan: number): string {
  const last = first + swatches.length - 1;
  const which = swatches.map((s, i) => `image ${first + i}: the floor of the ${s.rooms.length ? s.rooms.join(", ") : "rooms floored like it"}`).join("; ");
  return [
    `FLOOR MATERIALS: ${swatches.length === 1 ? `image ${first} is a swatch` : `images ${first}–${last} are swatches`} of the floor finishes, each cut from image ${plan}'s own floor (${which}).`,
    `Every floor image ${plan} shows in a swatch's finish is painted in exactly that material — its colour, tone and pattern, photoreal — and the two homes' mirrored rooms are floored identically. A swatch is a reference only: never draw it, a frame or a label into the plan.`,
    `The floorOak swatch is for bedrooms only: never use oak boards or oak tread bands in bathrooms, in WC vestibules, or anywhere image ${plan} shows pale porcelain or grey wet-room tile.`,
  ].join("\n");
}
