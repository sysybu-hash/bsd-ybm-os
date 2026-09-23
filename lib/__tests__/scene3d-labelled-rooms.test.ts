import { buildScene, roomsForScene, type SceneInput } from "@/lib/projects/scene3d/build-scene";

/**
 * A missed doorway lets the flood run from one room into the next, and the two
 * come back as one. On דירה 14 the segmenter returns four rooms — one of them
 * 41 m² — against nine names the sheet prints and the extract verifies. The
 * scene takes the names, and keeps the floor exactly as it was measured.
 */

const UPM = 100;

const input = (): SceneInput => ({
  unitsPerMetre: UPM,
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  bodies: [{ orientation: "v", centre: 300, thickness: 8, from: 0, to: 400 }],
  openings: [],
  // One flooded region covering both sides of a partition whose doorway the
  // measurement missed.
  floorRects: [
    { x: 10, y: 10, w: 280, h: 380 },
    { x: 310, y: 10, w: 280, h: 380 },
  ],
  terraceRects: [],
  furniture: [],
  rooms: [
    {
      name: "ח.שינה 1",
      kind: "bedroom",
      areaM2: 21.3,
      rects: [
        { x: 10, y: 10, w: 280, h: 380 },
        { x: 310, y: 10, w: 280, h: 380 },
      ],
    },
  ],
  labelledRooms: [
    { name: "ח.שינה", kind: "bedroom", box: { x: 0, y: 0, w: 300, h: 400 } },
    { name: "מטבח", kind: "kitchen", box: { x: 300, y: 0, w: 300, h: 400 } },
  ],
});

describe("rooms the sheet names", () => {
  it("splits one flooded region by the names printed on the drawing", () => {
    const rooms = roomsForScene(input());
    expect(rooms.map((r) => r.name)).toEqual(["ח.שינה", "מטבח"]);
    expect(rooms.map((r) => r.kind)).toEqual(["bedroom", "kitchen"]);
    // Each keeps its own measured rectangle: 280 by 380 units at 100/m.
    for (const room of rooms) {
      expect(room.rects).toHaveLength(1);
      expect(room.areaM2).toBeCloseTo((280 * 380) / (UPM * UPM), 6);
    }
  });

  it("keeps the whole measured floor, dropping none of it", () => {
    const before = input().floorRects.reduce((sum, r) => sum + r.w * r.h, 0);
    const after = roomsForScene(input())
      .flatMap((r) => r.rects)
      .reduce((sum, r) => sum + r.w * r.h, 0);
    expect(after).toBe(before);
  });

  it("leaves the segmenter alone when it found at least as many rooms", () => {
    const fine = input();
    fine.labelledRooms = [{ name: "ח.שינה", kind: "bedroom", box: { x: 0, y: 0, w: 600, h: 400 } }];
    expect(roomsForScene(fine)).toEqual(fine.rooms);
  });

  it("gives a floor the label's own material, so a kitchen tiles", () => {
    const scene = buildScene(input());
    const kitchen = scene.rooms.find((r) => r.kind === "kitchen");
    expect(kitchen).toBeTruthy();
    const floors = scene.meshes.filter((m) => m.kind === "floor" && m.sourceId === kitchen!.id);
    expect(floors.length).toBeGreaterThan(0);
    expect(floors.every((m) => m.material === "floorTile")).toBe(true);
  });

  it("keeps floor a label does not claim, rather than dropping it", () => {
    const partial = input();
    partial.labelledRooms = [
      { name: "ח.שינה", kind: "bedroom", box: { x: 0, y: 0, w: 300, h: 400 } },
      { name: "מטבח", kind: "kitchen", box: { x: 1000, y: 1000, w: 10, h: 10 } },
    ];
    const rooms = roomsForScene(partial);
    const area = rooms.flatMap((r) => r.rects).reduce((sum, r) => sum + r.w * r.h, 0);
    expect(area).toBe(partial.floorRects.reduce((sum, r) => sum + r.w * r.h, 0));
  });
});
