import sharp from "sharp";

import { coolTintFraction, TINT_LIMIT } from "@/lib/projects/floorplan-tint";

/** A solid frame of one colour, as a JPEG the checker will decode. */
async function solid(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 220, height: 220, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

describe("coolTintFraction", () => {
  it("passes a warm finish: oak, plaster, stone", async () => {
    for (const [r, g, b] of [
      [193, 154, 107], // oak
      [245, 243, 238], // white plaster
      [207, 203, 194], // pale stone
    ]) {
      expect(await coolTintFraction(await solid(r!, g!, b!))).toBeLessThan(
        TINT_LIMIT,
      );
    }
  });

  it("catches a bathroom left in the coding aqua", async () => {
    // The pale mint a failed recolour pass leaves behind, not a vivid green.
    expect(await coolTintFraction(await solid(200, 228, 214))).toBeGreaterThan(
      TINT_LIMIT,
    );
  });

  it("does not read a shadow on white plaster as a coding colour", async () => {
    // Faintly blue, and the reason the saturation floor cannot simply be zero.
    expect(await coolTintFraction(await solid(214, 218, 224))).toBeLessThan(
      TINT_LIMIT,
    );
  });

  it("accepts a base64 image as well as a buffer", async () => {
    const buffer = await solid(193, 154, 107);
    expect(
      await coolTintFraction({ base64: buffer.toString("base64") }),
    ).toBeLessThan(TINT_LIMIT);
  });
});

describe("the limit", () => {
  it("is tight enough to catch residue on a couple of surfaces", () => {
    // A frame with a turquoise bathroom floor and a magenta panel down one wall
    // measures 1.61% and scored 0 overall, because the auditor counts objects
    // and a turquoise bathroom has the right number of everything.
    expect(TINT_LIMIT).toBeLessThan(0.0161);
  });

  it("still clears a correct frame by an order of magnitude", () => {
    // Warm, correct finishes on דירה 14 measure 0.00% to 0.04%.
    expect(TINT_LIMIT).toBeGreaterThan(0.0004 * 10);
  });
});
