/**
 * @jest-environment node
 */
import sharp from "sharp";
import { massMatch } from "@/lib/projects/building/finish";

jest.mock("@/lib/gemini-model", () => ({ getFloorplanVizModelChain: () => [] }));
jest.mock("@/lib/ai-usage", () => ({ recordAiUsage: () => undefined, usageFromGemini: () => ({}) }));

/** A 400 × 300 picture: a dark mass where `left` says, sky elsewhere, and stone courses over all. */
async function picture(left: boolean, tint: [number, number, number]): Promise<Buffer> {
  const w = 400;
  const h = 300;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mass = left ? x < 200 && y > 60 : x >= 200 && y > 60;
      const course = y % 12 === 0 ? -30 : 0;
      const base = mass ? 90 + course : 200;
      const i = (y * w + x) * 3;
      px[i] = Math.max(0, Math.min(255, base + tint[0]));
      px[i + 1] = Math.max(0, Math.min(255, base + tint[1]));
      px[i + 2] = Math.max(0, Math.min(255, base + tint[2]));
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

describe("a finish keeps the render's masses", () => {
  it("scores a repaint of the same masses high, whatever its colour", async () => {
    expect(await massMatch(await picture(true, [0, 0, 0]), await picture(true, [40, 20, -30]))).toBeGreaterThan(0.9);
  });

  it("scores a different building low, though its courses line up", async () => {
    expect(await massMatch(await picture(true, [0, 0, 0]), await picture(false, [0, 0, 0]))).toBeLessThan(0.2);
  });
});
