import sharp from "sharp";

import {
  entranceTrianglePoints,
  findMarkerCentre,
  inferFacing,
  isBackgroundPatch,
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

describe("finding the page in front of the door", () => {
  /** A flat that fills the left half of the frame, plain page to its right. */
  function frame(width = 400, height = 400, edge = 240) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Apartment: mid-tone floor with visible grain. Page: flat near-white.
        data[y * width + x] = x < edge ? 120 + ((x * 7 + y * 5) % 40) : 252;
      }
    }
    return { data, width, height, edge };
  }

  it("tells apartment from empty page", () => {
    const { data, width, height, edge } = frame();
    expect(isBackgroundPatch(data, width, height, edge + 40, 200, 6)).toBe(true);
    expect(isBackgroundPatch(data, width, height, edge - 40, 200, 6)).toBe(false);
  });

  it("steps out through the wall onto the page", () => {
    const { data, width, height, edge } = frame();
    // Someone walking in at the right-hand wall walks left, so out is right.
    const centre = findMarkerCentre(data, width, height, { x: edge - 6, y: 200 }, "left", 20);
    expect(centre.x).toBeGreaterThan(edge);
    expect(centre.y).toBe(200);
  });

  it("clears the wall rather than touching it", () => {
    const { data, width, height, edge } = frame();
    const size = 20;
    const centre = findMarkerCentre(data, width, height, { x: edge - 6, y: 200 }, "left", size);
    // The triangle's own half-width fits between the wall and its near face.
    expect(centre.x - size / 2).toBeGreaterThan(edge);
  });

  it("goes the right way for each facing", () => {
    const { data, width, height } = frame(400, 400, 240);
    expect(findMarkerCentre(data, width, height, { x: 234, y: 200 }, "left", 20).x).toBeGreaterThan(240);
    // Walking right means the page is to the left — none there, so it falls back
    // to a nudge rather than wandering off.
    const back = findMarkerCentre(data, width, height, { x: 234, y: 200 }, "right", 20);
    expect(back.x).toBeLessThan(234);
  });

  it("does not wander off when the frame has no page at all", () => {
    const width = 200;
    const height = 200;
    const data = new Uint8Array(width * height).fill(120);
    const centre = findMarkerCentre(data, width, height, { x: 100, y: 100 }, "up", 20);
    expect(Math.abs(centre.x - 100)).toBeLessThan(30);
    expect(Math.abs(centre.y - 100)).toBeLessThan(30);
  });
});

describe("working out which way is out", () => {
  /** A flat filling the left of the frame, empty page from `edge` rightwards. */
  function flat(width = 400, height = 400, edge = 240) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = x < edge ? 120 + ((x * 7 + y * 5) % 40) : 252;
      }
    }
    return { data, width, height, edge };
  }

  it("reads the door on a right-hand wall as walking left", () => {
    const { data, width, height, edge } = flat();
    expect(inferFacing(data, width, height, { x: edge - 6, y: 200 }, 20)).toBe("left");
  });

  it("reads the door on a bottom wall as walking up", () => {
    const width = 400;
    const height = 400;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = y < 300 ? 130 : 252;
      }
    }
    expect(inferFacing(data, width, height, { x: 200, y: 294 }, 20)).toBe("up");
  });

  it("takes the nearest edge when a corner offers two", () => {
    const width = 400;
    const height = 400;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        data[y * width + x] = x < 300 && y < 260 ? 130 : 252;
      }
    }
    // Ten pixels from the bottom edge, ninety from the right one.
    expect(inferFacing(data, width, height, { x: 210, y: 250 }, 20)).toBe("up");
  });

  it("says nothing when the frame fills its canvas", () => {
    const width = 200;
    const height = 200;
    const data = new Uint8Array(width * height).fill(120);
    expect(inferFacing(data, width, height, { x: 100, y: 100 }, 20)).toBeNull();
  });

  it("overrides a facing the model got wrong", async () => {
    const source = await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: {
            create: { width: 300, height: 600, channels: 3, background: "#8a7a5a" },
          },
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer();
    const still = { base64: source.toString("base64"), mimeType: "image/jpeg" };
    // The flat is on the left, so out is right and the walk in is "left".
    // The model is told the opposite; the picture should win.
    const out = await markApartmentEntrance(still, { x: 0.48, y: 0.5, facing: "right" });
    const { data, info } = await sharp(Buffer.from(out.base64, "base64"))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sumX = 0;
    let dark = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if ((data[y * info.width + x] ?? 255) < 90) {
          dark += 1;
          sumX += x;
        }
      }
    }
    expect(dark).toBeGreaterThan(0);
    // Placed out on the page to the right, not back inside the flat.
    expect(sumX / dark).toBeGreaterThan(300);
  });
});

describe("telling a pale wall from the page behind it", () => {
  /**
   * Floor, then a pale cream wall band, then floor again, then the page. The
   * wall is light enough to pass the patch test on its own.
   */
  function paleWall(width = 400, height = 200) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 140;
        if (x >= 200 && x < 216) v = 245; // the wall band
        else if (x >= 300) v = 252; // the page
        data[y * width + x] = v;
      }
    }
    return { data, width, height };
  }

  it("walks past the wall band and out onto the page", () => {
    const { data, width, height } = paleWall();
    const centre = findMarkerCentre(data, width, height, { x: 190, y: 100 }, "left", 12);
    expect(centre.x).toBeGreaterThan(300);
  });
});
