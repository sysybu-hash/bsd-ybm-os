import sharp from "sharp";

import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  buildStampCaption,
  stampFieldsFromLayout,
  stampFloorplanStill,
} from "@/lib/projects/floorplan-viz-stamp";

async function still(width = 600, height = 800): Promise<{ base64: string; mimeType: string }> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: "#c9b79a" },
  })
    .jpeg()
    .toBuffer();
  return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
}

describe("still caption fields", () => {
  it("takes the unit and area the sheet printed", () => {
    const layout = parseFloorplanLayout({
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [{ name: "סלון" }],
    });
    expect(stampFieldsFromLayout(layout)).toEqual({ unitLabel: "14", areaM2: 111.29 });
  });

  it("does not print דירה twice when the label already says it", () => {
    const layout = parseFloorplanLayout({ unitLabel: "דירה 22", rooms: [{ name: "סלון" }] });
    expect(buildStampCaption(stampFieldsFromLayout(layout))).toBe("דירה 22");
  });

  it("falls back to the run title when the sheet gave no unit label", () => {
    const layout = parseFloorplanLayout({ grossAreaM2: 95.5, rooms: [{ name: "סלון" }] });
    expect(buildStampCaption(stampFieldsFromLayout(layout, "18"))).toBe('דירה 18  ·  95.50 מ"ר');
  });

  it("leaves out what the sheet never printed rather than guessing", () => {
    const layout = parseFloorplanLayout({ rooms: [{ name: "סלון" }] });
    expect(stampFieldsFromLayout(layout)).toEqual({ unitLabel: undefined, areaM2: undefined });
    expect(buildStampCaption(stampFieldsFromLayout(layout))).toBe("");
  });

  it("prints the area to the centimetre, as the sheet does", () => {
    expect(buildStampCaption({ areaM2: 112.4 })).toBe('112.40 מ"ר');
  });
});

describe("stamping a still", () => {
  it("adds a caption bar under the frame without touching the frame itself", async () => {
    const source = await still(600, 800);
    const out = await stampFloorplanStill(source, { unitLabel: "16", areaM2: 112.36 });
    const meta = await sharp(Buffer.from(out.base64, "base64")).metadata();
    expect(meta.width).toBe(600);
    // Roughly 6% of the height is added for the bar.
    expect(meta.height).toBeGreaterThan(800);
    expect(meta.height).toBeLessThan(880);
  });

  it("still credits the system when the sheet printed no unit or area", async () => {
    const source = await still();
    const out = await stampFloorplanStill(source, {});
    const meta = await sharp(Buffer.from(out.base64, "base64")).metadata();
    expect(meta.height).toBeGreaterThan(800);
  });

  it("hands back the original rather than losing a paid-for still", async () => {
    const broken = { base64: "bm90LWFuLWltYWdl", mimeType: "image/jpeg" };
    await expect(stampFloorplanStill(broken, { unitLabel: "9" })).resolves.toEqual(broken);
  });

  it("leaves a thumbnail alone — a caption bar would swamp it", async () => {
    const tiny = await still(120, 120);
    await expect(stampFloorplanStill(tiny, { unitLabel: "9" })).resolves.toEqual(tiny);
  });
});
