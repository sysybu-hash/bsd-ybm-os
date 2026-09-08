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

describe("the key that tells the model what each block is", () => {
  it("names a kind for every tint the renderer emits", () => {
    for (const tint of ["OFF-WHITE", "TAN OAK", "PALE STONE", "WHITE block", "DARK OAK", "GREY-BEIGE"]) {
      expect(FURNITURE_KEY_PROMPT).toContain(tint);
    }
  });

  it("ties the bed count to the block count", () => {
    // Five bed blocks came back as two beds before the key existed.
    expect(FURNITURE_KEY_PROMPT).toMatch(/as many beds as blocks of this kind/i);
    // Stated as measurements, not as a proportion: "more than twice as long as
    // it is wide" lost four runs in a row to a bed widened to suit its room.
    expect(FURNITURE_KEY_PROMPT).toMatch(/90 cm wide and 200 cm long/);
  });

  it("keeps a terrace a terrace whatever stands on it", () => {
    // A block on the service terrace was rendered as a bathroom.
    expect(FURNITURE_KEY_PROMPT).toMatch(/terrace/i);
  });

  it("tints blocks as the material they become, so no decoding pass is needed", () => {
    // A saturated key placed furniture well and then would not come out: green
    // chairs and orange tables survived the pass meant to restate them.
    expect(FURNITURE_KEY_PROMPT).toMatch(/not to recolour it/);
    expect(FURNITURE_KEY_PROMPT).not.toMatch(/BLUE/);
  });

  it("drops the empty-shell rule that would contradict the key", () => {
    expect(buildPlacementPrompt()).not.toMatch(/No furniture\./);
    expect(buildPlacementPrompt()).toContain("OFF-WHITE block");
    expect(buildPlacementPrompt()).toMatch(/Do not rotate, mirror or reflect/);
  });

  it("still puts caller direction last, after the geometry rules and the key", () => {
    const prompt = buildPlacementPrompt("warmer palette");
    expect(prompt.indexOf("warmer palette")).toBeGreaterThan(prompt.indexOf("OFF-WHITE block"));
  });

  it("keeps the recolour pass available for a frame that still carries a tint", () => {
    expect(RECOLOUR_PROMPT).toMatch(/change NOTHING else/);
  });
});

describe("rules added because a still broke them", () => {
  it("ties wet rooms to aqua blocks, after a ממ\"ד bedroom came back a bathroom", () => {
    expect(FURNITURE_KEY_PROMPT).toMatch(
      /ONLY where a pale aqua fixture block stands/,
    );
    expect(FURNITURE_KEY_PROMPT).toMatch(/Wardrobes are not fixtures/);
  });

  it("says a long off-white block is a bed, after beds came back as baths", () => {
    // The two blocks were within two parts in 255 of each other and the key had
    // to separate them on wording alone. It could not: דירה 14's bedroom wing
    // came back with a bathtub lying where a bed stands.
    expect(FURNITURE_KEY_PROMPT).toMatch(/An off-white block is never one of them/);
  });

  it("holds a bed to its measurements, after four runs came back with a double", () => {
    expect(FURNITURE_KEY_PROMPT).toMatch(/exactly as wide as its block/);
    expect(FURNITURE_KEY_PROMPT).toMatch(/[Nn]ever merge a bed with the block beside it/);
  });

  it("says why, because the reason is what the rule keeps losing to", () => {
    // The bed that came back double was always the one alone in the largest
    // bedroom — the model was widening it to suit the room.
    expect(FURNITURE_KEY_PROMPT).toMatch(/single bed in a large bedroom is correct/);
  });

  it("expects the dining chairs the render cannot carry, and only there", () => {
    expect(FURNITURE_KEY_PROMPT).toMatch(/Chairs go around the table and nowhere else/);
    expect(FURNITURE_KEY_PROMPT).toMatch(/one dining table per flat/);
  });

  it("forbids a saturated finish, since the blocks are tinted to guide it", () => {
    expect(FURNITURE_KEY_PROMPT).toMatch(/no object may come out in a saturated colour/);
  });
});
