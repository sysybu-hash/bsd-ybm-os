import { MATERIALS_ONLY_PROMPT, buildMaterialsPrompt } from "@/lib/projects/floorplan-materials";

describe("the materials-only instruction", () => {
  it("forbids every geometric change the model made when it was asked to draw the flat", () => {
    // Each of these was a real failure on דירה 14, not a hypothetical.
    for (const rule of [/do not add, remove, move/i, /rotate, mirror or reflect/i, /outline of the flat exactly/i, /gap in a wall exactly where it is/i]) {
      expect(MATERIALS_ONLY_PROMPT).toMatch(rule);
    }
  });

  it("asks for no furniture and no text, which the audit treats as hard failures", () => {
    expect(MATERIALS_ONLY_PROMPT).toMatch(/No furniture/);
    expect(MATERIALS_ONLY_PROMPT).toMatch(/No text, numbers or labels/);
  });

  it("returns the instruction unchanged when there is nothing to add", () => {
    expect(buildMaterialsPrompt()).toBe(MATERIALS_ONLY_PROMPT);
    expect(buildMaterialsPrompt("   ")).toBe(MATERIALS_ONLY_PROMPT);
  });

  it("appends extra direction after the geometry rules, never before them", () => {
    const prompt = buildMaterialsPrompt("cooler palette");
    expect(prompt.startsWith(MATERIALS_ONLY_PROMPT)).toBe(true);
    expect(prompt).toMatch(/does not license any change to the geometry/);
    expect(prompt.indexOf("cooler palette")).toBeGreaterThan(prompt.indexOf("Do not rotate"));
  });
});
