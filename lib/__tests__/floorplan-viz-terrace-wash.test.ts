import { buildTintedPlanJpeg } from "@/lib/projects/floorplan-tinted-plan";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { terraceBoxesOnPage } from "@/lib/projects/floorplan-viz-route";
import sharp from "sharp";

jest.setTimeout(30_000);

const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "סלון", bbox: { x: 0.4, y: 0.3, w: 0.2, h: 0.2 } },
      { name: "חדר שינה", bbox: { x: 0.4, y: 0.55, w: 0.2, h: 0.15 } },
      { name: "מטבח", bbox: { x: 0.4, y: 0.2, w: 0.2, h: 0.08 } },
    ],
  });

async function sheetJpeg(): Promise<string> {
  const buf = await sharp({
    create: { width: 600, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .toBuffer();
  return buf.toString("base64");
}

describe("measured terraces on the washed drawing", () => {
  it("turns scan-line spans into boxes as fractions of the page", () => {
    const boxes = terraceBoxesOnPage(
      [
        [
          { y: 100, spans: [[200, 260]] },
          { y: 140, spans: [[190, 300]] },
        ],
      ] as never,
      { width: 600, height: 800 },
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x).toBeCloseTo(190 / 600, 5);
    expect(boxes[0]!.y).toBeCloseTo(100 / 800, 5);
    expect(boxes[0]!.w).toBeCloseTo(110 / 600, 5);
    expect(boxes[0]!.h).toBeCloseTo(40 / 800, 5);
  });

  it("drops a terrace with no width or no height rather than washing a line", () => {
    expect(terraceBoxesOnPage([[{ y: 10, spans: [[5, 5]] }]] as never, { width: 600, height: 800 })).toEqual([]);
    expect(terraceBoxesOnPage([[{ y: 10, spans: [[5, 40]] }]] as never, { width: 0, height: 800 })).toEqual([]);
  });

  it("widens the crop so a terrace outside the rooms is not cut off", async () => {
    // A terrace is not a room and never reaches layout.rooms: before this, the
    // crop stopped at the last room and the paved pocket fell off the sheet.
    const plan = { base64: await sheetJpeg(), mimeType: "image/jpeg" as const };
    const without = await buildTintedPlanJpeg(plan, layout(), { width: 400 });
    const withTerrace = await buildTintedPlanJpeg(plan, layout(), {
      width: 400,
      terraces: [{ x: 0.1, y: 0.3, w: 0.2, h: 0.2 }],
    });
    expect(without).not.toBeNull();
    expect(withTerrace).not.toBeNull();
    const a = await sharp(Buffer.from(without!.base64, "base64")).metadata();
    const b = await sharp(Buffer.from(withTerrace!.base64, "base64")).metadata();
    // Same printed width, and the wider crop is the shorter image.
    expect(b.height!).toBeLessThan(a.height!);
  });
});
