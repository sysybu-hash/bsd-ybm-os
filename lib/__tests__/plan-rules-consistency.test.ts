/**
 * @jest-environment node
 *
 * Single rule set for plan paint: no even+golden conflict, no active planLook
 * path, wet-room stair ban in every inventory helper (Gottlieb pipeline 16/10/2026).
 */
import {
  houseLookOf,
  housePlanEven,
  housePlanGolden,
  planLightRule,
  planLook,
  planRules,
  planTilePrompt,
  planWholePrompt,
  PLAN_LIGHT_EVEN,
  PLAN_LIGHT_GOLDEN,
  PLAN_RULES,
} from "@/lib/projects/building/house-photoreal";
import {
  planInventoryPromptFromInventory,
  planInventoryPromptFromPrimitives,
  planInventoryPromptFromTruth,
} from "@/lib/projects/building/plan-inventory-prompt";
import type { HouseInventory } from "@/lib/projects/building/dxf-house";
import type { HouseTruth } from "@/lib/projects/building/house-truth";
import type { Primitive } from "@/lib/projects/building/model";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";

const style = FLOORPLAN_VIZ_PRESETS.contemporary!;

describe("plan rules consistency", () => {
  const clearLightEnv = () => {
    delete process.env.HOUSE_PLAN_GOLDEN;
    delete process.env.HOUSE_PLAN_EVEN;
  };

  afterEach(clearLightEnv);

  it("defaults to warm-bright light and never mixes EVEN markers into that paragraph", () => {
    clearLightEnv();
    expect(housePlanGolden()).toBe(true);
    expect(housePlanEven()).toBe(false);
    expect(planLightRule()).toBe(PLAN_LIGHT_GOLDEN);
    const joined = planRules().join("\n");
    expect(joined).toContain(PLAN_LIGHT_GOLDEN);
    expect(joined).not.toContain(PLAN_LIGHT_EVEN);
    expect(PLAN_RULES.join("\n")).toContain(PLAN_LIGHT_GOLDEN);
  });

  it("HOUSE_PLAN_EVEN=1 is exclusive of warm-bright", () => {
    clearLightEnv();
    process.env.HOUSE_PLAN_EVEN = "1";
    expect(housePlanGolden()).toBe(false);
    expect(planLightRule()).toBe(PLAN_LIGHT_EVEN);
    expect(planTilePrompt()).toContain(PLAN_LIGHT_EVEN);
    expect(planTilePrompt()).not.toContain("WARM AND BRIGHT OVER THE PLAN");
  });

  it("view-plan-floor is not an active paint path; planLook aliases planWholePrompt", () => {
    expect(houseLookOf("view-plan-floor-1.jpg", style)).toBeNull();
    expect(planLook(style)).toBe(planWholePrompt());
    expect(planLook(style)).toMatch(/VESTIBULE BESIDE A WET ROOM/);
    expect(planLook(style)).toMatch(/NO SCREENS/);
    expect(planLook(style)).toMatch(/never add a toilet/);
    expect(planLook(style)).toMatch(/STREET STRIP/);
    expect(planLook(style)).not.toMatch(/solid oak and stone stair treads with their risers/);
  });

  it("every inventory helper forbids stairs beside wet rooms and laundry toilets / screens", () => {
    const inv = planInventoryPromptFromInventory({
      counts: { doors: 1, windows: 1, parking: 1, rooms: 1, stairsLines: 1, lawnM2: 10, trees: 0, gates: 0 },
      sanitary: [],
      furniture: [],
      other: [],
      stairs: [{} as never],
    } as unknown as HouseInventory);
    const truth = planInventoryPromptFromTruth({
      counts: { doors: 1, windows: 1, parking: 1, rooms: 1, stairs: true, fence: true, lawnM2: 10, trees: 0, gates: 0 },
    } as HouseTruth);
    const prims = planInventoryPromptFromPrimitives(
      [{ type: "box", tag: "floor-1:stair:tread", material: "oak", centre: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] as unknown as Primitive[],
      "floor-1",
    );
    for (const p of [inv, truth, prims, planWholePrompt()]) {
      expect(p).toMatch(/zero stairs|VESTIBULE BESIDE A WET ROOM|never oak tread|beside a toilet/i);
      expect(p).toMatch(/washing machine|Laundry|washer/i);
      expect(p).toMatch(/screen|television|monitor/i);
    }
  });
});
