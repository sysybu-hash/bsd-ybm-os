import sharp from "sharp";

import {
  closeUpToDoor,
  entranceTrianglePoints,
  facingFromOutward,
  markApartmentEntrance,
  nearestPage,
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
  const point: EntrancePoint = {
    x: 0.8,
    y: 0.55,
    outsideX: 0.8,
    outsideY: 0.55,
    facing: "left",
  };

  it("draws on the frame without resizing it", async () => {
    const source = await still(800, 1000);
    const out = await markApartmentEntrance(source, point);
    const meta = await sharp(Buffer.from(out.base64, "base64")).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1000);
  });

  it("puts ink near the point and nowhere else", async () => {
    const source = await still(800, 1000);
    const out = await markApartmentEntrance(source, point);
    const { data, info } = await sharp(Buffer.from(out.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[y * info.width + x] ?? 255) < 90) {
          dark += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    expect(dark).toBeGreaterThan(0);
    // A uniform frame has no page to step out onto, so the marker sits just
    // clear of the doorway rather than drifting across the still.
    expect(sumX / dark / info.width).toBeCloseTo(0.8, 1);
    expect(sumY / dark / info.height).toBeCloseTo(0.55, 1);
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

describe("where the marker ends up", () => {
  /** A flat filling the left of the frame, page from x=300 rightwards. */
  async function halfFrame() {
    const buf = await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: { create: { width: 300, height: 600, channels: 3, background: "#8a7a5a" } },
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer();
    return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
  }

  async function inkCentre(img: { base64: string }) {
    const { data, info } = await sharp(Buffer.from(img.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[y * info.width + x] ?? 255) < 90) {
          dark += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    return { dark, x: sumX / dark, y: sumY / dark };
  }

  it("sits outside the door, on the page", async () => {
    const out = await markApartmentEntrance(await halfFrame(), {
      x: 0.5,
      y: 0.5,
      outsideX: 0.62,
      outsideY: 0.5,
      facing: "left",
    });
    const ink = await inkCentre(out);
    expect(ink.dark).toBeGreaterThan(0);
    // On the page, and hard up against the outline rather than floating off.
    expect(ink.x).toBeGreaterThan(300);
    expect(ink.x).toBeLessThan(360);
    expect(ink.y).toBeCloseTo(300, -1);
  });

  it("points back at the door", async () => {
    const out = await markApartmentEntrance(await halfFrame(), {
      x: 0.5,
      y: 0.5,
      outsideX: 0.62,
      outsideY: 0.5,
      facing: "right",
    });
    const { data, info } = await sharp(Buffer.from(out.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rowSpan = (y: number) => {
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
    // The door is to the left, so the apex leads left: the widest row is the
    // middle and the ink narrows toward the apex.
    const middle = rowSpan(300);
    const above = rowSpan(288);
    expect(middle.min).toBeLessThan(above.min);
  });

  it("walks off the floor onto the page when the model's point misses", async () => {
    const out = await markApartmentEntrance(await halfFrame(), {
      x: 0.5,
      y: 0.5,
      // Inside the flat, which is not where a marker belongs.
      outsideX: 0.4,
      outsideY: 0.5,
      facing: "left",
    });
    const ink = await inkCentre(out);
    expect(ink.x).toBeGreaterThan(300);
  });
});

describe("finding the page nearest the door", () => {
  /** A flat filling the left of the frame, page from `edge` rightwards. */
  function flat(width = 400, height = 400, edge = 240) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = x < edge ? 120 + ((x * 7 + y * 5) % 40) : 252;
      }
    }
    return { data, width, height, edge };
  }

  it("finds the page out to the right of a right-hand wall", () => {
    const { data, width, height, edge } = flat();
    const page = nearestPage(data, width, height, { x: edge - 10, y: 200 }, 16)!;
    expect(page).not.toBeNull();
    expect(page.x).toBeGreaterThanOrEqual(edge);
    expect(page.dx).toBeGreaterThan(0.5);
  });

  it("takes the closer edge at a stepped corner", () => {
    const width = 400;
    const height = 400;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = x < 320 && y < 260 ? 130 : 252;
      }
    }
    // In a notch: eight pixels above the bottom edge, eighty from the right.
    const page = nearestPage(data, width, height, { x: 240, y: 252 }, 16)!;
    expect(page.dy).toBeGreaterThan(0.5);
  });

  it("says nothing when the frame fills its canvas", () => {
    const width = 200;
    const height = 200;
    const data = new Uint8Array(width * height).fill(120);
    expect(nearestPage(data, width, height, { x: 100, y: 100 }, 16)).toBeNull();
  });

  it("walks past a pale wall band to the page behind it", () => {
    const width = 500;
    const height = 200;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 140;
        if (x >= 200 && x < 216) v = 245;
        else if (x >= 300) v = 252;
        data[y * width + x] = v;
      }
    }
    const page = nearestPage(data, width, height, { x: 190, y: 100 }, 12)!;
    expect(page.x).toBeGreaterThan(295);
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

describe("standing the marker up against the outline", () => {
  /** Flat on the left of x=300, page to its right. */
  function halfPage(width = 600, height = 400) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = x < 300 ? 130 : 252;
      }
    }
    return { data, width, height };
  }

  it("walks a distant point back up to the edge", () => {
    const { data, width, height } = halfPage();
    const size = 20;
    // The model put it a long way out; the door is at the wall.
    const at = closeUpToDoor(data, width, height, { x: 520, y: 200 }, { x: 296, y: 200 }, size);
    expect(at.x).toBeLessThan(400);
    expect(at.x).toBeGreaterThan(300);
    expect(at.y).toBe(200);
  });

  it("leaves room for the whole triangle rather than biting the outline", () => {
    const { data, width, height } = halfPage();
    const size = 20;
    const at = closeUpToDoor(data, width, height, { x: 520, y: 200 }, { x: 296, y: 200 }, size);
    // Its leading corner stops short of the wall.
    expect(at.x - size / 2).toBeGreaterThan(300);
  });

  it("does nothing when it is already at the door", () => {
    const { data, width, height } = halfPage();
    const point = { x: 310, y: 200 };
    expect(closeUpToDoor(data, width, height, point, { x: 310, y: 200 }, 20)).toEqual(point);
  });
});
