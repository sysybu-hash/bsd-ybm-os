import sharp from "sharp";

import {
  entranceTrianglePoints,
  markApartmentEntrance,
  type EntrancePoint,
} from "@/lib/projects/floorplan-entrance";

async function still(width = 800, height = 1000): Promise<{ base64: string; mimeType: string }> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: "#c9b79a" },
  })
    .jpeg()
    .toBuffer();
  return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
}

function corners(points: string): Array<[number, number]> {
  return points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x!, y!] as [number, number];
  });
}

describe("the entrance triangle", () => {
  it("points the way someone walks in", () => {
    const right = corners(entranceTrianglePoints(100, 100, 20, "right"));
    // The apex leads; the two base corners sit behind it.
    expect(right[0]![0]).toBeGreaterThan(right[1]![0]);
    expect(right[0]![0]).toBeGreaterThan(right[2]![0]);

    const left = corners(entranceTrianglePoints(100, 100, 20, "left"));
    expect(left[0]![0]).toBeLessThan(left[1]![0]);

    const down = corners(entranceTrianglePoints(100, 100, 20, "down"));
    expect(down[0]![1]).toBeGreaterThan(down[1]![1]);

    const up = corners(entranceTrianglePoints(100, 100, 20, "up"));
    expect(up[0]![1]).toBeLessThan(up[1]![1]);
  });

  it("is centred on the point it is given", () => {
    for (const facing of ["left", "right", "up", "down"] as const) {
      const pts = corners(entranceTrianglePoints(300, 200, 40, facing));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(300, 0);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(200, 0);
    }
  });

  it("is the size it is asked for", () => {
    const pts = corners(entranceTrianglePoints(100, 100, 30, "right"));
    const xs = pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(30);
  });
});

describe("marking a still", () => {
  const point: EntrancePoint = { x: 0.8, y: 0.55, facing: "left" };

  it("draws on the frame without resizing it", async () => {
    const source = await still(800, 1000);
    const out = await markApartmentEntrance(source, point);
    const meta = await sharp(Buffer.from(out.base64, "base64")).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1000);
  });

  it("puts ink where the point says and nowhere else", async () => {
    const source = await still(800, 1000);
    const out = await markApartmentEntrance(source, point);
    const { data, info } = await sharp(Buffer.from(out.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const darkAt = (fx: number, fy: number) => {
      const x = Math.round(fx * info.width);
      const y = Math.round(fy * info.height);
      return (data[y * info.width + x] ?? 255) < 90;
    };
    expect(darkAt(0.8, 0.55)).toBe(true);
    // The opposite corner of the flat is untouched.
    expect(darkAt(0.2, 0.2)).toBe(false);
  });

  it("hands back a paid-for still rather than losing it to a bad point", async () => {
    const broken = { base64: "bm90LWFuLWltYWdl", mimeType: "image/jpeg" };
    await expect(markApartmentEntrance(broken, point)).resolves.toEqual(broken);
  });

  it("leaves a thumbnail alone — the marker would swamp it", async () => {
    const tiny = await still(120, 120);
    await expect(markApartmentEntrance(tiny, point)).resolves.toEqual(tiny);
  });

  it("scales the marker with the frame, not with the pixel count", async () => {
    const small = await markApartmentEntrance(await still(400, 500), point);
    const large = await markApartmentEntrance(await still(1600, 2000), point);
    const inkFraction = async (img: { base64: string }) => {
      const { data, info } = await sharp(Buffer.from(img.base64, "base64"))
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let dark = 0;
      for (let i = 0; i < data.length; i++) if ((data[i] ?? 255) < 90) dark += 1;
      return dark / (info.width * info.height);
    };
    const a = await inkFraction(small);
    const b = await inkFraction(large);
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThan(a * 0.5);
  });
});
