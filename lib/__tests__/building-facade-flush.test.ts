import { parapet, type Outline } from "@/lib/projects/building/assemble";
import { flushFacade, parapetOnWalls } from "@/lib/projects/building/from-dwf-sheet";
import type { Primitive } from "@/lib/projects/building/model";

type Box = Extract<Primitive, { type: "box" }>;

/** A wall piece from x0 to x1 and z0 to z1, a storey tall unless told. */
const piece = (x0: number, x1: number, z0: number, z1: number, y0 = 3, y1 = 6, material: Box["material"] = "renderGray", tag = "floor-1"): Box => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 },
  material,
  tag,
});
const z1Of = (p: Primitive) => (p.type === "box" ? p.centre.z + p.size.z / 2 : NaN);
const xOf = (p: Primitive): [number, number] => (p.type === "box" ? [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2] : [NaN, NaN]);

describe("a facade, flush on its outline", () => {
  // The south face of a house's upper floor (model A, floor 1), its outline's edge at z = 17.84.
  const outline: Outline = [
    [3, 4],
    [20, 4],
    [20, 17.84],
    [3, 17.84],
  ];
  const sheet = () => [
    piece(5.3, 6.28, 17.535, 17.84),
    // A partition's end, meeting the facade; the window beside it starts 2 cm on.
    piece(6.28, 6.4, 15.3, 17.84),
    piece(6.42, 7.38, 17.535, 17.84, 3, 3.9),
    piece(6.42, 7.38, 17.535, 17.84, 5.2, 6),
    piece(7.38, 8.78, 17.535, 17.84),
    // The party wall, drawn 2 cm past the facade.
    piece(11.32, 11.54, 6.46, 17.86),
    // A window bay and its pier drawn 2 cm back.
    piece(15.5, 16.46, 17.535, 17.82, 3, 3.9),
    piece(15.5, 16.46, 17.535, 17.82, 5.2, 6),
    piece(16.46, 16.48, 17.535, 17.82),
    piece(16.48, 16.58, 15.3, 17.84),
    // A plaster lining inside, and the window's stone surround standing proud: neither is the facade's plane.
    piece(8, 9, 17.5, 17.535, 3, 6, "plaster"),
    piece(6.42, 6.5, 17.84, 17.96, 3.9, 5.2, "jerusalemStone", "floor-1:surround"),
  ];

  it("has every clad piece's outer face on the outline's edge: no pier proud, no bay back", () => {
    const out = flushFacade(sheet(), outline, "renderGray", "floor-1");
    const clad = out.filter((p) => p.type === "box" && p.material === "renderGray");
    for (const p of clad) expect(z1Of(p)).toBeCloseTo(17.84, 6);
    // The party wall keeps its run into the house.
    const party = clad.find((p) => p.type === "box" && Math.abs(p.centre.x - 11.43) < 0.01)!;
    expect(party.type === "box" && party.centre.z - party.size.z / 2).toBeCloseTo(6.46, 6);
  });

  it("closes the 2 cm slot between a pier and the window beside it", () => {
    const out = flushFacade(sheet(), outline, "renderGray", "floor-1");
    const pier = out.find((p) => p.type === "box" && Math.abs(xOf(p)[0] - 6.28) < 1e-6)!;
    expect(xOf(pier)[1]).toBeCloseTo(6.42, 6);
    // The window's own pieces are where the sheet opened it.
    const sill = out.find((p) => p.type === "box" && p.material === "renderGray" && Math.abs(xOf(p)[0] - 6.42) < 1e-6)!;
    expect(xOf(sill)).toEqual([expect.closeTo(6.42, 6), expect.closeTo(7.38, 6)]);
  });

  it("leaves the lining, the surround and a real step in the facade alone", () => {
    const stepped = [...sheet(), piece(18, 19, 17.4, 17.6)];
    const out = flushFacade(stepped, outline, "renderGray", "floor-1");
    expect(out.find((p) => p.type === "box" && p.material === "plaster")).toEqual(sheet()[10]);
    expect(out.find((p) => p.type === "box" && p.tag === "floor-1:surround")).toEqual(sheet()[11]);
    // 24 cm back: a recess the sheet draws, not a pen's width.
    expect(z1Of(out[out.length - 1]!)).toBeCloseTo(17.6, 6);
  });

  it("does not move the boxes it was given", () => {
    const given = sheet();
    flushFacade(given, outline, "renderGray", "floor-1");
    expect(given).toEqual(sheet());
  });
});

describe("a roof's parapet, on the walls under it", () => {
  // A 10 x 8 m upper floor walled round, its top at +6.00.
  const walls = [piece(0, 10, 0, 0.3), piece(0, 10, 7.7, 8), piece(0, 0.3, 0, 8), piece(9.7, 10, 0, 8)];
  const extent = (p: Primitive) => (p.type === "box" ? { x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2 } : null);
  const length = (ps: Primitive[]) => ps.reduce((n, p) => (p.type === "box" ? n + Math.max(p.size.x, p.size.z) : n), 0);

  it("stands no beam out in the air where a misread line ran the outline out past the walls", () => {
    // The outline as the sheet was misread: a 30 cm spur run 3 m south off the facade, west of the middle.
    const spurred: Outline = [[0, 0], [10, 0], [10, 8], [3.3, 8], [3.3, 11], [3, 11], [3, 8], [0, 8]];
    const raw = parapet(spurred, 6, 7, 0.25, "renderGray", "roof:parapet");
    // As stood before: two bars a metre high out past the facade.
    expect(raw.filter((p) => extent(p)!.z1 > 8.05)).toHaveLength(3);
    const kept = parapetOnWalls(raw, walls);
    expect(kept.filter((p) => extent(p)!.z1 > 8.05)).toHaveLength(0);
    // The facade's own parapet is kept whole, either side of where the spur left it.
    const south = kept.filter((p) => extent(p)!.z1 > 7.9 && extent(p)!.z0 > 7.5);
    expect(length(south)).toBeCloseTo(10 - 0.3, 1);
  });

  it("keeps a parapet whole where the walls run under it", () => {
    const plain: Outline = [[0, 0], [10, 0], [10, 8], [0, 8]];
    const raw = parapet(plain, 6, 7, 0.25, "renderGray", "roof:parapet");
    expect(parapetOnWalls(raw, walls)).toEqual(raw);
  });

  it("caps a party wall run out to the facade, not the air either side of it", () => {
    // The party wall, 23 cm, run out 1.2 m past a recessed facade; the outline round it 73 cm wide.
    const recessed: Outline = [[0, 0], [10, 0], [10, 8], [5.3, 8], [5.3, 9.2], [4.57, 9.2], [4.57, 8], [0, 8]];
    const party = piece(4.82, 5.05, 0.3, 9.2);
    const kept = parapetOnWalls(parapet(recessed, 6, 7, 0.25, "renderGray", "roof:parapet"), [...walls, party]);
    const out = kept.filter((p) => extent(p)!.z1 > 8.3);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      const e = extent(p)!;
      expect(e.x0).toBeGreaterThanOrEqual(4.82 - 1e-6);
      expect(e.x1).toBeLessThanOrEqual(5.05 + 1e-6);
    }
    // Capped to its end.
    expect(Math.max(...out.map((p) => extent(p)!.z1))).toBeCloseTo(9.2, 2);
  });
});
