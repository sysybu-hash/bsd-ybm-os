import { parapet } from "@/lib/projects/building/assemble";
import { mirroredFinishes } from "@/lib/projects/building/from-dwf-parts";
import type { Primitive } from "@/lib/projects/building/model";
import { GOTTLIEB_HOUSE, houseNotesFrom } from "@/lib/projects/building/house-project";
import { partsFor } from "@/lib/projects/scene3d/furniture";
import { doubleSinks } from "@/lib/projects/scene3d/furniture/sinks";
import { backFacing } from "@/lib/projects/scene3d/orientation";

const UPM = 100;
const at = (xM: number, yM: number, wM = 0.6, hM = 0.5) => ({ x: xM * UPM, y: yM * UPM, w: wM * UPM, h: hM * UPM });

describe("kitchen sinks under the haredi switch", () => {
  it("builds a kitchen's one drawn sink double, in a haredi home only", () => {
    expect(doubleSinks([at(2, 2)], true, UPM)).toEqual([true]);
    expect(doubleSinks([at(2, 2)], false, UPM)).toEqual([false]);
  });

  it("keeps two drawn sinks two single sinks, side by side or across the kitchen", () => {
    expect(doubleSinks([at(2, 2), at(2.6, 2)], true, UPM)).toEqual([false, false]);
    expect(doubleSinks([at(2, 2), at(4.6, 2)], true, UPM)).toEqual([false, false]);
  });

  it("tells two homes' kitchens apart: each one-sink kitchen gets its double", () => {
    expect(doubleSinks([at(2, 2), at(12, 2)], true, UPM)).toEqual([true, true]);
  });

  it("draws a double sink as two bowls in one rim, a single as one bowl narrower than its box", () => {
    const spec = { wM: 0.8, dM: 0.5, hM: 0.9, facing: "north" as const };
    const double = partsFor("sink", { ...spec, double: true });
    expect(double.filter((p) => p.tag === "basin")).toHaveLength(2);
    expect(double.filter((p) => p.tag === "tap")).toHaveLength(1);
    const single = partsFor("sink", spec);
    expect(single.filter((p) => p.tag === "basin")).toHaveLength(1);
    expect(single.find((p) => p.tag === "rim")!.w).toBeLessThan(spec.wM);
  });

  it("is Gottlieb's: a haredi home, and house.json may say so", () => {
    expect(GOTTLIEB_HOUSE.haredi).toBe(true);
    expect(houseNotesFrom({ haredi: true }).notes.haredi).toBe(true);
    expect(houseNotesFrom({ haredi: "yes" }).problems.join(" ")).toMatch(/haredi/);
  });
});

describe("a washing machine and a sofa from above", () => {
  it("builds a washer as an appliance: a white box, a dark control strip with a dial, a round drum lid", () => {
    const parts = partsFor("fixture", { wM: 0.6, dM: 0.6, hM: 0.85, facing: "north", fixture: "washer" });
    expect(parts.map((p) => p.tag).sort()).toEqual(["dial", "drum", "plate", "washer"]);
    const drum = parts.find((p) => p.tag === "drum")!;
    expect(drum.round).toBeCloseTo(drum.w / 2);
    for (const p of parts) expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it("builds a sofa with its back along a long side, arms at its ends, cushions in its fabric", () => {
    const parts = partsFor("seat", { wM: 2.0, dM: 0.9, hM: 0.42, facing: "north" });
    expect(parts.filter((p) => p.tag === "arm")).toHaveLength(2);
    const back = parts.find((p) => p.tag === "back")!;
    expect(back.w).toBeCloseTo(2.0);
    expect(parts.filter((p) => p.tag === "cushion").every((p) => p.material === "upholstery")).toBe(true);
  });

  it("turns a long seat's back from a short end to the long side by the wall", () => {
    const sofa = at(1, 1, 2.0, 0.9);
    const wallNorth = at(0, 0.8, 4, 0.1);
    expect(backFacing(sofa, "west", [wallNorth], { x: 200, y: 300 }, UPM)).toBe("north");
    expect(backFacing(sofa, "south", [wallNorth], { x: 200, y: 300 }, UPM)).toBe("south");
    // No wall decides: the back away from the room's middle.
    expect(backFacing(sofa, "east", [], { x: 200, y: 300 }, UPM)).toBe("north");
    // An armchair keeps its facing.
    expect(backFacing(at(1, 1, 0.8, 0.8), "west", [wallNorth], { x: 200, y: 300 }, UPM)).toBe("west");
  });
});

describe("a pair's rooms floored alike", () => {
  const finish = (x: number, z: number, w: number, d: number, material: string): Primitive =>
    ({ type: "box", centre: { x, y: 2.98, z }, size: { x: w, y: 0.02, z: d }, material, tag: "floor-1:inside:finish" }) as Primitive;
  const outline: Array<[number, number]> = [[0, 0], [20, 0], [20, 12], [0, 12]];

  it("gives a room left at the fallback porcelain the floor its mirror room has in the other home", () => {
    const out = mirroredFinishes([finish(3, 3, 3, 3, "floorOak"), finish(17, 3, 3, 3, "floorPorcelain")], outline);
    expect((out[1] as { material: string }).material).toBe("floorOak");
  });

  it("leaves a floor alone where the twin is a terrace, or where the floor spans the party wall", () => {
    const terrace = mirroredFinishes([finish(3, 3, 3, 3, "terraceTile"), finish(17, 3, 3, 3, "floorPorcelain")], outline);
    expect((terrace[1] as { material: string }).material).toBe("floorPorcelain");
    const hall = mirroredFinishes([finish(10, 6, 4, 2, "floorPorcelain"), finish(3, 6, 3, 3, "floorOak")], outline);
    expect((hall[0] as { material: string }).material).toBe("floorPorcelain");
  });
});

describe("a roof's parapet over a drawn outline", () => {
  it("runs along an edge drawn a hair off square, not across it", () => {
    // Gottlieb C's balcony recess: 6.70,16.06 to 11.60,16.08 — 2 cm over 4.9 m.
    const ring: Array<[number, number]> = [[0, 0], [10, 0], [10, 5.02], [0, 5]];
    const back = parapet(ring, 6, 7, 0.25, "renderGray", "roof:parapet").find((p) => p.type === "box" && p.centre.z > 4)!;
    expect(back.type === "box" && back.size.x).toBeCloseTo(10, 2);
    expect(back.type === "box" && back.size.z).toBeCloseTo(0.25);
  });
});
