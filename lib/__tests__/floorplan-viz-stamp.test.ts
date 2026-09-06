import sharp from "sharp";

import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  buildStampCaption,
  creditRunLayout,
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

describe("the system credit", () => {
  it("puts the Hebrew phrase to the right of the Latin mark", () => {
    const { hebrew, mark } = creditRunLayout(400, 20);
    expect(hebrew.text).toBe("הופק על ידי מערכת");
    expect(mark.text).toBe("BSD-YBM");
    // Reading order is right to left, so the mark sits further left on the bar.
    expect(mark.x).toBeLessThan(hebrew.x);
  });

  it("keeps the two runs apart rather than overlapping", () => {
    const size = 20;
    const { hebrew, mark } = creditRunLayout(400, size);
    // hebrew is anchored at its right edge, mark at its left edge.
    const heLeftEdge = hebrew.x - "הופק על ידי מערכת".length * size * 0.5;
    const markRightEdge = mark.x + "BSD-YBM".length * size * 0.6;
    expect(heLeftEdge).toBeGreaterThan(markRightEdge - 1);
  });

  it("centres the pair on the point it is given", () => {
    const { hebrew, mark } = creditRunLayout(300, 16);
    expect((hebrew.x + mark.x) / 2).toBeCloseTo(300, 0);
  });

  it("scales with the font so a small still is not crowded", () => {
    const small = creditRunLayout(400, 10);
    const large = creditRunLayout(400, 30);
    expect(large.hebrew.x - large.mark.x).toBeGreaterThan(small.hebrew.x - small.mark.x);
  });
});

describe("the caption when the sheet prints no unit label", () => {
  it("falls back to the run's own name rather than dropping the unit", () => {
    const layout = parseFloorplanLayout({ grossAreaM2: 114.11, rooms: [{ name: "סלון" }] });
    // דירה 15 came back captioned with the area alone and a gap where the unit
    // should have been, because the extractor read no label that run.
    expect(buildStampCaption(stampFieldsFromLayout(layout, "דירה 15"))).toBe(
      'דירה 15  ·  114.11 מ"ר',
    );
  });

  it("prefers what the sheet printed over the file name", () => {
    const layout = parseFloorplanLayout({ unitLabel: "22", rooms: [{ name: "סלון" }] });
    expect(stampFieldsFromLayout(layout, "דירה 15").unitLabel).toBe("22");
  });
});
