import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import {
  floorplanGeometryPayload,
  metresOf,
  parseFloorplanGeometry,
} from "@/lib/projects/floorplan-geometry-payload";

const flat = {
  unitsPerMetre: 40,
  bodies: [
    { orientation: "h", centre: 0, thickness: 8, from: 0, to: 400 },
    { orientation: "v", centre: 400, thickness: 8, from: 0, to: 300 },
  ],
  floor: [],
  furniture: [
    { x: 40, y: 40, w: 80, h: 60, kind: "bed", widthCm: 200, depthCm: 150 },
  ],
  openings: [{ orientation: "h", centre: 0, thickness: 8, from: 120, to: 160 }],
  terraces: [],
  printedTerraceCount: 0,
  bounds: { x: 0, y: 0, width: 400, height: 300 },
  floorM2: 75,
  areaError: 0.01,
  svg: "<svg/>",
} as unknown as BuiltFlat;

const rooms = [
  {
    name: "חדר שינה 1",
    kind: "bedroom",
    areaM2: 12.5,
    bounds: { x: 0, y: 0, width: 200, height: 150 },
    rows: [],
    bedCount: 1,
    contents: [],
  },
] as unknown as SegmentedRoom[];

describe("floorplan geometry payload", () => {
  it("keeps what a viewer needs and drops what it does not", () => {
    const payload = floorplanGeometryPayload(flat, rooms);
    expect(payload.unitsPerMetre).toBe(40);
    expect(payload.walls).toHaveLength(2);
    expect(payload.openings).toHaveLength(1);
    expect(payload.furniture[0]).toEqual({
      x: 40, y: 40, w: 80, h: 60, kind: "bed", widthCm: 200, depthCm: 150,
    });
    expect(payload.rooms[0]?.name).toBe("חדר שינה 1");
    // The SVG the render drew stays the pipeline's business. The floor and the
    // terraces now travel, because the 3D engine draws the measured region and
    // not a bounding box — but as merged rectangles, never as scan rows.
    expect(payload).not.toHaveProperty("svg");
    expect(Array.isArray(payload.floor)).toBe(true);
    for (const rect of payload.floor ?? []) expect(rect).toHaveLength(4);
  });

  it("round-trips through storage", () => {
    const payload = floorplanGeometryPayload(flat, rooms);
    const stored = JSON.parse(JSON.stringify(payload)) as unknown;
    expect(parseFloorplanGeometry(stored)).toEqual(payload);
  });

  it("returns nothing for a run saved before geometry was kept", () => {
    expect(parseFloorplanGeometry(null)).toBeNull();
    expect(parseFloorplanGeometry({})).toBeNull();
    expect(parseFloorplanGeometry({ unitsPerMetre: 0, bounds: {}, walls: [] })).toBeNull();
  });

  it("converts drawing units to metres", () => {
    const payload = floorplanGeometryPayload(flat, rooms);
    expect(metresOf(payload, 400)).toBe(10);
    expect(metresOf(payload, 8)).toBeCloseTo(0.2, 5);
  });
});
