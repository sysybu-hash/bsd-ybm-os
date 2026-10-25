/**
 * @jest-environment node
 */
import { stripInventStoneAtBins } from "@/lib/projects/building/house-yard";
import type { Primitive } from "@/lib/projects/building/model";

describe("stripInventStoneAtBins", () => {
  it("removes jerusalemStone fence whose centre sits in the bin enclosure", () => {
    const prims: Primitive[] = [
      { type: "box", centre: { x: 12, y: 0.5, z: 21 }, size: { x: 2, y: 1, z: 1.5 }, material: "metal", tag: "yard:bins" },
      { type: "box", centre: { x: 12.2, y: 0.6, z: 21.1 }, size: { x: 0.35, y: 1.2, z: 0.35 }, material: "jerusalemStone", tag: "yard:fence" },
      { type: "box", centre: { x: 5, y: 0.6, z: 10 }, size: { x: 0.35, y: 1.2, z: 0.35 }, material: "jerusalemStone", tag: "yard:fence" },
    ];
    const out = stripInventStoneAtBins(prims);
    expect(out.filter((p) => p.tag === "yard:fence")).toHaveLength(1);
    const fence = out.find((p) => p.tag === "yard:fence" && p.type === "box");
    expect(fence?.type === "box" && fence.centre.x).toBe(5);
  });

  it("removes a lip pillar just outside the metal bins footprint", () => {
    const prims: Primitive[] = [
      { type: "box", centre: { x: 12, y: 0.5, z: 21 }, size: { x: 2, y: 1, z: 1.5 }, material: "metal", tag: "yard:bins" },
      // Centre ~0.4 m past the bin AABB — still invent stone on the enclosure lip.
      { type: "box", centre: { x: 13.4, y: 0.6, z: 21.1 }, size: { x: 0.35, y: 1.2, z: 0.35 }, material: "jerusalemStone", tag: "yard:fence" },
    ];
    expect(stripInventStoneAtBins(prims).filter((p) => p.tag === "yard:fence")).toHaveLength(0);
  });
});
