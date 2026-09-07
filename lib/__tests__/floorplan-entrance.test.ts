import sharp from "sharp";

import {
  apartmentBounds,
  entranceTrianglePoints,
  facingFromOutward,
  markApartmentEntrance,
  nudgeOntoPage,
  pageMaskFromBorder,
  towardApartment,
  wallSideOf,
} from "@/lib/projects/floorplan-entrance";

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
  /** A flat floating on the page: a block inset from every edge. */
  async function floatingFlat(width = 600, height = 600) {
    const buf = await sharp({
      create: { width, height, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: {
            create: { width: 300, height: 400, channels: 3, background: "#8a7a5a" },
          },
          left: 150,
          top: 100,
        },
      ])
      .jpeg()
      .toBuffer();
    return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
  }

  async function ink(img: { base64: string }) {
    const { data, info } = await sharp(Buffer.from(img.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = info.width;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[y * info.width + x] ?? 255) < 90) {
          dark += 1;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
        }
      }
    }
    return { dark, x: sumX / dark, y: sumY / dark, minX };
  }

  it("puts the marker where the sheet puts it, relative to the flat", async () => {
    // The sheet's triangle sits just off the left wall, two thirds down.
    const out = await markApartmentEntrance(await floatingFlat(), { x: -0.04, y: 0.66 });
    const at = await ink(out);
    expect(at.dark).toBeGreaterThan(0);
    // The flat runs x 150..449, y 100..499, so that is near x=138, y=364.
    expect(at.x).toBeGreaterThan(110);
    expect(at.x).toBeLessThan(165);
    expect(at.y).toBeGreaterThan(330);
    expect(at.y).toBeLessThan(400);
  });

  it("points at the flat, whichever side the sheet marks", async () => {
    const out = await markApartmentEntrance(await floatingFlat(), { x: -0.04, y: 0.5 });
    const { data, info } = await sharp(Buffer.from(out.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const span = (y: number) => {
      let min = info.width;
      let max = -1;
      for (let x = 0; x < info.width; x++) {
        if ((data[y * info.width + x] ?? 255) < 90) {
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
      return { min, max };
    };
    // A triangle pointing right at the flat is widest away from it.
    const middle = span(300);
    const above = span(288);
    expect(middle.max).toBeGreaterThan(above.max);
  });

  it("slides onto the page when the sheet's spot lands inside the flat", async () => {
    const out = await markApartmentEntrance(await floatingFlat(), { x: 0.1, y: 0.5 });
    const at = await ink(out);
    // x 0.1 of the flat is x=180, inside it; the marker belongs outside.
    expect(at.x).toBeLessThan(155);
  });

  it("hands back a paid-for still rather than losing it to a bad point", async () => {
    const broken = { base64: "bm90LWFuLWltYWdl", mimeType: "image/jpeg" };
    await expect(markApartmentEntrance(broken, { x: 0.5, y: 0.5 })).resolves.toEqual(broken);
  });

  it("leaves a thumbnail alone — the marker would swamp it", async () => {
    const tiny = await sharp({
      create: { width: 120, height: 120, channels: 3, background: "#c9b79a" },
    })
      .jpeg()
      .toBuffer();
    const img = { base64: tiny.toString("base64"), mimeType: "image/jpeg" };
    await expect(markApartmentEntrance(img, { x: 0.5, y: 0.5 })).resolves.toEqual(img);
  });

  it("keeps the whole marker inside the frame", async () => {
    const out = await markApartmentEntrance(await floatingFlat(), { x: -0.6, y: 0.5 });
    const at = await ink(out);
    expect(at.minX).toBeGreaterThan(0);
  });
});

describe("reading the flat out of the frame", () => {
  function framed(width = 400, height = 300) {
    const data = new Uint8Array(width * height).fill(252);
    for (let y = 50; y < 250; y++) {
      for (let x = 80; x < 320; x++) data[y * width + x] = 130;
    }
    return { data, width, height };
  }

  it("bounds the flat, not the page", () => {
    const { data, width, height } = framed();
    const page = pageMaskFromBorder(data, width, height);
    expect(apartmentBounds(page, width, height)).toEqual({
      x: 80,
      y: 50,
      width: 240,
      height: 200,
    });
  });

  it("says nothing when there is no flat in the frame", () => {
    const width = 100;
    const height = 100;
    const page = new Uint8Array(width * height).fill(1);
    expect(apartmentBounds(page, width, height)).toBeNull();
  });

  it("moves a point off the flat and onto the page", () => {
    const { data, width, height } = framed();
    const page = pageMaskFromBorder(data, width, height);
    const at = nudgeOntoPage(page, width, height, { x: 200, y: 150 }, 20);
    expect(page[at.y * width + at.x]).toBe(1);
  });

  it("keeps the height it was given and only moves sideways", () => {
    const { data, width, height } = framed();
    const page = pageMaskFromBorder(data, width, height);
    // The flat runs x 80..319; this point is inside it, two thirds down.
    const at = nudgeOntoPage(page, width, height, { x: 100, y: 200 }, 40);
    expect(at.y).toBe(200);
    expect(at.x).toBeLessThan(80);
  });

  it("leaves a point that is already on the page", () => {
    const { data, width, height } = framed();
    const page = pageMaskFromBorder(data, width, height);
    const at = { x: 20, y: 150 };
    expect(nudgeOntoPage(page, width, height, at, 20)).toEqual(at);
  });

  it("finds the way to the flat from outside it", () => {
    const { data, width, height } = framed();
    const page = pageMaskFromBorder(data, width, height);
    const dir = towardApartment(page, width, height, { x: 40, y: 150 }, 30)!;
    expect(dir.dx).toBeGreaterThan(0.8);
  });
});

describe("which way someone walks in", () => {
  it("is the opposite of the way out, snapped to an axis", () => {
    expect(facingFromOutward(1, 0)).toBe("left");
    expect(facingFromOutward(-1, 0)).toBe("right");
    expect(facingFromOutward(0, 1)).toBe("up");
    expect(facingFromOutward(0, -1)).toBe("down");
    expect(facingFromOutward(0.9, 0.4)).toBe("left");
    expect(facingFromOutward(0.3, 0.95)).toBe("up");
  });
});

describe("which wall the sheet marks", () => {
  it("takes whichever reading is nearest an edge of the box", () => {
    // Left wall, two thirds down: x is 0.1 from its edge, y is 0.27 from its.
    expect(wallSideOf(0.1, 0.73)).toEqual([-1, 0]);
    expect(wallSideOf(0.95, 0.4)).toEqual([1, 0]);
    expect(wallSideOf(0.5, 0.03)).toEqual([0, -1]);
    expect(wallSideOf(0.45, 0.98)).toEqual([0, 1]);
  });

  it("handles a mark drawn outside the box", () => {
    expect(wallSideOf(-0.04, 0.66)).toEqual([-1, 0]);
    expect(wallSideOf(0.5, 1.05)).toEqual([0, 1]);
  });

  it("slides out through the marked wall, not the nearest one", () => {
    const width = 400;
    const height = 400;
    const data = new Uint8Array(width * height).fill(252);
    // A flat with plenty of page below it and a thin margin on the left.
    for (let y = 20; y < 260; y++) {
      for (let x = 60; x < 340; x++) data[y * width + x] = 130;
    }
    const page = pageMaskFromBorder(data, width, height);
    const at = nudgeOntoPage(page, width, height, { x: 90, y: 240 }, 20, [-1, 0]);
    expect(at.x).toBeLessThan(60);
    expect(at.y).toBe(240);
  });
});
