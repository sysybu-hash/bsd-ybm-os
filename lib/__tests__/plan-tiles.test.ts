import sharp from "sharp";

import { analogyRecolour, composePlan, evenLawn, holdLawn, placeDonor, type PlanLayout } from "@/lib/projects/building/plan-tiles";

const fill = (w: number, h: number, rgb: [number, number, number]) => {
  const b = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) b.set(rgb, i * 3);
  return b;
};
const at = (b: Buffer, w: number, x: number, y: number) => [...b.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
const rect = (b: Buffer, w: number, [x0, y0, x1, y1]: [number, number, number, number], rgb: [number, number, number]) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b.set(rgb, (y * w + x) * 3);
};
const mean = (b: Buffer, w: number, [x0, y0, x1, y1]: [number, number, number, number]) => {
  const m = [0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) m[c]! += b[(y * w + x) * 3 + c]!;
  return m.map((v) => v / ((x1 - x0) * (y1 - y0)));
};

describe("plan-tiles: the render's lawn held in the painting", () => {
  const [W, H] = [80, 30];
  const render = fill(W, H, [95, 125, 35]);

  it("lays painted lawn over a rail the painting left on the render's lawn", () => {
    const out = fill(W, H, [61, 87, 26]);
    for (let y = 12; y < 16; y++) for (let x = 30; x < 40; x++) out.set([131, 144, 114], (y * W + x) * 3);
    // The rail's 40 pixels and its soft edge, two pixels round.
    expect(holdLawn(out, render, W, H)).toBe(100);
    expect(at(out, W, 35, 14)).toEqual([61, 87, 26]);
  });

  it("leaves what the render itself draws on the lawn's edge", () => {
    const edged = Buffer.from(render);
    for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) edged.set([200, 190, 170], (y * W + x) * 3);
    const out = fill(W, H, [61, 87, 26]);
    for (let y = 0; y < H; y++) for (let x = 0; x < 12; x++) out.set([210, 200, 180], (y * W + x) * 3);
    holdLawn(out, edged, W, H);
    expect(at(out, W, 11, 15)).toEqual([210, 200, 180]);
  });

  it("takes a dry blade for grass, and a flat light green strip for none", () => {
    const out = fill(W, H, [40, 58, 14]);
    // Grass's dry blades, a pixel each: near as red as green.
    for (let x = 5; x < 75; x += 7) out.set([92, 96, 40], (10 * W + x) * 3);
    // Taken from beside a wall elsewhere: a flat green far lighter than the painting's lawn.
    rect(out, W, [50, 6, 58, 24], [103, 129, 43]);
    holdLawn(out, render, W, H);
    expect(at(out, W, 12, 10)).toEqual([92, 96, 40]);
    expect(at(out, W, 54, 15)).toEqual([40, 58, 14]);
  });
});

describe("plan-tiles: every plan's lawn one green", () => {
  it("evens a darker strip into the lawn about it, keeping the grass's texture", () => {
    const [W, H] = [160, 60];
    const render = fill(W, H, [86, 110, 18]);
    const out = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      const blade = (i * 37) % 11 - 5;
      const strip = i % W >= 80 && i % W < 140;
      out.set(strip ? [44 + blade, 66 + blade, 14] : [66 + blade, 92 + blade, 30], i * 3);
    }
    expect(evenLawn(out, render, W, H, [74, 100, 28])).toBeGreaterThan(W * H * 0.8);
    const strip = mean(out, W, [100, 20, 120, 40]);
    const lawn = mean(out, W, [20, 20, 50, 40]);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(strip[c]! - lawn[c]!)).toBeLessThan(3);
      expect(Math.abs(lawn[c]! - [74, 100, 28][c]!)).toBeLessThan(3);
    }
    expect(new Set([0, 1, 2, 3, 4, 5].map((x) => at(out, W, 30 + x, 30)[1])).size).toBeGreaterThan(2);
  });

  it("leaves what is not lawn in the render, and paints none over a pale edging", () => {
    const [W, H] = [60, 30];
    const render = fill(W, H, [86, 110, 18]);
    rect(render, W, [0, 0, 10, H], [200, 190, 170]);
    const out = fill(W, H, [60, 85, 25]);
    rect(out, W, [0, 0, 10, H], [205, 195, 175]);
    rect(out, W, [10, 0, 13, H], [150, 170, 120]);
    evenLawn(out, render, W, H, [74, 100, 28]);
    expect(at(out, W, 5, 15)).toEqual([205, 195, 175]);
    expect(at(out, W, 11, 15)).toEqual([150, 170, 120]);
  });
});

