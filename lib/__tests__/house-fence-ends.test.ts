/**
 * A street fence's slat panel ends in a stone pillar at both ends, whatever
 * cut its wall after it was built.
 */
import { closeFenceEnds } from "@/lib/projects/building/house-yard";
import type { Primitive } from "@/lib/projects/building/model";

type Box = Extract<Primitive, { type: "box" }>;
const box = (x0: number, x1: number, y0: number, y1: number, tag: string, material: Box["material"] = "jerusalemStone", depth = 0.25): Box => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 10 },
  size: { x: x1 - x0, y: y1 - y0, z: depth },
  material,
  tag,
});
const panel = (x0: number, x1: number): Box[] => [
  box(x0, x1, 0.66, 0.71, "yard:railing", "frame", 0.06),
  box(x0, x1, 1.15, 1.2, "yard:railing", "frame", 0.06),
  ...Array.from({ length: Math.floor((x1 - x0) / 0.075) }, (_, i) => box(x0 + 0.05 + i * 0.075 - 0.0175, x0 + 0.05 + i * 0.075 + 0.0175, 0.71, 1.15, "yard:railing", "frame", 0.05)),
];
const pillars = (prims: Primitive[]) =>
  prims.filter((p): p is Box => p.type === "box" && p.tag === "yard:fence" && p.centre.y + p.size.y / 2 >= 1.2).map((p) => [+(p.centre.x - p.size.x / 2).toFixed(2), +(p.centre.x + p.size.x / 2).toFixed(2)]);
const rails = (prims: Primitive[]) =>
  prims.filter((p): p is Box => p.type === "box" && p.tag === "yard:railing" && p.size.y <= 0.06).map((p) => [+(p.centre.x - p.size.x / 2).toFixed(2), +(p.centre.x + p.size.x / 2).toFixed(2)]);

describe("a street fence's ends", () => {
  it("stands a pillar where a cut took the panel's pillar, and cuts the panel back to it", () => {
    // A wall from 0 to 3 with its pillar at 2.65–3 only: the one at 0 went with a path.
    const out = closeFenceEnds([box(0, 3, -0.3, 0.6, "yard:fence"), box(2.65, 3, -0.3, 1.25, "yard:fence"), ...panel(0, 2.65)]);
    expect(pillars(out)).toEqual(expect.arrayContaining([[0, 0.35], [2.65, 3]]));
    expect(rails(out)).toEqual([[0.35, 2.65], [0.35, 2.65]]);
    expect(out.filter((p) => p.type === "box" && p.tag === "yard:railing" && p.size.y > 0.1 && p.centre.x < 0.35)).toEqual([]);
  });

  it("makes a stretch too short for a panel one stone pillar, not two with a slot between", () => {
    const out = closeFenceEnds([box(0, 0.9, -0.3, 0.6, "yard:fence"), ...panel(0, 0.9)]);
    expect(pillars(out)).toEqual([[0, 0.9]]);
    expect(rails(out)).toEqual([]);
  });

  it("takes away a stub of rail a cut left, and the slat under it", () => {
    const out = closeFenceEnds([box(0, 0.5, -0.3, 0.6, "yard:fence"), box(0.1, 0.5, -0.3, 1.25, "yard:fence"), box(0.04, 0.1, 0.66, 0.71, "yard:railing", "frame", 0.06), box(0.04, 0.1, 1.15, 1.2, "yard:railing", "frame", 0.06), box(0.05, 0.085, 0.71, 1.15, "yard:railing", "frame", 0.05)]);
    expect(out.filter((p) => p.type === "box" && p.tag === "yard:railing")).toEqual([]);
    // ...and the pillar runs on to the wall's end: no sliver of wall past it.
    expect(pillars(out)).toEqual([[0, 0.5]]);
  });
});
