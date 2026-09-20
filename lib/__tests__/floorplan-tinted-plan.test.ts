import { buildTintedPlanJpeg } from "@/lib/projects/floorplan-tinted-plan";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import sharp from "sharp";

jest.setTimeout(30_000);

const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "סלון", bbox: { x: 0.55, y: 0.25, w: 0.25, h: 0.25 } },
      { name: "מטבח", bbox: { x: 0.2, y: 0.28, w: 0.28, h: 0.12 } },
      { name: "חדר שינה", bbox: { x: 0.2, y: 0.6, w: 0.2, h: 0.16 } },
      { name: "ממ\"ד", bbox: { x: 0.36, y: 0.42, w: 0.18, h: 0.16 } },
    ],
  });

async function sheetJpeg(): Promise<string> {
  const png = await sharp({
    create: { width: 600, height: 850, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .toBuffer();
  return png.toString("base64");
}

describe("the sheet, washed by room", () => {
  it("crops to the flat and keeps the drawing's own aspect", async () => {
    // The rooms span x 0.2–0.8 and y 0.25–0.76 of a 600 by 850 sheet: about
    // 360 by 434 drawing units, so the crop is taller than it is wide.
    const tinted = await buildTintedPlanJpeg(
      { base64: await sheetJpeg(), mimeType: "image/jpeg" },
      layout(),
      { width: 400 },
    );
    expect(tinted).not.toBeNull();
    const meta = await sharp(Buffer.from(tinted!.base64, "base64")).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBeGreaterThan(400);
    expect(tinted!.rooms).toBe(4);
  });

  it("has nothing to wash when the rooms were never placed", async () => {
    const unplaced = parseFloorplanLayout({
      rooms: [{ name: "סלון" }, { name: "מטבח" }, { name: "חדר שינה" }],
    });
    expect(
      await buildTintedPlanJpeg({ base64: await sheetJpeg(), mimeType: "image/jpeg" }, unplaced),
    ).toBeNull();
  });
});
