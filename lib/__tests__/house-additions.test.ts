import { houseEntranceFlights, streetSide } from "@/lib/projects/building/house-additions";
import type { Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE as upm } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

type Seg = DwfGeometry["segments"][number];
const line = (x1: number, y1: number, x2: number, y2: number): Seg => ({ x1: x1 * upm, y1: y1 * upm, x2: x2 * upm, y2: y2 * upm, lineWidth: 1, stroke: 0 });
const sheet = (segments: Seg[]): DwfGeometry => ({ pageWidth: 20 * upm, pageHeight: 16 * upm, segments, curves: [], walls: [], texts: [], fills: [], arcs: [] });
const wall = (x0: number, x1: number, z: number, tag: string): Primitive => ({ type: "box", centre: { x: (x0 + x1) / 2, y: 0.3, z }, size: { x: x1 - x0, y: 0.9, z: 0.25 }, material: "metal", tag });

describe("the ground floor's entrance flights stood on the plot", () => {
  const house: Array<[number, number]> = [[2, 2], [12, 2], [12, 9.5], [2, 9.5]];
  const plot = { x0: 0, z0: 0, x1: 20, z1: 15 };
  const g = sheet([10, 10.3, 10.6, 10.9].map((z) => line(5, z, 6.5, z)));
  const yard = (): Primitive[] => [
    { type: "prism", ring: [[0, 0], [20, 0], [20, 15], [0, 15]], y0: -1.6, y1: 0, material: "floorStone", tag: "yard:paving" },
    wall(3, 7, 15, "yard:fence"),
    wall(3, 7, 15, "yard:railing"),
    { type: "box", centre: { x: 7.3, y: 0.6, z: 15 }, size: { x: 1.1, y: 1.2, z: 0.05 }, material: "metal", tag: "yard:gate" },
  ];

  it("steps down as many treads as the drop takes at the standard riser, lays the path on to the sidewalk, opens the fence and stands the gate in the path", () => {
    const prims = yard();
    const { primitives, flights } = houseEntranceFlights({ sheet: g, shift: { x: 0, y: 0 }, outlines: [house], ground: 0, plot, levels: { west: -1.5, east: -1.5 }, front: "south", prims });
    expect(flights).toHaveLength(1);
    // The 1.65 m drop at 15 cm a riser: eleven, though the plan draws four lines — the street facade counts eleven down such a drop.
    expect(flights[0]!.risers).toBe(11);
    expect(flights[0]!.riser).toBeCloseTo(0.15, 2);
    // The 11 treads, then the level path on to the edge at 15; nosings and cheeks not counted.
    const boxes = primitives.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.tag === "yard:stairs" && p.material !== "stoneDark" && p.material !== "jerusalemStone" && p.material !== "stairShade");
    expect(boxes).toHaveLength(11 + 1);
    const tops = boxes.slice(11).map((b) => b.centre.y + b.size.y / 2);
    expect(tops[0]!).toBeCloseTo(-1.65, 1);
    expect(tops[tops.length - 1]!).toBeCloseTo(-1.65, 1);
    const paving = prims.find((p) => p.tag === "yard:paving");
    expect(paving?.type === "prism" && paving.holes?.length).toBe(1);
    const fence = prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.tag === "yard:fence");
    expect(fence.map((p) => [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2].map((v) => Math.round(v * 10) / 10))).toEqual([[3, 5], [6.5, 7]]);
    const gate = prims.find((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.tag === "yard:gate")!;
    expect(gate.centre.x).toBeCloseTo(5.75);
    expect(gate.size.x).toBeCloseTo(1.5);
    expect(gate.centre.y - gate.size.y / 2).toBeCloseTo(-1.65);
  });

  it("counts a shallow drop in fewer steps: five down 0.76 m, not the eleven of a deep one", () => {
    const { flights } = houseEntranceFlights({ sheet: g, shift: { x: 0, y: 0 }, outlines: [house], ground: 0, plot, levels: { west: -0.62, east: -0.62 }, front: "south", prims: yard() });
    expect(flights[0]!.risers).toBe(5);
    expect(flights[0]!.riser).toBeCloseTo(0.154, 2);
  });

  it("runs a deep drop's steps back toward the house when the plan draws only the last ones, leaving a landing at the door", () => {
    // Treads drawn from 12.4, five of them, 3 m from the house wall at 9.5 and 2.6 m short of the plot's edge at 15.
    const far = sheet([12.4, 12.7, 13.0, 13.3, 13.6].map((z) => line(5, z, 6.5, z)));
    const { flights } = houseEntranceFlights({ sheet: far, shift: { x: 0, y: 0 }, outlines: [house], ground: 0, plot, levels: { west: -1.5, east: -1.5 }, front: "south", prims: yard() });
    const f = flights[0]!;
    expect(f.risers).toBe(11);
    expect(f.riser).toBeCloseTo(0.15, 2);
    const first = f.flight.lines[0]!;
    // The first step is at least 1 m from the wall, and the steps are the plan's own spacing.
    expect(first - 9.5).toBeGreaterThanOrEqual(1.0 - 1e-9);
    expect(first).toBeLessThan(12.4);
    expect(f.flight.lines[1]! - first).toBeCloseTo(0.3, 5);
  });

  it("stands no flight where the land at its foot is not below the floor", () => {
    const prims = yard();
    const { primitives, flights } = houseEntranceFlights({ sheet: g, shift: { x: 0, y: 0 }, outlines: [house], ground: 0, plot, levels: { west: 0.5, east: 0.5 }, front: "south", prims });
    expect(primitives).toEqual([]);
    expect(flights[0]!.skipped).toBeTruthy();
    expect(prims).toEqual(yard());
  });

  it("knows the street's side by its railing", () => {
    expect(streetSide(yard(), plot)).toBe("south");
    expect(streetSide([], plot)).toBeNull();
  });
});
