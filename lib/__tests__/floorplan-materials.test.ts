import {
  FURNITURE_KEY_PROMPT,
  MATERIALS_ONLY_PROMPT,
  RECOLOUR_PROMPT,
  buildMaterialsPrompt,
  buildPlacementPrompt,
} from "@/lib/projects/floorplan-materials";

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

describe("the two passes that place furniture and then de-code it", () => {
  it("names a kind for every colour the renderer emits", () => {
    for (const colour of ["BLUE", "YELLOW/SAND", "PURPLE", "GREEN", "GREY-BEIGE"]) {
      expect(FURNITURE_KEY_PROMPT).toContain(colour);
    }
  });

  it("ties the bed count to the block count and forbids a double", () => {
    // Five bed blocks came back as two beds before the key existed.
    expect(FURNITURE_KEY_PROMPT).toMatch(/as many beds as blue blocks/i);
    expect(FURNITURE_KEY_PROMPT).toMatch(/[Nn]ever a double bed/);
  });

  it("keeps a terrace a terrace whatever stands on it", () => {
    // A block on the service terrace was rendered as a bathroom.
    expect(FURNITURE_KEY_PROMPT).toMatch(/terrace/i);
  });

  it("drops the empty-shell rule that would contradict the key", () => {
    expect(buildPlacementPrompt()).not.toMatch(/No furniture\./);
    expect(buildPlacementPrompt()).toContain("BLUE block");
    expect(buildPlacementPrompt()).toMatch(/Do not rotate, mirror or reflect/);
  });

  it("still puts caller direction last, after the geometry rules and the key", () => {
    const prompt = buildPlacementPrompt("warmer palette");
    expect(prompt.indexOf("warmer palette")).toBeGreaterThan(prompt.indexOf("BLUE block"));
  });

  it("asks the recolour pass to change nothing but the coding colours", () => {
    expect(RECOLOUR_PROMPT).toMatch(/change NOTHING else/);
    expect(RECOLOUR_PROMPT).toMatch(/no blue, purple or mint-green object may remain/i);
  });
});
