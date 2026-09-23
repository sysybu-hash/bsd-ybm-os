import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { cutBox, meshesForView } from "@/lib/projects/scene3d/three-scene";
import { CUTAWAY_OVERVIEW_M, WALL_HEIGHT_M } from "@/lib/projects/scene3d/standards";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import type { SceneBox } from "@/lib/projects/scene3d/types";

const payload = (): FloorplanGeometryPayload => ({
  unitsPerMetre: 100,
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  walls: [
    { orientation: "h", centre: 5, thickness: 10, from: 0, to: 600 },
    { orientation: "v", centre: 300, thickness: 8, from: 0, to: 400 },
  ],
  openings: [
    // In the top wall, which runs along the flat's edge: a window.
    { orientation: "h", centre: 5, thickness: 10, from: 200, to: 380 },
    // In the partition: a doorway.
    { orientation: "v", centre: 300, thickness: 8, from: 150, to: 240 },
  ],
  furniture: [{ x: 40, y: 40, w: 90, h: 200, kind: "bed", widthCm: 90, depthCm: 200 }],
  rooms: [
    { name: "ח.שינה", kind: "bedroom", areaM2: 11.4, bounds: { x: 10, y: 10, width: 286, height: 380 } },
    { name: "ח.מגורים", kind: "living", areaM2: 11.4, bounds: { x: 304, y: 10, width: 286, height: 380 } },
  ],
});

const box = (y: number, height: number): SceneBox => ({
  kind: "wall",
  material: "wall",
  centre: { x: 0, y, z: 0 },
  size: { x: 1, y: height, z: 0.1 },
  sourceId: "wall:0",
});

describe("a stored run, as a scene", () => {
  it("reads an opening in an outer wall as a window and one inside as a doorway", () => {
    // The payload drops the opening kind the measurement had. Where the wall
    // runs along the flat's edge the opening is glazed; inside it is a door.
    const scene = buildSceneFromPayload(payload());
    expect(scene.openings.map((o) => o.kind).sort()).toEqual(["door", "window"]);
    expect(scene.openings.find((o) => o.kind === "window")?.sillM).toBeGreaterThan(0);
    expect(scene.openings.find((o) => o.kind === "door")?.sillM).toBe(0);
  });

  it("keeps the rooms and the furniture it was given", () => {
    const scene = buildSceneFromPayload(payload());
    expect(scene.rooms.map((r) => r.kind)).toEqual(["bedroom", "living"]);
    expect(scene.meshes.filter((m) => m.kind === "furniture")).toHaveLength(1);
  });
});

describe("the cutaway", () => {
  it("shortens a wall that crosses the line and drops one entirely above it", () => {
    expect(cutBox(box(WALL_HEIGHT_M / 2, WALL_HEIGHT_M), CUTAWAY_OVERVIEW_M)?.size.y).toBeCloseTo(
      CUTAWAY_OVERVIEW_M,
      9,
    );
    // The band over a door starts at 2.10 — above a 1.35 cut, so it is gone.
    expect(cutBox(box(2.4, 0.6), CUTAWAY_OVERVIEW_M)).toBeNull();
    // And a wall that is already below the line is untouched.
    const low = box(0.5, 1);
    expect(cutBox(low, CUTAWAY_OVERVIEW_M)).toBe(low);
  });

  it("cuts the building and leaves the furniture whole", () => {
    const scene = buildSceneFromPayload(payload());
    const cut = meshesForView(scene, CUTAWAY_OVERVIEW_M);
    const wardrobeHigh = cut.filter((m) => m.kind === "furniture");
    expect(wardrobeHigh).toHaveLength(1);
    expect(cut.filter((m) => m.kind === "wall").every((m) => m.centre.y + m.size.y / 2 <= CUTAWAY_OVERVIEW_M + 1e-9)).toBe(true);
    // Nothing is cut when no cutaway is asked for.
    expect(meshesForView(scene)).toHaveLength(scene.meshes.length);
  });
});
