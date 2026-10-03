import { asCutPlan, cutModel, forTracing } from "@/lib/projects/building/cut-model";
import type { BuildingModel } from "@/lib/projects/building/model";
import { outlineEdges } from "@/lib/projects/scene3d/floors";

const model: BuildingModel = {
  name: "t",
  north: { x: 0, z: -1 },
  extent: { x: 0, z: 0, width: 10, depth: 10, yMin: 0, yMax: 6 },
  primitives: [
    { type: "box", centre: { x: 2, y: 1.5, z: 2 }, size: { x: 4, y: 3, z: 0.2 }, material: "plaster", tag: "f1" },
    { type: "box", centre: { x: 2, y: 4.5, z: 2 }, size: { x: 4, y: 3, z: 0.2 }, material: "plaster", tag: "f2" },
    { type: "box", centre: { x: 3, y: 0.4, z: 3 }, size: { x: 2, y: 0.8, z: 0.9 }, material: "linen", tag: "f1:inside:furniture" },
    { type: "prism", ring: [[0, 0], [4, 0], [4, 4], [0, 4]], y0: -0.2, y1: 0, material: "slab", tag: "f1:slab" },
  ],
};

describe("a plan's cut, made in the geometry", () => {
  it("stops the wall at the cut, solid on top, and drops the storey above", () => {
    const cut = cutModel(model, 1.3);
    const walls = cut.primitives.filter((p) => p.type === "box" && p.material === "plaster");
    expect(walls).toHaveLength(1);
    const w = walls[0]!;
    if (w.type !== "box") throw new Error("box");
    expect(w.centre.y + w.size.y / 2).toBeCloseTo(1.3, 9);
    expect(cut.primitives.filter((p) => p.type === "box" && p.material === "poche")).toHaveLength(1);
    // Furniture below the cut is left whole, and gets no poche.
    expect(cut.primitives.some((p) => p.type === "box" && p.material === "linen" && p.size.y === 0.8)).toBe(true);
  });

  it("draws the storey alone on a sheet, without the clipping plane", () => {
    const plan = asCutPlan({ model, width: 100, height: 100, exposure: 1, ao: false, sun: { azimuthDeg: 0, elevationDeg: 60 }, camera: { position: { x: 5, y: 80, z: 5 }, target: { x: 5, y: 0, z: 5 }, fovDeg: 30, cutAboveM: 1.3 } });
    expect(plan.camera.cutAboveM).toBeUndefined();
    expect(plan.camera.studio).toBe(true);
    expect(plan.model.primitives.some((p) => p.tag === "sheet")).toBe(true);
  });
});

describe("a traced view from outside", () => {
  it("leaves the apartments' furnishings out", () => {
    const traced = forTracing({ model, width: 100, height: 100, exposure: 1, ao: false, sun: { azimuthDeg: 0, elevationDeg: 60 }, camera: { position: { x: 30, y: 10, z: 30 }, target: { x: 5, y: 3, z: 5 }, fovDeg: 30 }, pathTrace: { samples: 8 } });
    expect(traced.model.primitives.some((p) => (p.tag ?? "").includes(":inside:"))).toBe(false);
    expect(traced.model.primitives).toHaveLength(3);
  });
});

describe("a region's outline", () => {
  it("leaves out the stretch two rectangles of unequal widths share", () => {
    // 2 m wide over 3 m wide: the shared edge at y = 1 is inside from x 0 to 2.
    const edges = outlineEdges([
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 0, y: 1, w: 3, h: 1 },
    ]);
    const atOne = edges.filter((e) => e.orientation === "h" && e.at === 1);
    expect(atOne).toEqual([{ orientation: "h", at: 1, from: 2, to: 3 }]);
  });
});
