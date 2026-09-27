import { applyShelterMarkToLayout } from "@/lib/projects/floorplan-booklet-rooms";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

/** דירה 14 as the room read saw it: four "bedrooms", no ממ"ד. */
const read = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.17, y: 0.19, w: 0.18, h: 0.13 } },
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.31, w: 0.16, h: 0.15 } },
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.24, y: 0.49, w: 0.2, h: 0.1 } },
      { name: "מטבח", kind: "kitchen", bbox: { x: 0.42, y: 0.3, w: 0.15, h: 0.25 } },
    ],
  });

/** The "+2" sill mark on the sheet, as a fraction of the page. */
const mark = { x: 0.2427, y: 0.3505 };

describe("the ממ\"ד from the sheet's +2 mark", () => {
  it("names the one bedroom that holds the mark", () => {
    const rooms = applyShelterMarkToLayout(read(), [mark]).rooms;
    expect(rooms.map((r) => r.kind)).toEqual(["bedroom", "mmd", "bedroom", "kitchen"]);
    expect(rooms[1]!.name).toBe('ממ"ד');
  });

  it("leaves the read alone when the mark is in no bedroom, or in two", () => {
    expect(applyShelterMarkToLayout(read(), [{ x: 0.5, y: 0.4 }]).rooms.some((r) => r.kind === "mmd")).toBe(false);
    const overlapping = parseFloorplanLayout({
      rooms: [
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.3, w: 0.2, h: 0.2 } },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 } },
      ],
    });
    expect(applyShelterMarkToLayout(overlapping, [{ x: 0.25, y: 0.4 }]).rooms.some((r) => r.kind === "mmd")).toBe(false);
  });

  it("does not add a second ממ\"ד to a read that already has one", () => {
    const withMmd = parseFloorplanLayout({
      rooms: [
        { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
        ...read().rooms,
      ],
    });
    expect(applyShelterMarkToLayout(withMmd, [mark]).rooms.filter((r) => r.kind === "mmd")).toHaveLength(1);
  });
});
