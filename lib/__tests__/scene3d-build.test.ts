import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import type { SpanRow } from "@/lib/projects/floorplan-solid";
import { buildFlatScene } from "@/lib/projects/scene3d/build-scene";
import { hashScene } from "@/lib/projects/scene3d/hash";
import { mergeSpanRows, outlineEdges } from "@/lib/projects/scene3d/floors";
import {
  DOOR_HEAD_M,
  WALL_HEIGHT_M,
  WINDOW_HEAD_M,
  WINDOW_SILL_M,
  WINDOW_SILL_WET_M,
} from "@/lib/projects/scene3d/standards";
import type { SceneBox } from "@/lib/projects/scene3d/types";

/**
 * A flat measured in centimetres: 6.00 by 4.00, split by a partition with a
 * door in it, one window in the top wall, one bed in the left room.
 *
 * Everything here stands in for a measurement. Nothing in the scene builder is
 * allowed to add to it, and these tests are how that is held to.
 */

const UPM = 100;
const PITCH = 10;

function rows(x0: number, x1: number, y0: number, y1: number): SpanRow[] {
  const out: SpanRow[] = [];
  for (let y = y0; y < y1; y += PITCH) out.push({ y, spans: [[x0, x1]] });
  return out;
}

const LEFT = rows(10, 296, 10, 390);
const RIGHT = rows(304, 590, 10, 390);

function room(name: string, kind: SegmentedRoom["kind"], span: SpanRow[], areaM2: number): SegmentedRoom {
  const xs = span.flatMap((r) => r.spans.flat());
  const ys = span.map((r) => r.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    rows: span,
    bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) + PITCH - y },
    areaM2,
    kind,
    name,
    bedCount: kind === "bedroom" ? 1 : 0,
    contents: [],
  };
}

function flat(overrides?: Partial<BuiltFlat>): BuiltFlat {
  return {
    unitsPerMetre: UPM,
    bodies: [
      { orientation: "h", centre: 5, thickness: 10, from: 0, to: 600 },
      { orientation: "h", centre: 395, thickness: 10, from: 0, to: 600 },
      { orientation: "v", centre: 5, thickness: 10, from: 0, to: 400 },
      { orientation: "v", centre: 595, thickness: 10, from: 0, to: 400 },
      { orientation: "v", centre: 300, thickness: 8, from: 0, to: 400 },
    ],
    floor: [...LEFT, ...RIGHT],
    furniture: [{ x: 40, y: 40, w: 90, h: 200, kind: "bed", widthCm: 90, depthCm: 200 }],
    openings: [
      { orientation: "v", centre: 300, thickness: 8, from: 150, to: 240, kind: "door" },
      { orientation: "h", centre: 5, thickness: 10, from: 200, to: 380, kind: "window" },
    ],
    terraces: [],
    printedTerraceCount: 0,
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    floorM2: 22.9,
    areaError: 0,
    svg: "",
    ...overrides,
  } as BuiltFlat;
}

const ROOMS = [
  room("ח.שינה", "bedroom", LEFT, 11.4),
  room("ח.מגורים", "living", RIGHT, 11.4),
];

function volume(mesh: SceneBox): number {
  return mesh.size.x * mesh.size.y * mesh.size.z;
}

