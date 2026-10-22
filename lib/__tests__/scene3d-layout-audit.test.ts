import { auditFlatScene } from "@/lib/projects/scene3d/layout-audit";
import type { FlatScene, SceneBox } from "@/lib/projects/scene3d/types";

const box = (kind: SceneBox["kind"], x: number, z: number, w: number, d: number, h = 0.04, id: string = kind): SceneBox => ({
  kind,
  material: "wall",
  centre: { x: x + w / 2, y: h / 2, z: z + d / 2 },
  size: { x: w, y: h, z: d },
  sourceId: id,
});

// Two rooms, 4 by 3 m each, side by side, with a wall between at x = 4.
const scene = (opts: { door?: boolean; terraceWall?: boolean } = {}): FlatScene => ({
  version: 1,
  unitsPerMetre: 100,
  extent: { x: 0, z: 0, width: 8, depth: 5 },
  meshes: [
    box("floor", 0, 0, 4, 3),
    box("floor", 4.1, 0, 3.9, 3),
    box("wall", 4, 0, 0.1, 3, 2.7, "wall:mid"),
    // The facade between the rooms and the terrace.
    box("wall", 0, 3, 8, 0.1, 2.7, "wall:facade"),
    box("terrace", 0, 3.1, 8, 1.9),
    ...(opts.terraceWall ? [box("wall", 3, 3.4, 0.1, 1.2, 2.7, "wall:stub")] : []),
  ],
  rooms: [
    { id: "a", name: "a", kind: "living", areaM2: 12, rects: [{ x: 0, z: 0, w: 4, d: 3 }], bounds: { x: 0, z: 0, w: 4, d: 3 } },
    { id: "b", name: "b", kind: "bedroom", areaM2: 11.7, rects: [{ x: 4.1, z: 0, w: 3.9, d: 3 }], bounds: { x: 4.1, z: 0, w: 3.9, d: 3 } },
  ],
  openings: opts.door
    ? [{ id: "d", kind: "door", centre: { x: 4.05, y: 1, z: 1.5 }, size: { x: 0.1, y: 2, z: 0.9 }, sillM: 0, headM: 2.1, exterior: false }]
    : [],
  lights: [],
});

describe("what a measured flat must never be", () => {
  it("finds a room with no way in", () => {
    const faults = auditFlatScene(scene());
    expect(faults.filter((f) => f.kind === "sealed room").length).toBeGreaterThan(0);
  });

  it("passes rooms joined by a door", () => {
    expect(auditFlatScene(scene({ door: true })).filter((f) => f.kind === "sealed room")).toHaveLength(0);
  });

  it("finds a wall standing out on a terrace", () => {
    const faults = auditFlatScene(scene({ door: true, terraceWall: true }));
    expect(faults.some((f) => f.kind === "wall on a terrace" && f.detail.includes("wall:stub"))).toBe(true);
  });

  it("finds a room the sheet names nowhere", () => {
    const faults = auditFlatScene(scene({ door: true }), { labelled: [{ name: "סלון", box: { x: 1, z: 1, w: 1, d: 1 } }] });
    expect(faults.filter((f) => f.kind === "unlabelled space").map((f) => f.detail)).toEqual([expect.stringContaining("bedroom")]);
  });
});
