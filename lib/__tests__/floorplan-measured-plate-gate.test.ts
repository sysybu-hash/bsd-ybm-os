import { measuredPlateMatchesSheet } from "@/lib/projects/floorplan-viz-route";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

const measured = (kind: string): SegmentedRoom =>
  ({ kind, name: kind, areaM2: 10, bedCount: 0, contents: [], rows: [], bounds: { x: 0, y: 0, width: 1, height: 1 } }) as unknown as SegmentedRoom;

const sheet = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "סלון" },
      { name: "מטבח" },
      { name: "חדר שינה" },
      { name: "חדר שינה" },
      { name: "חדר שינה" },
    ],
  });

describe("whether a measured plate is a measurement of this flat", () => {
  it("rejects a plate short of the bedrooms the sheet reads", () => {
    // 28-8-23-2: three bedrooms on the sheet, two on the plate, and no kitchen
    // anywhere. The plate passed its own audit and was still another flat.
    const plate = [measured("bedroom"), measured("bedroom"), measured("living"), measured("kitchen")];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(false);
  });

  it("rejects a plate with no kitchen where the sheet prints one", () => {
    const plate = [measured("bedroom"), measured("bedroom"), measured("bedroom"), measured("living")];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(false);
  });

  it("accepts a plate that shows the whole programme", () => {
    const plate = [
      measured("bedroom"),
      measured("bedroom"),
      measured("bedroom"),
      measured("living"),
      measured("kitchen"),
      measured("circulation"),
    ];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(true);
  });

  it("does not block a sheet it could not read", () => {
    const unread = parseFloorplanLayout({ rooms: [] });
    expect(measuredPlateMatchesSheet(unread, [measured("other")])).toBe(true);
  });
});
