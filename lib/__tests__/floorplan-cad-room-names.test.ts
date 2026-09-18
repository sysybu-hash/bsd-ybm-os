import { layoutFromCadRooms } from "@/lib/projects/floorplan-viz-route";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

const measured = (x: number, y: number, w: number, h: number, kind: string, name: string): SegmentedRoom =>
  ({
    rows: [],
    bounds: { x, y, width: w, height: h },
    areaM2: Math.round(((w * h) / (28 * 28)) * 100) / 100,
    kind,
    name,
    bedCount: 0,
    contents: [],
  }) as unknown as SegmentedRoom;

describe("naming the rooms a CAD measured", () => {
  it("gives a measured room the name the sheet prints in it", () => {
    // The geometry calls a room after what it holds — "חלל 1" — because that is
    // all it knows. The extractor read ממ"ד off the sheet and where it sits.
    const rooms = [
      measured(0, 0, 100, 100, "other", "חלל 1"),
      measured(200, 0, 100, 100, "living", "חדר מגורים 1"),
    ];
    const extracted = parseFloorplanLayout({
      rooms: [
        { name: "ממ\"ד", bbox: { x: 0.0, y: 0.0, w: 0.3, h: 0.9 } },
        { name: "סלון", bbox: { x: 0.7, y: 0.0, w: 0.3, h: 0.9 } },
      ],
    });
    const layout = layoutFromCadRooms(extracted, rooms, 28);
    expect(layout.rooms.map((r) => r.name)).toEqual(["ממ\"ד", "סלון"]);
  });

  it("keeps the geometry's name when no label sits in that room", () => {
    const rooms = [measured(0, 0, 100, 100, "other", "חלל 1")];
    const extracted = parseFloorplanLayout({ rooms: [{ name: "סלון" }] });
    const layout = layoutFromCadRooms(extracted, rooms, 28);
    expect(layout.rooms[0]!.name).toBe("חלל 1");
  });

  it("uses each printed label once", () => {
    // Two measured rooms, one printed label: the label belongs to the room it
    // sits in, and the other room keeps what the geometry called it.
    const rooms = [
      measured(0, 0, 100, 100, "other", "חלל 1"),
      measured(200, 0, 100, 100, "other", "חלל 2"),
    ];
    const extracted = parseFloorplanLayout({
      rooms: [
        { name: "ממ\"ד", bbox: { x: 0.0, y: 0.0, w: 0.3, h: 0.9 } },
        { name: "סלון", bbox: { x: 0.7, y: 0.0, w: 0.3, h: 0.9 } },
      ],
    });
    const layout = layoutFromCadRooms(extracted, rooms, 28);
    expect(layout.rooms.filter((r) => r.name === "ממ\"ד")).toHaveLength(1);
    expect(layout.rooms.filter((r) => r.name === "סלון")).toHaveLength(1);
  });
});