describe("the measured flat as a scene", () => {
  const scene = buildFlatScene(flat(), ROOMS);

  it("keeps every wall's volume, minus exactly the holes the drawing cuts", () => {
    // A wall's bands are the wall without its openings: the pieces between
    // them, the band under a sill and the band over a head. Anything else is
    // geometry the renderer made up.
    const walls = scene.meshes.filter(
      (m) => m.kind === "wall" || m.kind === "wallHead" || m.kind === "wallSill",
    );
    const bodies = flat().bodies.reduce(
      (sum, b) => sum + ((b.to - b.from) / UPM) * (b.thickness / UPM) * WALL_HEIGHT_M,
      0,
    );
    // The door is 0.90 wide through an 0.08 wall, open from the floor to 2.10;
    // the window is 1.80 through an 0.10 wall, from 0.90 to 2.10.
    const cut = (0.9 * 0.08 * (DOOR_HEAD_M - 0)) + (1.8 * 0.1 * (WINDOW_HEAD_M - WINDOW_SILL_M));
    expect(walls.reduce((sum, m) => sum + volume(m), 0)).toBeCloseTo(bodies - cut, 6);
  });

  it("puts nothing outside the flat it measured", () => {
    const { x, z, width, depth } = scene.extent;
    for (const mesh of scene.meshes) {
      expect(mesh.centre.x - mesh.size.x / 2).toBeGreaterThanOrEqual(x - 0.05);
      expect(mesh.centre.x + mesh.size.x / 2).toBeLessThanOrEqual(x + width + 0.05);
      expect(mesh.centre.z - mesh.size.z / 2).toBeGreaterThanOrEqual(z - 0.05);
      expect(mesh.centre.z + mesh.size.z / 2).toBeLessThanOrEqual(z + depth + 0.05);
    }
  });

  it("gives a door the floor and a window its sill", () => {
    const door = scene.openings.find((o) => o.kind === "door");
    const window = scene.openings.find((o) => o.kind === "window");
    expect(door).toMatchObject({ sillM: 0, headM: DOOR_HEAD_M, exterior: false });
    expect(window).toMatchObject({ sillM: WINDOW_SILL_M, headM: WINDOW_HEAD_M, exterior: true });
    // Glass in the window, and none in the doorway.
    const glazing = scene.meshes.filter((m) => m.kind === "glazing");
    expect(glazing).toHaveLength(1);
    expect(glazing[0]!.sourceId).toBe(window!.id);
  });

  it("raises a window's sill in a wet room, where privacy asks for it", () => {
    const wet = buildFlatScene(flat(), [room("ח.אמבטיה", "bathroom", LEFT, 11.4), ROOMS[1]!]);
    expect(wet.openings.find((o) => o.kind === "window")?.sillM).toBe(WINDOW_SILL_WET_M);
  });

  it("keeps the bed exactly the box that was measured", () => {
    const bed = scene.meshes.find((m) => m.kind === "furniture");
    expect(bed?.size.x).toBeCloseTo(0.9, 9);
    expect(bed?.size.z).toBeCloseTo(2.0, 9);
    expect(bed?.material).toBe("linen");
  });

  it("floors each room in the material its kind asks for", () => {
    const bedroomFloor = scene.meshes.filter((m) => m.kind === "floor" && m.sourceId === "room:0");
    const livingFloor = scene.meshes.filter((m) => m.kind === "floor" && m.sourceId === "room:1");
    expect(bedroomFloor.length).toBeGreaterThan(0);
    expect(livingFloor.length).toBeGreaterThan(0);
    expect(bedroomFloor.every((m) => m.material === "floorWood")).toBe(true);
    const kitchen = buildFlatScene(flat(), [ROOMS[0]!, room("מטבח", "kitchen", RIGHT, 11.4)]);
    expect(
      kitchen.meshes.filter((m) => m.kind === "floor" && m.sourceId === "room:1").every((m) => m.material === "floorTile"),
    ).toBe(true);
  });

  it("is the same scene every time it is built", () => {
    expect(hashScene(buildFlatScene(flat(), ROOMS))).toBe(hashScene(scene));
  });
});

describe("scanline regions", () => {
  it("merges rows that repeat into one rectangle", () => {
    expect(mergeSpanRows(rows(0, 100, 0, 50))).toEqual([{ x: 0, y: 0, w: 100, h: 50 }]);
  });

  it("keeps an L an L, rather than its bounding box", () => {
    // Two widths, so two rectangles — the bounding box would be one, and would
    // lay floor where the drawing has none.
    const l = [...rows(0, 100, 0, 30), ...rows(0, 40, 30, 60)];
    const merged = mergeSpanRows(l);
    expect(merged).toEqual([
      { x: 0, y: 0, w: 100, h: 30 },
      { x: 0, y: 30, w: 40, h: 30 },
    ]);
    expect(merged.reduce((sum, r) => sum + r.w * r.h, 0)).toBe(100 * 30 + 40 * 30);
  });

  it("returns only the outside edges of a region", () => {
    // Two rectangles side by side: the seam between them is not an edge.
    const edges = outlineEdges([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    ]);
    expect(edges.filter((e) => e.orientation === "v").map((e) => e.at)).toEqual([0, 20]);
  });
});
