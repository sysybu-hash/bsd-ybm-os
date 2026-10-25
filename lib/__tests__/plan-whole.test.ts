import sharp from "sharp";

import { atPaintingScale, pageAround, PLAN_WHOLE_MAX_SCALE, streetKerb, wholeParts, type PlanLayout } from "@/lib/projects/building/plan-tiles";

const fill = (w: number, h: number, rgb: [number, number, number]) => {
  const b = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) b.set(rgb, i * 3);
  return b;
};
const at = (b: Buffer, w: number, x: number, y: number) => [...b.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
const rect = (b: Buffer, w: number, [x0, y0, x1, y1]: [number, number, number, number], rgb: [number, number, number]) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b.set(rgb, (y * w + x) * 3);
};
const jpeg = (b: Buffer, width: number, height: number) => sharp(b, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();

const PAGE: [number, number, number] = [226, 221, 208];
const PAVING: [number, number, number] = [120, 118, 112];

describe("plan-tiles: a whole storey's one painting", () => {
  it("is cut into every part's place, at the layout's size", async () => {
    const layout: PlanLayout = {
      width: 100,
      height: 60,
      centre: 50,
      overlap: 2,
      tiles: [
        { id: "back", left: 0, top: 0, width: 50, height: 32, mirrored: false },
        { id: "back-r", left: 50, top: 0, width: 50, height: 32, mirrored: false },
        { id: "yard-a", left: 0, top: 28, width: 50, height: 32, mirrored: false },
      ],
    };
    const painting = await jpeg(fill(200, 120, [90, 140, 60]), 200, 120);
    const parts = await wholeParts(layout, painting);
    expect(Object.keys(parts).sort()).toEqual(["back", "back-r", "yard-a"]);
    expect(await sharp(parts["yard-a"]!).metadata()).toMatchObject({ width: 50, height: 32 });
  });

  it("is composed over the render enlarged towards it, no more than twice", async () => {
    const render = await jpeg(fill(100, 60, PAGE), 100, 60);
    const mask = await sharp(fill(100, 60, [255, 255, 255]), { raw: { width: 100, height: 60, channels: 3 } }).png().toBuffer();
    const big = await atPaintingScale(render, mask, await jpeg(fill(270, 162, PAGE), 270, 162));
    expect(big.scale).toBe(PLAN_WHOLE_MAX_SCALE);
    expect(await sharp(big.render).metadata()).toMatchObject({ width: 200, height: 120 });
    expect(await sharp(big.mask).metadata()).toMatchObject({ width: 200, height: 120 });
    const same = await atPaintingScale(render, mask, await jpeg(fill(80, 48, PAGE), 80, 48));
    expect(same.scale).toBe(1);
  });
});

describe("plan-tiles: the street edge", () => {
  const [W, H] = [200, 120];

  it("lays a kerb on one straight line under the plot, cuts a bumper past it, and leaves only page beyond", () => {
    const out = fill(W, H, PAGE);
    rect(out, W, [20, 10, 180, 100], PAVING);
    // A car's bumper three pixels past the plot's edge, and a lawn ending two short of it.
    rect(out, W, [40, 100, 60, 103], [30, 30, 40]);
    rect(out, W, [120, 98, 140, 100], PAGE);
    rect(out, W, [120, 60, 140, 98], [70, 100, 30]);
    const page = pageAround(out, W, H);
    const row = streetKerb(out, page, W, H, PAGE);
    expect(row).toBe(100);
    // The kerb: pale stone across the plot's width, the car's bumper under it.
    expect(at(out, W, 30, 100)[0]).toBeGreaterThan(200);
    expect(at(out, W, 50, 101)[0]).toBeGreaterThan(160);
    // The lawn short of the edge carried down to it.
    expect(at(out, W, 130, 99)).toEqual(at(out, W, 130, 97));
    // Past the kerb, the page, shaded just under it.
    expect(at(out, W, 100, 110)).toEqual(PAGE);
    expect(at(out, W, 100, 103)[0]).toBeLessThan(PAGE[0]);
    // The plot's sides untouched.
    expect(at(out, W, 10, 50)).toEqual(PAGE);
  });

  it("does nothing where the plot does not reach the frame's foot", () => {
    const out = fill(W, H, PAGE);
    rect(out, W, [20, 10, 180, 118], PAVING);
    expect(streetKerb(out, pageAround(out, W, H), W, H, PAGE)).toBeNull();
  });
});
