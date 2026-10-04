import { inventoryByPlace, openFloorSquares, planPlace } from "@/lib/projects/scene3d/inventory";

const extent = { x: -6, z: -9, width: 12, depth: 18 };

describe("the inventory a design is held to", () => {
  it("places a point on the plan in thirds, north up", () => {
    expect(planPlace(-5, -8, extent)).toBe("top left");
    expect(planPlace(0, 0, extent)).toBe("middle");
    expect(planPlace(5, 0, extent)).toBe("middle right");
    expect(planPlace(0, 8.9, extent)).toBe("bottom centre");
  });

  it("counts by place, not by the room the measurement put a piece in", () => {
    const text = inventoryByPlace(
      [
        { what: "single bed", x: -5, z: -8 },
        { what: "single bed", x: 0, z: 1 },
        { what: "single bed", x: 0.5, z: 2 },
        { what: "chair", x: 0, z: -3 },
        { what: "sofa", x: 1, z: -1 },
      ],
      extent,
    );
    expect(text.split("\n")[0]).toBe("In all: 3 single beds, 1 chair, 1 sofa.");
    expect(text).toContain("- 3 single beds: 1 at the top left, 2 at the middle");
    expect(text).toContain("- 1 sofa: 1 at the middle");
    // Chairs are counted, not placed one by one.
    expect(text).not.toContain("- 1 chair");
  });
});

describe("the open floor a design is checked on", () => {
  const box = (kind: string, x: number, z: number, w: number, d: number) => ({ kind, sourceId: `${kind}:${x}`, material: "m", centre: { x, y: 0.5, z }, size: { x: w, y: 1, z: d } });
  const room = (kind: string, x: number, z: number, w: number, d: number) => ({ id: kind, name: kind, kind, areaM2: w * d, rects: [{ x, z, w, d }], bounds: { x, z, w, d } });

  it("finds squares clear of furniture and walls, and none touching a bathroom", () => {
    const scene = {
      extent: { x: 0, z: 0, width: 8, depth: 4 },
      meshes: [box("furniture", 1, 1, 1.6, 1.6), box("wall", 4, 2, 0.2, 4)],
      rooms: [room("living", 0, 0, 4, 4), room("bedroom", 4, 0, 4, 4), room("bathroom", 6, 0, 2, 2)],
    } as never;
    const squares = openFloorSquares(scene, 20);
    expect(squares.length).toBeGreaterThan(0);
    for (const s of squares) {
      // Clear of the sofa-sized piece (0.2–1.8) and the wall at x 3.9–4.1, with 15 cm to spare.
      expect(s.x - 0.65 >= 1.8 || s.z - 0.65 >= 1.8).toBe(true);
      expect(Math.abs(s.x - 4)).toBeGreaterThanOrEqual(0.75);
      expect(s.x + 0.65 <= 6 || s.z - 0.65 >= 2).toBe(true);
    }
  });
});
