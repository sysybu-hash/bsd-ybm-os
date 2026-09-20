import sharp from "sharp";

import {
  restoreStampBar,
  splitStampBar,
  stampFloorplanStill,
} from "@/lib/projects/floorplan-viz-stamp";
import {
  EDIT_REDRAW_LIMIT,
  editRedrewTheFrame,
  measureEditChange,
} from "@/lib/projects/floorplan-viz-edit-guard";
import {
  buildStillEditPrompt,
  rescaleRegionOffTheBar,
} from "@/lib/projects/viz-generate/edit";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

// sharp does real work on 600x800 buffers; the default 5s is tight under load.
jest.setTimeout(30_000);

async function frame(
  width = 600,
  height = 800,
  background = "#c9a06a",
): Promise<{ base64: string; mimeType: string }> {
  const buf = await sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer();
  return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
}

describe("editing the frame the model drew", () => {
  it("takes the caption strip off and puts it back at the same size", async () => {
    const drawn = await frame();
    const stamped = await stampFloorplanStill(drawn, { unitLabel: "14", areaM2: 111.29 });
    const before = await sharp(Buffer.from(stamped.base64, "base64")).metadata();
    expect(before.height).toBeGreaterThan(800);

    const split = await splitStampBar(stamped);
    expect(split).not.toBeNull();
    expect(split!.drawingHeight).toBe(800);
    expect(split!.stampedHeight).toBe(before.height);

    // What the model gets back is the frame alone, at the aspect it drew.
    const cropped = await sharp(Buffer.from(split!.drawing.base64, "base64")).metadata();
    expect(cropped.width).toBe(600);
    expect(cropped.height).toBe(800);

    // An "edit" that comes back at a different size is forced back into frame.
    const wrongSize = await frame(400, 300, "#b08a5a");
    const restored = await restoreStampBar(wrongSize, split!);
    const after = await sharp(Buffer.from(restored.base64, "base64")).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it("leaves an unstamped still alone", async () => {
    expect(await splitStampBar(await frame())).toBeNull();
  });

  it("restates the operator's mark in the frame's own coordinates", () => {
    const split = {
      drawing: { mimeType: "image/jpeg" as const, base64: "" },
      bar: null,
      width: 600,
      drawingHeight: 800,
      stampedHeight: 850,
    };
    // A mark covering the bottom half of the stored still covers more than
    // half of the frame once the strip is gone.
    const moved = rescaleRegionOffTheBar({ x: 0.1, y: 0.5, w: 0.2, h: 0.4 }, split);
    expect(moved!.y).toBeCloseTo(0.5313, 3);
    expect(moved!.h).toBeCloseTo(0.425, 3);
    expect(moved!.x).toBe(0.1);
  });

  it("passes a mark through when there was no strip", () => {
    const region = { x: 0.1, y: 0.5, w: 0.2, h: 0.4 };
    expect(rescaleRegionOffTheBar(region, null)).toEqual(region);
  });
});

describe("refusing an edit that redrew the flat", () => {
  it("scores a small change as small", async () => {
    const before = await frame();
    const patched = await sharp(Buffer.from(before.base64, "base64"))
      .composite([
        {
          input: await sharp({
            create: { width: 60, height: 40, channels: 3, background: "#204080" },
          })
            .png()
            .toBuffer(),
          top: 100,
          left: 100,
        },
      ])
      .jpeg()
      .toBuffer();
    const change = await measureEditChange(before, { base64: patched.toString("base64") });
    expect(change!.changed).toBeLessThan(0.1);
    expect(editRedrewTheFrame(change)).toBe(false);
  });

  it("flags a frame that came back as a different picture", async () => {
    const before = await frame();
    const after = await frame(600, 800, "#1b3a5c");
    const change = await measureEditChange(before, after);
    expect(change!.changed).toBeGreaterThan(EDIT_REDRAW_LIMIT);
    expect(editRedrewTheFrame(change)).toBe(true);
  });
});

describe("the edit prompt", () => {
  const layout = parseFloorplanLayout({ rooms: [{ name: "סלון" }] });

  it("pins the frame and spells out an opening swap", () => {
    const prompt = buildStillEditPrompt(
      layout,
      { kind: "overview" },
      "החלף את הדלת בחלון כמו בתוכנית",
    );
    expect(prompt).toMatch(/Same pixel dimensions, same crop, same zoom/);
    expect(prompt).toMatch(/do not zoom in/i);
    expect(prompt).toMatch(/OPENINGS:/);
    expect(prompt).toMatch(/same wall, at the same position and the same width/);
  });
});
