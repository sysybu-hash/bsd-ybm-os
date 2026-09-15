import { interiorBriefFromRoom, listGeometryCompanionViews } from "@/lib/projects/floorplan-geometry-views";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

const room = (name: string, kind: SegmentedRoom["kind"]): SegmentedRoom => ({
  rows: [],
  bounds: { x: 0, y: 0, width: 120, height: 90 },
  areaM2: 10.5,
  kind,
  name,
  bedCount: kind === "bedroom" ? 1 : 0,
  contents:
    kind === "bedroom"
      ? [{ x: 0, y: 0, w: 10, h: 20, widthCm: 90, depthCm: 200, kind: "bed" }]
      : [],
});

describe("geometry companion views", () => {
  it("builds the interior brief from measured room contents, not OCR", () => {
    // A vision interior used to invent a second bed. The brief lists only
    // what segmentRooms already measured.
    const brief = interiorBriefFromRoom(room("ח.שינה", "bedroom"));
    expect(brief).toMatch(/10\.5 m²/);
    expect(brief).toMatch(/bed 90×200 cm/);
    expect(brief).toMatch(/Do not add/);
  });

  it("treats extra views as a cost parameter", () => {
    const rooms = [room("ח.שינה", "bedroom"), room("ח.רחצה", "bathroom")];
    expect(listGeometryCompanionViews(rooms, { maxViews: 1 })).toEqual([]);
    const two = listGeometryCompanionViews(rooms, { maxViews: 2 });
    expect(two[0]?.viewId).toBe("isometric");
    const four = listGeometryCompanionViews(rooms, { maxViews: 4 });
    expect(four.some((j) => j.viewId === "interior" && j.roomName === "ח.שינה")).toBe(true);
  });
});
