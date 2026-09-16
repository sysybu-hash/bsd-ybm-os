import sharp from "sharp";

import {
  fidelityFailures,
  measureBlockFidelity,
} from "@/lib/projects/floorplan-fidelity";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";

const PAD = 30;
const bounds = { x: 0, y: 0, width: 200, height: 200 };
const W = bounds.width + PAD * 2;
const H = bounds.height + PAD * 2;

const piece = (
  x: number,
  y: number,
  kind: FurniturePiece["kind"],
): FurniturePiece => ({
  x,
  y,
  w: 40,
  h: 40,
  widthCm: 70,
  depthCm: 70,
  kind,
});

/** A frame the size of the geometry, floor-coloured, with blocks painted on. */
async function frame(
  blocks: Array<{ x: number; y: number; colour: string }>,
): Promise<Buffer> {
  const rects = blocks
    .map(
      (b) =>
        `<rect x="${b.x + PAD}" y="${b.y + PAD}" width="40" height="40" fill="${b.colour}"/>`,
    )
    .join("");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
        `<rect width="100%" height="100%" fill="#c3b49d"/>${rects}</svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
}

describe("measureBlockFidelity", () => {
  it("finds a block that was rendered as something", async () => {
    const geometry = await frame([{ x: 60, y: 60, colour: "#e6dccb" }]);
    const still = await frame([{ x: 60, y: 60, colour: "#f2e7d4" }]);
    const report = await measureBlockFidelity({
      geometry,
      still,
      furniture: [piece(60, 60, "seat")],
      bounds,
      paddingUnits: PAD,
    });
    expect(report.present).toBe(1);
    expect(fidelityFailures(report)).toEqual([]);
  });

  it("catches a block the finish turned back into floor", async () => {
    // This is the failure that was shipping: the living-room suite rendered as
    // a length of wall, four of six dining chairs gone, all four island stools
    // gone — and the auditor scoring it 0, because it counts objects and a
    // frame with none of them has the right number of everything.
    const geometry = await frame([{ x: 60, y: 60, colour: "#e6dccb" }]);
    const still = await frame([]);
    const report = await measureBlockFidelity({
      geometry,
      still,
      furniture: [piece(60, 60, "seat")],
      bounds,
      paddingUnits: PAD,
    });
    expect(report.present).toBe(0);
    expect(fidelityFailures(report)).toEqual([
      "1 of 1 seat block(s) missing from the still",
    ]);
  });

  it("sees a dark object on a dark floor, which grey alone does not", async () => {
    // A dark oak table on dark oak boards is within a shade of them in
    // luminance and plainly a different thing in hue.
    const geometry = await frame([{ x: 60, y: 60, colour: "#a9764a" }]);
    const still = await frame([{ x: 60, y: 60, colour: "#a4794e" }]);
    const report = await measureBlockFidelity({
      geometry,
      still,
      furniture: [piece(60, 60, "table")],
      bounds,
      paddingUnits: PAD,
    });
    expect(report.present).toBe(1);
  });

  it("counts the misses per kind, so the grader can name them", async () => {
    const geometry = await frame([]);
    const still = await frame([{ x: 60, y: 60, colour: "#f2e7d4" }]);
    const report = await measureBlockFidelity({
      geometry,
      still,
      furniture: [
        piece(60, 60, "seat"),
        piece(120, 60, "seat"),
        piece(60, 120, "bed"),
      ],
      bounds,
      paddingUnits: PAD,
    });
    expect(report.missing).toEqual({ seat: 1, bed: 1 });
    expect(fidelityFailures(report).sort()).toEqual([
      "1 of 1 bed block(s) missing from the still",
      "1 of 2 seat block(s) missing from the still",
    ]);
  });

  it("says nothing when the geometry drew no furniture", async () => {
    const blank = await frame([]);
    const report = await measureBlockFidelity({
      geometry: blank,
      still: blank,
      furniture: [],
      bounds,
      paddingUnits: PAD,
    });
    expect(report.total).toBe(0);
    expect(fidelityFailures(report)).toEqual([]);
  });
});
