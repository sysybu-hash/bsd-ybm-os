import sharp from "sharp";

import {
  measureSilhouetteIou,
  transferStillOntoGeometry,
} from "@/lib/projects/floorplan-composite";

describe("composite materials onto CAD geometry", () => {
  it("keeps the CAD's dark wall and takes colour from the still", () => {
    // A white geometry wall-top next to a dark wall line must stay a wall
    // after the still paints oak everywhere. Luminance comes from geometry.
    const w = 2;
    const h = 1;
    const geometry = Buffer.from([255, 255, 255, 20, 20, 20]);
    const still = Buffer.from([180, 120, 40, 180, 120, 40]);
    const out = transferStillOntoGeometry(geometry, still, w, h, 0.2);
    const light = out[0]! + out[1]! + out[2]!;
    const dark = out[3]! + out[4]! + out[5]!;
    expect(dark).toBeLessThan(light);
    expect(out[0]).toBeGreaterThan(out[2]!);
  });

  it("scores a matching silhouette high and a different plate low", async () => {
    const matching = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#111111" },
    })
      .jpeg()
      .toBuffer();
    const blank = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();
    await expect(measureSilhouetteIou(matching, matching)).resolves.toBeGreaterThan(0.95);
    await expect(measureSilhouetteIou(matching, blank)).resolves.toBeLessThan(0.1);
  });
});
