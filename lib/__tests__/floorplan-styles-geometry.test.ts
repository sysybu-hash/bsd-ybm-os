import {
  FLOORPLAN_VIZ_PRESET_IDS,
  FLOORPLAN_VIZ_PRESETS,
  stylePromptForView,
} from "@/lib/projects/floorplan-viz-styles";

const VIEWS = ["overview", "isometric", "interior"] as const;

describe("the locks, against a render that already contains the flat", () => {
  const geometryPrompts = FLOORPLAN_VIZ_PRESET_IDS.flatMap((id) =>
    VIEWS.map((kind) => ({
      id,
      kind,
      text: stylePromptForView(FLOORPLAN_VIZ_PRESETS[id], { kind }, {
        source: "geometry",
      }),
    })),
  );

  it("covers every style and every view", () => {
    expect(geometryPrompts).toHaveLength(FLOORPLAN_VIZ_PRESET_IDS.length * 3);
    for (const { text } of geometryPrompts) expect(text.length).toBeGreaterThan(500);
  });

  it("never tells the model the attachment is the sales plan", () => {
    // The attachment is the render. The sentence is simply false there, and a
    // prompt that contradicts itself is resolved by the model rather than us.
    for (const { id, kind, text } of geometryPrompts) {
      expect(`${id}/${kind}: ${text}`).not.toMatch(
        /attached sales plan is the only layout/,
      );
    }
  });

  it("never tells the model the attachment looks empty", () => {
    // CONTENTS_LOCK said the wall tracing is "WALLS ONLY and looks empty" and
    // told the model not to copy that emptiness. The geometric render is full
    // of furniture; that clause asks it to ignore what it can see.
    for (const { id, kind, text } of geometryPrompts) {
      expect(`${id}/${kind}: ${text}`).not.toMatch(/WALLS ONLY and looks empty/);
    }
  });

  it("never licenses resizing a bed", () => {
    // Bed blocks are single-bed sized before the model sees them, so the
    // override that let a wide drawn double be narrowed can only do harm.
    for (const { id, kind, text } of geometryPrompts) {
      expect(`${id}/${kind}: ${text}`).not.toMatch(/OVERRIDES the "same size"/);
    }
  });

  it("never asks for furniture the render does not draw", () => {
    // PLAN_TRACE_LOCK furnishes the terraces with a bistro table and planters,
    // which is the opposite of "add nothing where there is no block".
    for (const { id, kind, text } of geometryPrompts) {
      expect(`${id}/${kind}: ${text}`).not.toMatch(/bistro table/);
      expect(`${id}/${kind}: ${text}`).not.toMatch(/outdoor seating if the drawn area allows/);
    }
  });

  it("forbids inventing a new apartment over the CAD pixels", () => {
    for (const { id, kind, text } of geometryPrompts) {
      expect(`${id}/${kind}: ${text}`).toMatch(/same pixel grid/);
      expect(`${id}/${kind}: ${text}`).not.toMatch(/wall-tracing looks empty/);
      expect(`${id}/${kind}: ${text}`).not.toMatch(/copy wet fixtures from the sales sheet/);
    }
  });

  it("keeps what the geometry cannot enforce", () => {
    for (const { id, text } of geometryPrompts) {
      // Prop discipline, and no text burned into the picture.
      expect(`${id}: ${text}`).toMatch(/ZERO letters, digits/);
      if (id !== "developer_white") {
        expect(`${id}: ${text}`).toMatch(/Furniture is not yours/);
      }
    }
  });

  it("keeps the modesty rules on the haredi kits", () => {
    for (const { id, text } of geometryPrompts) {
      if (FLOORPLAN_VIZ_PRESETS[id].audience !== "haredi") continue;
      expect(`${id}: ${text}`).toMatch(/NO SCREENS anywhere/);
      expect(`${id}: ${text}`).toMatch(/NEVER a double, queen or king/);
    }
  });

  it("leaves the plan-sourced prompts exactly as they were", () => {
    // The older path still hands the model a sales sheet, and these locks are
    // right for that job.
    const plan = stylePromptForView(FLOORPLAN_VIZ_PRESETS.contemporary, {
      kind: "overview",
    });
    expect(plan).toMatch(/attached sales plan is the only layout/);
  });
});
