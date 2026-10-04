import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { emptyFloorplanSpend } from "@/lib/projects/floorplan-spend";

const pass = jest.fn();
const edges = jest.fn();
const masses = jest.fn();
const walls = jest.fn();
jest.mock("@/lib/projects/building/finish", () => ({
  ...jest.requireActual("@/lib/projects/building/finish"),
  finishPass: (...args: unknown[]) => pass(...args),
  structuralMatch: (...args: unknown[]) => edges(...args),
  massMatch: (...args: unknown[]) => masses(...args),
  wallMatch: (...args: unknown[]) => walls(...args),
}));
jest.mock("@/lib/gemini-api-key", () => ({ hasGeminiApiKey: () => true, getGeminiApiKey: () => "k" }));
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn() }));
jest.mock("@/lib/projects/floorplan-viz-stamp", () => ({
  stampFloorplanStill: (image: { base64: string; mimeType: string }) => Promise.resolve(image),
}));

import type { FinishComparison } from "@/lib/projects/floorplan-finish-judge";
import { finishJudge, finishMeasuredStill } from "@/lib/projects/floorplan-finish-still";

const still = { viewId: "overview" as const, labelHe: "", mimeType: "image/jpeg", base64: "", origin: "render3d" as const, plain: Buffer.from("render") };
const kit = FLOORPLAN_VIZ_PRESETS.haredi_classic;

beforeEach(() => jest.clearAllMocks());

describe("a measured still, painted", () => {
  it("ships the painting that holds the render's edges and masses, and bills each call", async () => {
    pass.mockResolvedValue({ image: Buffer.from("painted"), model: "gemini-3-pro-image" });
    edges.mockResolvedValue(0.8);
    masses.mockResolvedValue(0.85);
    const spend = emptyFloorplanSpend();
    const done = await finishMeasuredStill(still, { styleKit: kit, spend });
    expect(done).toMatchObject({ origin: "finish", selected: true, base64: Buffer.from("painted").toString("base64") });
    expect(pass).toHaveBeenCalledTimes(1);
    expect(spend.imageCalls).toBe(1);
  });

  it("ships nothing when no painting keeps the structure — the render stands", async () => {
    pass.mockResolvedValue({ image: Buffer.from("drifted"), model: "m" });
    edges.mockResolvedValue(0.4);
    masses.mockResolvedValue(0.9);
    expect(await finishMeasuredStill(still, { styleKit: kit, spend: emptyFloorplanSpend() })).toBeNull();
    expect(pass).toHaveBeenCalledTimes(2);
  });

  it("refuses a painting the judge refuses", async () => {
    pass.mockResolvedValue({ image: Buffer.from("double"), model: "m" });
    edges.mockResolvedValue(0.9);
    masses.mockResolvedValue(0.9);
    const judge = jest.fn().mockResolvedValue("double bed");
    expect(await finishMeasuredStill(still, { styleKit: kit, spend: emptyFloorplanSpend(), judge })).toBeNull();
    expect(judge).toHaveBeenCalledTimes(2);
  });
});

describe("a measured still, designed", () => {
  const withWalls = { ...still, walls: Buffer.from("walls") };

  it("holds the design to the measured walls, not to the render's furniture", async () => {
    pass.mockResolvedValue({ image: Buffer.from("designed"), model: "m" });
    walls.mockResolvedValue(0.9);
    edges.mockResolvedValue(0.1);
    const done = await finishMeasuredStill(withWalls, { styleKit: kit, spend: emptyFloorplanSpend() });
    expect(done?.origin).toBe("finish");
    expect(walls).toHaveBeenCalledWith(Buffer.from("walls"), Buffer.from("designed"));
    expect(edges).not.toHaveBeenCalled();
    // The prompt hands the model the layout to design on.
    expect(String(pass.mock.calls[0]![1])).toContain("LAYOUT");
  });

  it("corrects a refused design with the layout beside it, instead of drawing a new one", async () => {
    pass.mockResolvedValueOnce({ image: Buffer.from("first"), model: "m" }).mockResolvedValueOnce({ image: Buffer.from("fixed"), model: "m" });
    walls.mockResolvedValue(0.9);
    const judge = jest.fn().mockResolvedValueOnce("missing: bedroom 2: 1 single bed").mockResolvedValueOnce(null);
    const done = await finishMeasuredStill(withWalls, { styleKit: kit, spend: emptyFloorplanSpend(), judge });
    expect(done?.base64).toBe(Buffer.from("fixed").toString("base64"));
    const [, prompt, images] = pass.mock.calls[1]!;
    expect(String(prompt)).toContain("missing: bedroom 2: 1 single bed");
    expect(images).toEqual([Buffer.from("render"), Buffer.from("first")]);
  });

  it("refuses a design whose walls moved", async () => {
    pass.mockResolvedValue({ image: Buffer.from("moved"), model: "m" });
    walls.mockResolvedValue(0.5);
    expect(await finishMeasuredStill(withWalls, { styleKit: kit, spend: emptyFloorplanSpend() })).toBeNull();
  });
});

