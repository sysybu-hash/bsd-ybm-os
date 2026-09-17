import { buildSchematicPlateJpeg } from "@/lib/projects/floorplan-schematic-plate";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import sharp from "sharp";

const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "מרפסת", bbox: { x: 0.22, y: 0.16, w: 0.55, h: 0.11 } },
      { name: "סלון", bbox: { x: 0.57, y: 0.27, w: 0.22, h: 0.23 } },
      { name: "מטבח", bbox: { x: 0.24, y: 0.3, w: 0.27, h: 0.11 } },
      { name: "ממ\"ד", bbox: { x: 0.37, y: 0.42, w: 0.17, h: 0.15 } },
      { name: "חדר שינה", bbox: { x: 0.24, y: 0.61, w: 0.18, h: 0.15 }, bedCount: 2 },
      { name: "חדר רחצה", bbox: { x: 0.59, y: 0.5, w: 0.18, h: 0.07 } },
    ],
  });

describe("schematic plate", () => {
  it("draws the flat at the aspect the rooms describe", async () => {
    // The flat covers x 0.22–0.79 and y 0.16–0.76 of the sheet, so the plate
    // is taller than it is wide — a plate at the wrong aspect would hand the
    // image model a different apartment.
    const plate = await buildSchematicPlateJpeg(layout(), 600);
    expect(plate).not.toBeNull();
    const meta = await sharp(Buffer.from(plate!.base64, "base64")).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBeGreaterThan(600);
    expect(meta.height).toBeLessThan(700);
  });

  it("has nothing to draw when the rooms were never placed", async () => {
    const unplaced = parseFloorplanLayout({
      rooms: [{ name: "מטבח" }, { name: "סלון" }, { name: "חדר שינה" }],
    });
    expect(await buildSchematicPlateJpeg(unplaced, 600)).toBeNull();
  });
});
