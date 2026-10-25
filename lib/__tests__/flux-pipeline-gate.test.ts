/**
 * @jest-environment node
 */
import { assertFluxPipelineReady, formatFluxPipelineGate } from "@/lib/projects/building/flux-pipeline-gate";
import { planInventoryPromptFromPrimitives, withPlanInventory } from "@/lib/projects/building/plan-inventory-prompt";
import { planWholePrompt, PLAN_LIGHT_EVEN } from "@/lib/projects/building/house-photoreal";
import type { Primitive } from "@/lib/projects/building/model";

describe("flux pipeline gate", () => {
  const measured = Buffer.alloc(2_000, 1);
  const swatch = Buffer.alloc(200, 2);

  it("passes a complete golden-hour package", () => {
    const before = process.env.HOUSE_PLAN_GOLDEN;
    process.env.HOUSE_PLAN_GOLDEN = "1";
    const inventory = planInventoryPromptFromPrimitives(
      [
        { type: "box", tag: "floor-1:fixture:washer", material: "render", centre: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
      ] as Primitive[],
      "floor-1",
    );
    const prompt = withPlanInventory(planWholePrompt(), inventory);
    const gate = assertFluxPipelineReady({
      measured,
      swatches: [swatch, swatch],
      prompt,
      golden: true,
      inventoryAttached: true,
      seed: 7,
      aspectRatio: "match_input_image",
      outputFormat: "png",
      engine: "flux-2-pro",
    });
    expect(gate.ok).toBe(true);
    expect(formatFluxPipelineGate(gate)).toMatch(/PASS/);
    if (before == null) delete process.env.HOUSE_PLAN_GOLDEN;
    else process.env.HOUSE_PLAN_GOLDEN = before;
  });

  it("blocks even-overhead language when golden is required", () => {
    const prompt = `TASK: re-surface\n${PLAN_LIGHT_EVEN}\nINVENTORY FROM THE DRAWING\nU-stair walk line\nglass railing slim black\nfree of room names`;
    const gate = assertFluxPipelineReady({
      measured,
      swatches: [swatch, swatch],
      prompt,
      golden: true,
      inventoryAttached: true,
      seed: 7,
      aspectRatio: "match_input_image",
      outputFormat: "png",
      engine: "flux-2-max",
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.faults).toContain("noEvenConflictWhenGolden");
  });

  it("blocks missing swatches", () => {
    const before = process.env.HOUSE_PLAN_GOLDEN;
    process.env.HOUSE_PLAN_GOLDEN = "1";
    const prompt = withPlanInventory(planWholePrompt(), "INVENTORY FROM THE DRAWING\n- doors: 1");
    const gate = assertFluxPipelineReady({
      measured,
      swatches: [],
      prompt,
      golden: true,
      inventoryAttached: true,
      seed: 7,
      aspectRatio: "match_input_image",
      outputFormat: "png",
      engine: "flux-2-pro",
    });
    expect(gate.ok).toBe(false);
    if (before == null) delete process.env.HOUSE_PLAN_GOLDEN;
    else process.env.HOUSE_PLAN_GOLDEN = before;
  });
});
