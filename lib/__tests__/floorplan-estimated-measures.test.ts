import { applyBboxMeasuresToLayout } from "@/lib/projects/floorplan-booklet-rooms";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { formatRoomArea, formatRoomMeasure } from "@/lib/projects/floorplan-viz-explanations";

/**
 * A size read off the box round a room's label is a guess: the box takes in
 * the walls, and דירה 14's ממ"ד came out 12.84 m² against about 9 on the
 * sheet. The booklet shows such a figure with "≈", never as a measurement.
 */
const layout = () =>
  parseFloorplanLayout({
    grossAreaM2: 111.29,
    rooms: [
      { name: "חדר שינה", kind: "bedroom", widthM: 4.06, lengthM: 2.72, bbox: { x: 0.24, y: 0.49, w: 0.2, h: 0.1 } },
      { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.31, w: 0.16, h: 0.15 } },
      { name: "מרפסת", kind: "balcony", areaM2: 4.1, bbox: { x: 0.34, y: 0.25, w: 0.19, h: 0.08 } },
      { name: "מטבח", kind: "kitchen", bbox: { x: 0.42, y: 0.3, w: 0.15, h: 0.25 } },
    ],
  });

describe("sizes guessed from a room's box", () => {
  it("are marked, and printed figures are not", () => {
    const [bedroom, mmd, terrace] = applyBboxMeasuresToLayout(layout()).rooms;
    expect(bedroom).not.toHaveProperty("estimatedDims", true);
    expect(formatRoomMeasure(bedroom!)).toBe("4.06×2.72 מ'");
    expect(mmd).toMatchObject({ estimatedDims: true, estimatedArea: true });
    expect(formatRoomMeasure(mmd!)).toMatch(/^≈ /);
    expect(formatRoomArea(mmd!)).toMatch(/^≈ .* מ"ר$/);
    // The terrace's printed area is real; only its width×length is a guess.
    expect(terrace).toMatchObject({ estimatedDims: true });
    expect(terrace!.estimatedArea).toBeFalsy();
    expect(formatRoomArea(terrace!)).toBe('4.1 מ"ר');
  });

  it("an area a person entered stays a plain figure", () => {
    const entered = parseFloorplanLayout({
      grossAreaM2: 111.29,
      rooms: [
        { name: 'ממ"ד', kind: "mmd", widthM: 2.54, lengthM: 3.57, areaM2: 9.07, source: "confirmed" },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.42, y: 0.3, w: 0.15, h: 0.25 } },
      ],
    });
    const mmd = applyBboxMeasuresToLayout(entered).rooms[0]!;
    expect(formatRoomMeasure(mmd)).toBe("2.54×3.57 מ'");
    expect(formatRoomArea(mmd)).toBe('9.07 מ"ר');
  });
});
