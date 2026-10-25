import fixture from "@/lib/__fixtures__/house-truth/gottlieb.json";
import type { Primitive } from "@/lib/projects/building/model";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { HouseInventory } from "@/lib/projects/building/dxf-house";
import { compareToTruth, countsFromModel, describeFinding, hingedOpenings, truthFromAiAnswer, truthFromInventory, type HouseCounts, type HouseTruth } from "@/lib/projects/building/house-truth";

const truths = fixture.sheets as HouseTruth[];
const truthOf = (model: string, storey: number) => truths.find((t) => t.model === model && t.storey === storey)!;

const counts = (over: Partial<HouseCounts> = {}): HouseCounts => ({
  doors: 16,
  windows: 17,
  parking: 4,
  rooms: 8,
  lawnM2: 169.8,
  trees: 0,
  gates: 1,
  fence: true,
  stairs: true,
  ...over,
});

describe("house-truth: the Gottlieb fixture", () => {
  it("holds every model's ground and first floor, as the DWG counts them", () => {
    expect(truths.map((t) => `${t.model}${t.storey}`).sort()).toEqual(["A0", "A1", "B0", "B1", "C0", "C1"]);
    expect(truthOf("A", 0).counts).toMatchObject({ doors: 16, windows: 17, parking: 4, rooms: 8, trees: 0 });
    expect(truthOf("A", 0).doorWidths).toEqual({ "70": 6, "80": 4, "90": 6 });
    expect(truthOf("C", 1).counts).toMatchObject({ doors: 16, windows: 14 });
  });
});

describe("house-truth: compareToTruth", () => {
  it("passes a model that matches, within each item's tolerance", () => {
    const f = compareToTruth(truthOf("A", 0), counts({ doors: 17, windows: 16, lawnM2: 160 }));
    expect(f.every((x) => x.verdict === "ok")).toBe(true);
  });

  it("faults what a DXF contradicts: a missing parking bay, an invented tree, missing windows", () => {
    const f = compareToTruth(truthOf("A", 0), counts({ parking: 3, trees: 3, windows: 12 }));
    const faults = f.filter((x) => x.verdict === "fault").map((x) => x.item).sort();
    expect(faults).toEqual(["parking", "trees", "windows"]);
  });

  it("holds a storey above the ground to its own items, not the yard's", () => {
    const f = compareToTruth(truthOf("A", 1), counts({ doors: 18, windows: 18, rooms: 14, parking: 0, fence: false }));
    expect(f.map((x) => x.item)).toEqual(["doors", "windows", "rooms", "stairs"]);
    expect(f.every((x) => x.verdict === "ok")).toBe(true);
  });

  it("asks rather than faults where the truth is only the vision model's reading", () => {
    const ai = truthFromAiAnswer({ doors: 16, windows: 17, parking: 2, rooms: [], lawnM2: 150, trees: 0, gates: 1, fence: true, stairs: true }, { name: "A ground", model: "A", storey: 0 })!;
    const f = compareToTruth(ai, counts());
    expect(f.find((x) => x.item === "parking")!.verdict).toBe("check");
    expect(f.find((x) => x.item === "rooms")!.verdict).toBe("check");
    expect(describeFinding(f.find((x) => x.item === "parking")!)).toBe("A ground: חניות — לפי קריאת ה-AI 2, במודל 4");
  });
});

describe("house-truth: a DXF's inventory", () => {
  const inventory = (fenceSegments: number, texts: string[]) =>
    ({
      sheet: "A_קומת קרקע",
      model: "A",
      storey: 0,
      fenceTexts: texts.map((text) => ({ text, layer: "00-text", at: { x: 0, y: 0 }, heightCm: 20 })),
      rooms: [],
      counts: { doors: 16, doorWidths: {}, windows: 17, parking: 4, rooms: 11, lawnM2: 169.8, pavingM2: 0, trees: 0, gates: 1, fenceSegments, stairsLines: 4, hatchPatterns: {} },
    }) as unknown as HouseInventory;

  it("has a fence the sheet names in text though no line is on a fence layer", () => {
    expect(truthFromInventory(inventory(0, ["גדר עם חיפוי אבן"])).counts.fence).toBe(true);
    expect(truthFromInventory(inventory(3, [])).counts.fence).toBe(true);
  });

  it("has none where only a railing is named", () => {
    expect(truthFromInventory(inventory(0, ["מעקה זכוכית"])).counts.fence).toBe(false);
  });
});

