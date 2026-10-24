import { houseSite } from "@/lib/projects/building/house-finish";
import { stackHouseGeometries } from "@/lib/projects/building/house-strip";
import { sheetLevel } from "@/lib/projects/building/from-dwf-sheet";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

const sheet = (width: number): DwfGeometry => ({
  pageWidth: width,
  pageHeight: 400,
  segments: [{ x1: 10, y1: 10, x2: 80, y2: 10, lineWidth: 1 }],
  curves: [],
  walls: [],
  texts: [],
  fills: [],
  arcs: [],
});

describe("a private house's plot", () => {
  const outline: Array<[number, number]> = [
    [0, 0],
    [12, 0],
    [12, 8],
    [0, 8],
  ];

  it("sits the house on flat ground and lets the land fall away", () => {
    const site = houseSite([outline], 0);
    const ground = site.primitives.find((p) => p.type === "terrain");
    expect(ground?.type).toBe("terrain");
    if (ground?.type !== "terrain") return;
    expect(ground.material).toBe("grass");
    const at = (x: number, z: number) => {
      const i = Math.round((x - ground.x0) / ground.dx);
      const j = Math.round((z - ground.z0) / ground.dx);
      return ground.heights[j * ground.nx + i]!;
    };
    expect(at(6, 4)).toBeCloseTo(-0.04, 2);
    const far = ground.heights.filter((_, k) => {
      const i = k % ground.nx;
      const j = Math.floor(k / ground.nx);
      return ground.x0 + i * ground.dx < -4 || ground.z0 + j * ground.dx < -4;
    });
    expect(Math.max(...far) - Math.min(...far)).toBeGreaterThan(0.4);
    expect(site.primitives.some((p) => p.type === "tree")).toBe(true);
    expect(site.primitives.some((p) => p.type === "box" && p.material === "paving")).toBe(false);
  });
});

describe("a private house laid out as one strip", () => {
  it("gives each floor its level and keeps the drawings apart", () => {
    const stacked = stackHouseGeometries(
      [
        { geometry: sheet(500), levelM: 0 },
        { geometry: sheet(500), levelM: 3 },
      ],
      sheet(700),
    );
    expect(sheetLevel({ ...stacked, texts: stacked.texts.filter((t) => t.x < 500) })).toBe(0);
    expect(sheetLevel({ ...stacked, texts: stacked.texts.filter((t) => t.x > 1500 && t.x < 2500) })).toBe(3);
    expect(stacked.pageWidth).toBeGreaterThan(500 + 1400 + 500);
  });
});
