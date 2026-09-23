import {
  floorplanGeometryPayload,
  parseFloorplanGeometry,
} from "@/lib/projects/floorplan-geometry-payload";
import { buildFlatScene } from "@/lib/projects/scene3d/build-scene";
import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { hashScene } from "@/lib/projects/scene3d/hash";
import { FIXTURE_ROOMS, fixtureFlat, fixtureRows } from "@/lib/__fixtures__/scene3d-flat";

/**
 * A stored run has to rebuild the flat it was measured from — not something
 * like it. Payload v2 carries the regions and the opening kinds the first
 * version dropped, and the proof is that the scene hashes the same either way.
 */

describe("the stored geometry", () => {
  const flat = fixtureFlat({ terraces: [fixtureRows(600, 700, 100, 260)] });
  const payload = floorplanGeometryPayload(flat, FIXTURE_ROOMS);

  it("carries the regions, the terraces and the opening kinds", () => {
    expect(payload.floor?.length).toBeGreaterThan(0);
    expect(payload.terraces).toHaveLength(1);
    expect(payload.openings.map((o) => o.kind)).toEqual(["door", "window"]);
    expect(payload.rooms[0]?.rects?.length).toBeGreaterThan(0);
    expect(payload.rooms[0]?.bedCount).toBe(1);
  });

  it("rebuilds exactly the scene it was measured from", () => {
    const stored = parseFloorplanGeometry(JSON.parse(JSON.stringify(payload)));
    expect(stored).not.toBeNull();
    expect(hashScene(buildSceneFromPayload(stored!))).toBe(hashScene(buildFlatScene(flat, FIXTURE_ROOMS)));
  });

  it("still reads a run saved before any of this existed", () => {
    const v1 = JSON.parse(JSON.stringify(payload)) as Record<string, unknown> & {
      rooms: Array<Record<string, unknown>>;
      openings: Array<Record<string, unknown>>;
    };
    delete v1.floor;
    delete v1.terraces;
    for (const room of v1.rooms) {
      delete room.rects;
      delete room.bedCount;
    }
    for (const opening of v1.openings) delete opening.kind;

    const parsed = parseFloorplanGeometry(v1);
    expect(parsed).not.toBeNull();
    // It draws the same building with square corners — rooms as their bounding
    // boxes — which is the degradation payload v2 exists to end.
    const scene = buildSceneFromPayload(parsed!);
    expect(scene.rooms).toHaveLength(2);
    expect(scene.openings.map((o) => o.kind).sort()).toEqual(["door", "window"]);
  });

  it("stores a room's region as rectangles rather than as scan rows", () => {
    // 38 rows of one span each would be 38 objects; merged it is one rectangle.
    expect(payload.rooms[0]?.rects).toEqual([[10, 10, 286, 380]]);
  });
});
