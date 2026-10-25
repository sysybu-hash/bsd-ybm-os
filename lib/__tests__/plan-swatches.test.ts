/**
 * @jest-environment node
 */
import sharp from "sharp";

import type { Primitive } from "@/lib/projects/building/model";
import { planSwatches, storeyCover, storeyFinishes, swatchPrompt, type PlanFinish } from "@/lib/projects/building/plan-swatches";

// A 10 m plan at 40 px a metre: oak on the left (with a dark bed at its middle), stone on the right, a small wet room.
const [W, H, K] = [400, 400, 40];
const OAK = [190, 140, 90];
const STONE = [220, 215, 205];
const WET = [150, 160, 170];
const BED = [60, 50, 40];

async function plan(): Promise<Buffer> {
  const px = Buffer.alloc(W * H * 3, 255);
  const paint = (x0: number, y0: number, x1: number, y1: number, c: number[], jitter = 0) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const j = jitter ? ((x * 7 + y * 13) % 5) - 2 : 0;
        px.set(c.map((v) => v + j), (y * W + x) * 3);
      }
  };
  paint(0, 0, 200, 400, OAK, 1);
  paint(200, 0, 400, 300, STONE, 1);
  paint(200, 300, 400, 400, WET);
  paint(40, 120, 160, 280, BED);
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

const finishes: PlanFinish[] = [
  { material: "floorOak", x0: 0, z0: 0, x1: 5, z1: 10 },
  { material: "floorStone", x0: 5, z0: 0, x1: 10, z1: 7.5 },
  { material: "floorWet", x0: 5, z0: 7.5, x1: 10, z1: 10 },
  { material: "floorOak", x0: 0.2, z0: 0.2, x1: 0.5, z1: 0.5 },
];

const mean = async (img: Buffer) => (await sharp(img).stats()).channels.slice(0, 3).map((c) => c.mean);

describe("a storey's floor swatches", () => {
  it("reads the storey's own finishes, in metres", () => {
    const prims: Primitive[] = [
      { type: "box", centre: { x: 2, y: 2.96, z: 3 }, size: { x: 4, y: 0.04, z: 2 }, material: "floorOak", tag: "floor-1:inside:finish" },
      { type: "box", centre: { x: 2, y: 0, z: 3 }, size: { x: 4, y: 0.04, z: 2 }, material: "floorStone", tag: "floor-0:inside:finish" },
      { type: "box", centre: { x: 2, y: 3, z: 3 }, size: { x: 1, y: 1, z: 1 }, material: "walnut", tag: "floor-1:inside:furniture" },
    ];
    expect(storeyFinishes(prims, "floor-1")).toEqual([{ material: "floorOak", x0: 0, z0: 2, x1: 4, z1: 4 }]);
  });

  it("cuts one plain square a finish, the largest first, off what stands on it, named by its rooms", async () => {
    const rooms = [
      { kind: "bedroom", x: 0, z: 0, w: 5, d: 10 },
      { kind: "living", x: 5, z: 0, w: 5, d: 7.5 },
      { kind: "bathroom", x: 5, z: 7.5, w: 5, d: 2.5 },
    ];
    const swatches = await planSwatches(await plan(), finishes, { metresWide: W / K, rooms }, { size: 64 });
    expect(swatches.map((s) => s.material)).toEqual(["floorOak", "floorStone", "floorWet"]);
    expect(swatches.map((s) => s.rooms)).toEqual([["bedroom"], ["living"], ["bathroom"]]);
    for (const [s, c] of [[swatches[0]!, OAK], [swatches[1]!, STONE], [swatches[2]!, WET]] as const) {
      expect((await sharp(s.image).metadata()).width).toBe(64);
      (await mean(s.image)).forEach((v, i) => expect(Math.abs(v - c[i]!)).toBeLessThan(6));
    }
  });

  it("cuts no swatch where the model stands something on the floor, whatever its colour", async () => {
    const prims: Primitive[] = [
      { type: "box", centre: { x: 2, y: 3.2, z: 3 }, size: { x: 1, y: 0.4, z: 1 }, material: "walnut", tag: "floor-1:inside:stair" },
      { type: "box", centre: { x: 2, y: 2.96, z: 3 }, size: { x: 9, y: 0.04, z: 9 }, material: "floorOak", tag: "floor-1:inside:finish" },
      { type: "box", centre: { x: 2, y: 1, z: 3 }, size: { x: 9, y: 2, z: 9 }, material: "plaster", tag: "floor-1:inside:ceiling" },
    ];
    expect(storeyCover(prims, "floor-1")).toEqual([{ x0: 1.5, z0: 2.5, x1: 2.5, z1: 3.5 }]);
    // The stone room wholly under something but a strip at its foot: the swatch from the strip, though the cover is stone-coloured.
    const cover = [{ x0: 5, z0: 0, x1: 10, z1: 5 }];
    const stone = (await planSwatches(await plan(), finishes, { metresWide: W / K, cover }, { size: 32 })).find((s) => s.material === "floorStone")!;
    (await mean(stone.image)).forEach((v, i) => expect(Math.abs(v - STONE[i]!)).toBeLessThan(6));
    const all = [{ x0: 0, z0: 0, x1: 10, z1: 10 }];
    expect(await planSwatches(await plan(), finishes, { metresWide: W / K, cover: all })).toEqual([]);
  });

  it("keeps to `most`, and the frame's shift", async () => {
    expect(await planSwatches(await plan(), finishes, { metresWide: W / K }, { most: 1 })).toHaveLength(1);
    const shifted = finishes.map((f) => ({ ...f, x0: f.x0 + 3, x1: f.x1 + 3 }));
    const [oak] = await planSwatches(await plan(), shifted, { metresWide: W / K, shift: { x: 3, y: 0 } }, { size: 32 });
    (await mean(oak!.image)).forEach((v, i) => expect(Math.abs(v - OAK[i]!)).toBeLessThan(6));
  });

  it("is told by where the swatches start and where the plan is", async () => {
    const swatches = await planSwatches(await plan(), finishes, { metresWide: W / K, rooms: [{ kind: "living", x: 5, z: 0, w: 5, d: 7.5 }] }, { size: 32 });
    const text = swatchPrompt(swatches, 2, 1);
    expect(text).toMatch(/images 2–4 are swatches/);
    expect(text).toMatch(/image 3: the floor of the living/);
    expect(text).toMatch(/image 2: the floor of the rooms floored like it/);
    expect(text).toMatch(/never draw it, a frame or a label/);
    expect(swatchPrompt(swatches.slice(0, 1), 3, 2)).toMatch(/image 3 is a swatch .* image 2's own floor/);
  });
});
