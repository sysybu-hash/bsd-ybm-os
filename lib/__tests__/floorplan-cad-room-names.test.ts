import { layoutFromCadRooms } from "@/lib/projects/floorplan-viz-route";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

/** A4 at 72dpi, the page these sheets are plotted on. */
const page = { width: 595, height: 842 };

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
  it("gives a measured room the name the sheet prints inside it", () => {
    // The geometry calls a room after what it holds — "חלל 1" — because that is
    // all it knows. The extractor read ממ"ד off the sheet and where it sits, as
    // a fraction of the page: 0.25 of 595 is 149, inside the first room.
    const rooms = [
      measured(100, 100, 100, 100, "other", "חלל 1"),
      measured(400, 100, 100, 100, "living", "חדר מגורים 1"),
    ];
    const extracted = parseFloorplanLayout({
      rooms: [
        { name: "ממ\"ד", bbox: { x: 0.2, y: 0.14, w: 0.1, h: 0.05 } },
        { name: "סלון", bbox: { x: 0.72, y: 0.14, w: 0.1, h: 0.05 } },
      ],
    });
    const layout = layoutFromCadRooms(extracted, rooms, 28, { page });
    expect(layout.rooms.map((r) => r.name)).toEqual(["ממ\"ד", "סלון"]);
  });

  it("keeps the geometry's name when no label sits in that room", () => {
    const rooms = [measured(100, 100, 100, 100, "other", "חלל 1")];
    const extracted = parseFloorplanLayout({
      rooms: [{ name: "סלון", bbox: { x: 0.8, y: 0.8, w: 0.1, h: 0.05 } }],
    });
    const layout = layoutFromCadRooms(extracted, rooms, 28, { page });
    expect(layout.rooms[0]!.name).toBe("חלל 1");
  });

  it("uses each printed label once", () => {
    // Two rooms, one label inside the first: the second keeps its own name.
    const rooms = [
      measured(100, 100, 100, 100, "other", "חלל 1"),
      measured(100, 300, 100, 100, "other", "חלל 2"),
    ];
    const extracted = parseFloorplanLayout({
      rooms: [{ name: "ממ\"ד", bbox: { x: 0.2, y: 0.14, w: 0.1, h: 0.05 } }],
    });
    const layout = layoutFromCadRooms(extracted, rooms, 28, { page });
    expect(layout.rooms.map((r) => r.name)).toEqual(["ממ\"ד", "חלל 2"]);
  });

  it("leaves the names alone when the page size is unknown", () => {
    // A label is a fraction of a page; without one there is nothing to compare.
    const rooms = [measured(100, 100, 100, 100, "other", "חלל 1")];
    const extracted = parseFloorplanLayout({
      rooms: [{ name: "סלון", bbox: { x: 0.2, y: 0.14, w: 0.1, h: 0.05 } }],
    });
    expect(layoutFromCadRooms(extracted, rooms, 28).rooms[0]!.name).toBe("חלל 1");
  });
});
