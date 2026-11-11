import { assumed, cleanAnswers, floorHeightFromLevels, projectQuestions, resolveAnswers, unitsFromSheets } from "@/lib/vmb/questions";

const f = (headerUnitsM: number | null, levels: number[] = []) => ({ headerUnitsM, levels });

describe("what the files already answer", () => {
  it("takes the unit only when every sheet that states one agrees", () => {
    expect(unitsFromSheets([f(0.01), f(null), f(0.01)])).toBe("cm");
    expect(unitsFromSheets([f(0.001), f(0.01)])).toBeNull();
    expect(unitsFromSheets([f(null)])).toBeNull();
    // Inches are a header value VMB does not offer: ask.
    expect(unitsFromSheets([f(0.0254)])).toBeNull();
  });

  it("reads the storey height from level marks across sheets, ignoring steps that are not a storey", () => {
    expect(floorHeightFromLevels([f(null, [-0.45, 0, 3.2]), f(null, [6.4, 9.6, 10.1])])).toBe(3.2);
    expect(floorHeightFromLevels([f(null, [0, 0.45, 1.2])])).toBeNull();
    expect(floorHeightFromLevels([])).toBeNull();
  });
});

describe("the questions form", () => {
  it("asks a flat only what a flat's pictures show", () => {
    const ids = projectQuestions("flat", []).map((q) => q.id);
    expect(ids).toEqual(["units", "floorHeight", "furniture", "views"]);
    expect(projectQuestions("building", []).map((q) => q.id)).toContain("facade");
  });

  it("marks answers the sheets give, and defaults by building kind", () => {
    const qs = projectQuestions("industrial", [f(0.001, [0, 5.5, 11])]);
    const r = resolveAnswers(qs, {});
    expect(r.units).toEqual({ value: "mm", source: "sheet", from: "header_units" });
    expect(r.floorHeight).toEqual({ value: 5.5, source: "inferred", from: "level_marks" });
    expect(r.facade).toEqual({ value: "metal", source: "default" });
    expect(assumed(r)).toEqual(expect.arrayContaining(["facade", "north", "surroundings", "furniture", "views"]));
    expect(assumed(r)).not.toContain("units");
  });

  it("lets the user override even what the sheet says", () => {
    const qs = projectQuestions("house", [f(0.01)]);
    expect(resolveAnswers(qs, { units: "mm" }).units).toEqual({ value: "mm", source: "user" });
  });

  it("keeps only answers that fit their question", () => {
    const qs = projectQuestions("house", []);
    const clean = cleanAnswers(qs, { units: "km", facade: "stone", floorHeight: 3.17, views: ["aerial", "moon"], north: 7, furniture: null, extra: "x" });
    expect(clean).toEqual({ facade: "stone", floorHeight: 3.15, views: ["aerial"] });
    expect(cleanAnswers(qs, { floorHeight: 40, views: ["moon"] })).toEqual({});
  });
});
