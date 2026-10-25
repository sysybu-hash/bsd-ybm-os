import { forTracing } from "@/lib/projects/building/cut-model";
import type { BuildingRenderPayload } from "@/lib/projects/building/render-page";
import type { Primitive } from "@/lib/projects/building/model";

const box = (tag: string): Primitive => ({ type: "box", centre: { x: 0, y: 1, z: 0 }, size: { x: 1, y: 1, z: 1 }, material: "plaster", tag });
const model = { name: "m", primitives: [box("floor-0:inside:furniture"), box("floor-0:inside:finish"), box("floor-0:wall")], extent: { x: 0, z: 0, width: 10, depth: 10, yMin: 0, yMax: 6 }, north: { x: 0, z: -1 } };
const payload = (camera: Record<string, unknown>) =>
  ({ width: 100, height: 100, exposure: 1, pathTrace: { samples: 8 }, camera: { position: { x: 0, y: 1, z: 0 }, target: { x: 1, y: 1, z: 0 }, ...camera }, sun: { azimuthDeg: 0, elevationDeg: 30 }, model }) as unknown as BuildingRenderPayload;

describe("forTracing", () => {
  it("leaves the furnishings out of a view from outside: a glimpse through dark glass lost the tracer its sky", () => {
    const out = forTracing(payload({}));
    expect(out.model.primitives.map((p) => p.tag)).toEqual(["floor-0:wall"]);
  });

  it("keeps them for a view from inside a room: they are the picture, and the inside finish is the ceiling", () => {
    const out = forTracing(payload({ interior: true }));
    expect(out.model.primitives.map((p) => p.tag)).toEqual(["floor-0:inside:furniture", "floor-0:inside:finish", "floor-0:wall"]);
  });

  it("changes nothing for a frame that is not traced", () => {
    const p = { ...payload({}), pathTrace: undefined } as BuildingRenderPayload;
    expect(forTracing(p)).toBe(p);
  });
});
