import sharp from "sharp";
import {
  clampFloorplanVizEditRegion,
  editRegionPromptBlock,
  formatFloorplanVizEditPrompt,
} from "@/lib/projects/floorplan-viz-edit-region";
import { overlayFloorplanVizEditRegion, stripMagentaLocatorFromJpeg, compositeFloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region-overlay";
import { buildStillEditPrompt } from "@/lib/projects/floorplan-viz-generate";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

describe("floorplan viz edit region", () => {
  it("rejects empty or inverted marks", () => {
    expect(clampFloorplanVizEditRegion(null)).toBeNull();
    expect(clampFloorplanVizEditRegion({ x: 0.1, y: 0.1, w: 0, h: 0.2 })).toBeNull();
    expect(clampFloorplanVizEditRegion({ x: 0.2, y: 0.3, w: 0.4, h: 0.25 })).toEqual({
      x: 0.2,
      y: 0.3,
      w: 0.4,
      h: 0.25,
    });
  });

  it("clips a rectangle that runs off the still", () => {
    expect(clampFloorplanVizEditRegion({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })).toEqual({
      x: 0.9,
      y: 0.9,
      w: 0.1,
      h: 0.1,
    });
  });

  it("paints a magenta locator on a black mask, not on the still", async () => {
    const still = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .jpeg()
      .toBuffer();
    const marked = await overlayFloorplanVizEditRegion(
      { mimeType: "image/jpeg", base64: still.toString("base64") },
      { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    );
    const markedBuf = Buffer.from(marked.base64, "base64");
    const { data, info } = await sharp(markedBuf).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(40);
    expect(marked.base64).not.toBe(still.toString("base64"));
    let magenta = 0;
    let black = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 160 && b > 160) magenta += 1;
      if (r < 20 && g < 20 && b < 20) black += 1;
    }
    expect(magenta).toBeGreaterThan(20);
    expect(black).toBeGreaterThan(20);
  });

  it("scrubs a copied magenta rectangle off the still", async () => {
    const oak = { r: 180, g: 130, b: 70 };
    const base = await sharp({
      create: { width: 40, height: 40, channels: 3, background: oak },
    })
      .jpeg()
      .toBuffer();
    const stained = await sharp(base)
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
              <rect x="8" y="8" width="20" height="20" fill="none" stroke="#ff00dc" stroke-width="4"/>
            </svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .jpeg()
      .toBuffer();
    const before = await sharp(stained).raw().toBuffer();
    let magentaBefore = 0;
    for (let i = 0; i < before.length; i += 3) {
      if ((before[i] ?? 0) > 160 && (before[i + 2] ?? 0) > 160) magentaBefore += 1;
    }
    expect(magentaBefore).toBeGreaterThan(10);
    const cleaned = await stripMagentaLocatorFromJpeg({
      mimeType: "image/jpeg",
      base64: stained.toString("base64"),
    });
    const after = await sharp(Buffer.from(cleaned.base64, "base64")).raw().toBuffer();
    let magentaAfter = 0;
    for (let i = 0; i < after.length; i += 3) {
      if ((after[i] ?? 0) > 160 && (after[i + 2] ?? 0) > 160) magentaAfter += 1;
    }
    expect(magentaAfter).toBeLessThan(3);
  });

  it("tells the model the magenta box is a locator, not furniture", () => {
    const region = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const prompt = buildStillEditPrompt(
      parseFloorplanLayout({ rooms: [{ name: "סלון", kind: "living", source: "ocr_verified" }] }),
      { kind: "overview" },
      "תוריד את המסך",
      { styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic, region },
    );
    expect(prompt).toContain("LOCATOR");
    expect(prompt).toContain("BLACK MASK");
    expect(prompt).toContain(editRegionPromptBlock(region).slice(0, 40));
    expect(prompt).toContain("magenta");
    expect(prompt).toContain("תוריד את המסך");
    expect(prompt).toContain("USER REQUEST");
    expect(formatFloorplanVizEditPrompt("תוריד את המסך", region)).toContain("10%");
  });

  it("pastes the edited patch back so pixels outside the mark stay put", async () => {
    const original = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const edited = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 40, g: 40, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const mixed = await compositeFloorplanVizEditRegion(
      { mimeType: "image/jpeg", base64: original.toString("base64") },
      { mimeType: "image/jpeg", base64: edited.toString("base64") },
      { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    );
    const { data, info } = await sharp(Buffer.from(mixed.base64, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const o = (y * info.width + x) * info.channels;
      return [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0] as const;
    };
    const corner = at(1, 1);
    const center = at(20, 20);
    expect(corner[0]).toBeGreaterThan(140);
    expect(center[2]).toBeGreaterThan(140);
  });
});