describe("plan-tiles: the render kept, in the painting's colours", () => {
  it("paints a render colour as the painting paints it elsewhere", () => {
    const [W, H] = [40, 20];
    const render = fill(W, H, [86, 110, 18]);
    const out = fill(W, H, [70, 98, 28]);
    // The render's beige paving, painted pale grey stone where the painting drew it.
    rect(render, W, [0, 0, 20, 10], [205, 180, 140]);
    rect(out, W, [0, 0, 20, 10], [190, 188, 182]);
    // Kept as the render: the same beige.
    rect(render, W, [25, 5, 35, 15], [205, 180, 140]);
    rect(out, W, [25, 5, 35, 15], [205, 180, 140]);
    const target = new Uint8Array(W * H);
    for (let y = 5; y < 15; y++) for (let x = 25; x < 35; x++) target[y * W + x] = 1;
    const sample = new Uint8Array(W * H).fill(1);
    expect(analogyRecolour(out, render, W, H, target, sample)).toBe(100);
    expect(at(out, W, 30, 10)).toEqual([190, 188, 182]);
    expect(at(out, W, 38, 2)).toEqual([70, 98, 28]);
  });

  it("finds where another plan's bins lie in this one's render", () => {
    const [W, H] = [160, 120];
    const render = fill(W, H, [86, 110, 18]);
    // Paving with its joints, and three bins.
    for (let y = 50; y < 95; y++) for (let x = 60; x < 130; x++) render.set(x % 9 === 0 || y % 7 === 0 ? [160, 140, 110] : [200, 180, 140], (y * W + x) * 3);
    for (const x of [70, 92, 114]) rect(render, W, [x, 60, x + 12, 80], [150, 150, 150]);
    const [dw, dh] = [80, 55];
    const donorRender = Buffer.alloc(dw * dh * 3);
    for (let v = 0; v < dh; v++) render.copy(donorRender, v * dw * 3, ((v + 45) * W + 55) * 3, ((v + 45) * W + 55 + dw) * 3);
    const at0 = placeDonor(render, W, H, [58, 40, 140, 105], { painted: donorRender, render: donorRender, width: dw, height: dh });
    expect(at0.scale).toBeCloseTo(1, 2);
    expect(Math.round(at0.dx)).toBe(55);
    expect(Math.round(at0.dy)).toBe(45);
    expect(at0.cost).toBeLessThan(1);
  });
});

describe("plan-tiles: nothing mirrored into the bins' enclosure", () => {
  // A pair's front yard: the first home's gas pillar left of the party fence, the second's bins right of it.
  // The pillar's render beige and the enclosure's paving are alike, so the mirror took one for the other.
  const [W, H] = [200, 120];
  const page: [number, number, number] = [225, 220, 205];
  const render = fill(W, H, page);
  rect(render, W, [4, 4, W - 4, H - 4], [86, 110, 18]);
  rect(render, W, [80, 88, 96, 104], [205, 182, 140]);
  rect(render, W, [104, 82, 140, 110], [200, 178, 138]);
  const layout: PlanLayout = {
    width: W,
    height: H,
    centre: 100,
    overlap: 4,
    tiles: [
      { id: "back", left: 0, top: 0, width: 100, height: H, mirrored: false },
      { id: "back-r", left: 100, top: 0, width: 100, height: H, mirrored: false },
    ],
  };
  const pillar = [245, 245, 240];
  const compose = async (keepRender?: Array<[number, number, number, number]>) => {
    const painting = fill(100, H, [62, 90, 26]);
    rect(painting, 100, [80, 88, 96, 104], pillar as [number, number, number]);
    const back = await sharp(painting, { raw: { width: 100, height: H, channels: 3 } }).png().toBuffer();
    const jpeg = await sharp(render, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const done = await composePlan(jpeg, layout, { back }, { mirror: true, keepRender, wall: 4 });
    return (await sharp(done).raw().toBuffer({ resolveWithObject: true })).data;
  };
  const near = (a: number[], b: number[]) => a.every((v, c) => Math.abs(v - b[c]!) < 20);

  it("mirrored the pillar onto the enclosure's paving, unboxed", async () => {
    expect(near(at(await compose(), W, 112, 96), pillar)).toBe(true);
  });

  it("keeps the enclosure as the render draws it, boxed from just right of the fence", async () => {
    const out = await compose([[104, 80, 145, 112]]);
    expect(near(at(out, W, 112, 96), pillar)).toBe(false);
    expect(near(at(out, W, 112, 96), [200, 178, 138])).toBe(true);
    // The first home's own pillar stays.
    expect(near(at(out, W, 88, 96), pillar)).toBe(true);
  });
});