describe("house-truth: reading the vision model's answer", () => {
  const sheet = { name: "B קומה א", model: "B", storey: 1 };

  it("keeps rooms with dimensions as written and works out their area", () => {
    const t = truthFromAiAnswer({ doors: 14, windows: 18, rooms: [{ name: "חדר שינה", dims: "3.80*3.55" }, { name: "ממ\"ד", dims: "about 9" }, "junk"], fence: "yes" }, sheet)!;
    expect(t.source).toBe("ai");
    expect(t.rooms).toEqual([
      { name: "חדר שינה", dims: "3.80*3.55", statedM2: 13.49 },
      { name: 'ממ"ד', dims: null, statedM2: null },
    ]);
    expect(t.counts.fence).toBe(false);
    expect(t.counts.parking).toBe(0);
  });

  it("refuses an answer without door and window counts", () => {
    expect(truthFromAiAnswer({ doors: "many", windows: 3 }, sheet)).toBeNull();
    expect(truthFromAiAnswer({ windows: 3 }, sheet)).toBeNull();
    expect(truthFromAiAnswer({ doors: -1, windows: 3 }, sheet)).toBeNull();
  });
});

describe("house-truth: countsFromModel", () => {
  const prims: Primitive[] = [
    { type: "prism", ring: [[0, 0], [10, 0], [10, 5], [0, 5]], y0: -0.6, y1: 0, material: "grass", tag: "yard:lawn" },
    { type: "car", at: { x: 1, y: 0, z: 1 }, rotY: 0, colour: 0, tag: "yard:car" },
    { type: "car", at: { x: 4, y: 0, z: 1 }, rotY: 0, colour: 0, tag: "yard:car" },
    { type: "tree", at: { x: 8, y: 0, z: 3 }, height: 5, crown: 2, tag: "yard:tree" },
    { type: "tree", at: { x: 30, y: 0, z: 30 }, height: 5, crown: 2, tag: "tree" },
    { type: "box", centre: { x: 0, y: 0.6, z: 0 }, size: { x: 1.1, y: 1.2, z: 0.05 }, material: "metal", tag: "yard:gate" },
    { type: "box", centre: { x: 3, y: 0.6, z: 0 }, size: { x: 4, y: 1.2, z: 0.25 }, material: "stone", tag: "yard:fence" },
    { type: "box", centre: { x: 3, y: 0.1, z: 6 }, size: { x: 1, y: 0.17, z: 0.3 }, material: "stone", tag: "yard:stairs" },
  ];
  const openings = [
    { kind: "doorway" as const, exterior: false, door: true },
    { kind: "doorway" as const, exterior: false },
    { kind: "window" as const, exterior: true, door: true },
    { kind: "window" as const, exterior: true },
    { kind: "curtain" as const, exterior: true },
  ];

  it("counts hinged doors (a passage is not one), windows and the plot's yard — not the neighbours' trees", () => {
    expect(countsFromModel({ openings, rooms: 5, primitives: prims })).toEqual({
      doors: 2,
      windows: 2,
      parking: 2,
      rooms: 5,
      lawnM2: 50,
      trees: 1,
      gates: 1,
      fence: true,
      stairs: true,
    });
  });

  it("gives a storey above the ground no yard", () => {
    expect(countsFromModel({ openings, rooms: 5, primitives: prims, yard: false })).toMatchObject({ parking: 0, lawnM2: 0, trees: 0, gates: 0, fence: false, stairs: null });
  });

  it("leaves unnamed rooms and a house without stood-up stairs uncompared", () => {
    const counts = countsFromModel({ openings, rooms: null, primitives: [] });
    expect(counts).toMatchObject({ rooms: null, stairs: null });
    const items = compareToTruth(truthOf("A", 0), counts).map((f) => f.item);
    expect(items).not.toContain("rooms");
    expect(items).not.toContain("stairs");
  });
});

describe("house-truth: hingedOpenings", () => {
  const doorway = (x: number): PlanOpening => ({ x, y: 0, w: 0.9, h: 0.2, orientation: "h", kind: "doorway", exterior: false });

  it("hangs a door in an inside doorway its leaf swings from, one door per swing", () => {
    const swing = { cx: 0, cy: 0.1, r: 0.85, sweep: Math.PI / 2 };
    const marked = hingedOpenings([doorway(0), doorway(5)], [swing, { ...swing, cx: 5.9 }, { ...swing, cx: 5.9 }]);
    expect(marked.map((o) => !!o.door)).toEqual([true, true]);
    expect(hingedOpenings([doorway(0), doorway(0)], [swing]).filter((o) => o.door)).toHaveLength(1);
  });

  it("leaves a passage without a swing, or under a swing too small for it, unhung", () => {
    expect(hingedOpenings([doorway(0)], []).some((o) => o.door)).toBe(false);
    expect(hingedOpenings([doorway(0)], [{ cx: 0, cy: 0.1, r: 0.4, sweep: Math.PI / 2 }]).some((o) => o.door)).toBe(false);
  });
});