describe("the judge of a haredi flat's painting", () => {
  const none: FinishComparison = { bedWidened: false, bedAdded: false, bedRemoved: false, furnitureAdded: false, bedsInRender: 3, bedsInPainting: 3, sofasInRender: 2, sofasInPainting: 2, extraPieces: [], missingPieces: [], doubleBed: false, screenAdded: false, textAdded: false, spaceAdded: false, turnedOrMirrored: false, notes: "" };
  it("refuses a painting missing a piece where the layout has it, before anything else, and names it", async () => {
    const spots = jest.fn().mockResolvedValue(["bed at the top left (the design has a wardrobe there)"]);
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue(none), undefined, spots)(Buffer.from("p"))).toBe("not as the layout: bed at the top left (the design has a wardrobe there)");
    expect(spots).toHaveBeenCalledWith(Buffer.from("p"));
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue(none), undefined, jest.fn().mockResolvedValue([]))(Buffer.from("p"))).toBeNull();
    // A spot check nobody answered passes nothing.
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue(none), undefined, jest.fn().mockResolvedValue(null))(Buffer.from("p"))).toBe("no judge");
  });

  it("refuses a bed painted wider than the render's", async () => {
    const compare = jest.fn().mockResolvedValue({ ...none, bedWidened: true });
    expect(await finishJudge(kit, Buffer.from("render"), compare)(Buffer.from("painted"))).toBe("bed widened");
    expect(compare).toHaveBeenCalledWith(Buffer.from("render"), Buffer.from("painted"), undefined);
  });

  it("refuses a bed painted as a sofa, and a sofa where the render has nothing", async () => {
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, bedRemoved: true }))(Buffer.from("p"))).toBe("bed removed");
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, furnitureAdded: true }))(Buffer.from("p"))).toBe("furniture added");
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, bedsInPainting: 2 }))(Buffer.from("p"))).toBe("beds counted otherwise");
    // The pieces are named for the correction.
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, bedRemoved: true, missingPieces: ["bedroom 2: 1 single bed"] }))(Buffer.from("p"))).toBe("bed removed (missing: bedroom 2: 1 single bed)");
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, sofasInPainting: 3 }))(Buffer.from("p"))).toBe("sofa added");
  });

  it("refuses a design with more than the measured inventory", async () => {
    const compare = jest.fn().mockResolvedValue({ ...none, extraPieces: ["living room: 2 sofas, 1 coffee table"] });
    expect(await finishJudge(kit, Buffer.from("r"), compare, "- living room 1: 2 sofas")(Buffer.from("p"))).toBe("extra: living room: 2 sofas, 1 coffee table");
    expect(compare).toHaveBeenCalledWith(Buffer.from("r"), Buffer.from("p"), "- living room 1: 2 sofas");
  });

  it("refuses a painting when no judge answers", async () => {
    expect(await finishJudge(kit, Buffer.from("r"), jest.fn().mockResolvedValue(null))(Buffer.from("p"))).toBe("no judge");
  });

  it("lets a painting that changed nothing pass", async () => {
    const compare = jest.fn().mockResolvedValue(none);
    expect(await finishJudge(kit, Buffer.from("render"), compare)(Buffer.from("painted"))).toBeNull();
  });

  it("refuses a turned painting and an added terrace for every audience", async () => {
    const modern = FLOORPLAN_VIZ_PRESETS[Object.keys(FLOORPLAN_VIZ_PRESETS).find((k) => FLOORPLAN_VIZ_PRESETS[k as keyof typeof FLOORPLAN_VIZ_PRESETS].audience !== "haredi") as keyof typeof FLOORPLAN_VIZ_PRESETS];
    expect(await finishJudge(modern, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, turnedOrMirrored: true }))(Buffer.from("p"))).toBe("turned or mirrored");
    expect(await finishJudge(modern, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, spaceAdded: true }))(Buffer.from("p"))).toBe("space added");
    // A wider bed is the haredi rule, not every audience's.
    expect(await finishJudge(modern, Buffer.from("r"), jest.fn().mockResolvedValue({ ...none, bedWidened: true }))(Buffer.from("p"))).toBeNull();
  });
});
