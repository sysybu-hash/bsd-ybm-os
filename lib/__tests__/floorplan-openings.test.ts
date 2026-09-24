import {
  classifyOpenings,
  isOuterWall,
  placeOpeningsOnPage,
} from "@/lib/projects/floorplan-wall-openings";
import { isInOuterWall } from "@/lib/projects/floorplan-marked-openings";
import { buildStillEditPrompt, openingBriefFor } from "@/lib/projects/viz-generate/edit";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

const bounds = { x: 100, y: 200, width: 300, height: 400 };
const upm = 30;

describe("telling a door from a window", () => {
  it("calls a drawn swing a door, whatever wall it is in", () => {
    const swing = { orientation: "h" as const, centre: 400, thickness: 9, from: 150, to: 174 };
    const out = classifyOpenings([swing], [], bounds, upm);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("door");
  });

  it("glazes a gap in an outer wall and leaves an inner one cased", () => {
    // On the north wall of the footprint.
    const outer = { orientation: "h" as const, centre: 200, thickness: 9, from: 150, to: 200 };
    // Halfway down the flat — a way through, not a window.
    const inner = { orientation: "h" as const, centre: 400, thickness: 9, from: 150, to: 200 };
    const out = classifyOpenings([], [outer, inner], bounds, upm);
    expect(out.map((o) => o.kind)).toEqual(["window", "opening"]);
  });

  it("does not count a hole twice when a swing and a gap describe it", () => {
    const hole = { orientation: "v" as const, centre: 100, thickness: 9, from: 300, to: 324 };
    const out = classifyOpenings([hole], [{ ...hole, from: 298, to: 326 }], bounds, upm);
    expect(out).toHaveLength(1);
  });

  it("takes the caller's test of the envelope over the bounding box", () => {
    // Mid-flat by the box, but the floor is on one side only: a window.
    const set = { orientation: "h" as const, centre: 400, thickness: 9, from: 150, to: 200 };
    const out = classifyOpenings([], [set], bounds, upm, () => true);
    expect(out[0]!.kind).toBe("window");
  });

  it("does not count a hole twice when two gaps describe it", () => {
    // Each face of one wall, a few centimetres apart.
    const face = { orientation: "v" as const, centre: 250, thickness: 1, from: 300, to: 330 };
    const out = classifyOpenings([], [face, { ...face, centre: 252 }], bounds, upm);
    expect(out).toHaveLength(1);
  });

  it("knows which walls are the outside ones", () => {
    const north = { orientation: "h" as const, centre: 200, thickness: 9, from: 150, to: 200 };
    const middle = { orientation: "h" as const, centre: 380, thickness: 9, from: 150, to: 200 };
    expect(isOuterWall(north, bounds, upm * 0.5)).toBe(true);
    expect(isOuterWall(middle, bounds, upm * 0.5)).toBe(false);
  });
});

describe("putting an opening on the page", () => {
  it("measures its width and boxes it across its own wall", () => {
    const placed = placeOpeningsOnPage(
      [{ orientation: "h", centre: 200, thickness: 10, from: 150, to: 174, kind: "window" }],
      upm,
      { width: 600, height: 800 },
    );
    expect(placed).toHaveLength(1);
    expect(placed[0]!.widthM).toBeCloseTo(0.8, 2);
    expect(placed[0]!.box.x).toBeCloseTo(0.25, 3);
    expect(placed[0]!.box.w).toBeCloseTo(0.04, 3);
    // Centred on the wall, one wall thick.
    expect(placed[0]!.box.y).toBeCloseTo((200 - 5) / 800, 4);
    expect(placed[0]!.box.h).toBeCloseTo(10 / 800, 4);
  });
});

describe("a long green run is only glazing on the outside", () => {
  const page = { width: 600, height: 800 };
  const extent = { x: 60, y: 100, width: 400, height: 600 };

  it("keeps a run lying along the left façade", () => {
    const box = { x: 58 / 600, y: 300 / 800, w: 4 / 600, h: 50 / 800 };
    expect(isInOuterWall(box, page, extent, 15)).toBe(true);
  });

  it("drops a partition drawn down the middle of the flat", () => {
    // The bedroom partition on 28-8-23-2: green from end to end, and inside.
    const box = { x: 260 / 600, y: 300 / 800, w: 4 / 600, h: 250 / 800 };
    expect(isInOuterWall(box, page, extent, 15)).toBe(false);
  });

  it("drops a run that only touches a façade with its end", () => {
    // The two walls of the work room on 28-8-23-2: horizontal, across the
    // middle of the flat, starting at the left façade. Touching is not lying
    // along, and calling these windows glazed two interior walls.
    const box = { x: 60 / 600, y: 380 / 800, w: 120 / 600, h: 3 / 800 };
    expect(isInOuterWall(box, page, extent, 15)).toBe(false);
  });
});

describe("telling an edit where the sheet puts its openings", () => {
  const layout = parseFloorplanLayout({
    rooms: [{ name: "סלון" }],
    openings: [
      { kind: "window", widthM: 1.67, box: { x: 0.2, y: 0.3, w: 0.01, h: 0.06 } },
      { kind: "door", widthM: 0.8, box: { x: 0.5, y: 0.7, w: 0.03, h: 0.01 } },
    ],
  });

  it("says how many there are and where", () => {
    const brief = openingBriefFor(layout);
    expect(brief).toMatch(/1 window \(1\.67 m at upper left\)/);
    expect(brief).toMatch(/1 door \(0\.80 m at lower centre\)/);
    expect(brief).toMatch(/confirmed openings, not the complete count/);
  });

  it("says nothing when the sheet was never measured", () => {
    expect(openingBriefFor(parseFloorplanLayout({ rooms: [{ name: "סלון" }] }))).toBe("");
  });

  it("carries the brief into the edit prompt", () => {
    const prompt = buildStillEditPrompt(layout, { kind: "overview" }, "החלף את הדלת בחלון");
    expect(prompt).toMatch(/WHAT THE SHEET MARKS/);
    expect(prompt).toMatch(/1 window/);
  });
});
