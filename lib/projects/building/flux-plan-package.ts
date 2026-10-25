import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { housePlanGolden, planWholePrompt } from "@/lib/projects/building/house-photoreal";
import { planInventoryPromptFromPrimitives, withPlanInventory } from "@/lib/projects/building/plan-inventory-prompt";
import { planSwatches, storeyCover, storeyFinishes, type PlanSwatchRoom } from "@/lib/projects/building/plan-swatches";
import type { Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { FluxEngine } from "@/lib/projects/building/flux-paint";
import type { FluxPipelinePackage } from "@/lib/projects/building/flux-pipeline-gate";
import { setHouseKnob } from "@/lib/projects/building/house-knobs";

/**
 * Build the exact package FLUX receives for one whole storey from a measured
 * model directory (view-plan-floor-N.jpg + model.json + state.json).
 */
export async function buildFluxPlanPackage(input: {
  measuredDir: string;
  model: string;
  floor: number;
  engine: FluxEngine;
  seed?: number;
  /** Force golden-hour prompt language (also set HOUSE_PLAN_GOLDEN=1). */
  golden?: boolean;
}): Promise<{ pkg: FluxPipelinePackage; inventory: string; swatchMeta: Array<{ material: string; rooms: string[] }> }> {
  const golden = input.golden ?? housePlanGolden();
  setHouseKnob("HOUSE_PLAN_GOLDEN", golden ? "1" : undefined);

  const base = path.join(input.measuredDir, input.model);
  const measuredPath = path.join(base, `view-plan-floor-${input.floor}.jpg`);
  if (!existsSync(measuredPath)) throw new Error(`missing measured plan: ${measuredPath}`);
  const measured = readFileSync(measuredPath);
  const primitives = (JSON.parse(readFileSync(path.join(base, "model.json"), "utf8")) as { primitives: Primitive[] }).primitives;
  const state = JSON.parse(readFileSync(path.join(base, "state.json"), "utf8")) as {
    floors: Array<{ id: string; shift?: { x: number; y: number }; sheetWidth: number; rooms?: PlanSwatchRoom[] }>;
  };
  const floorId = `floor-${input.floor}`;
  const meta = state.floors.find((f) => f.id === floorId);
  if (!meta) throw new Error(`state.json has no ${floorId}`);

  const swatches = await planSwatches(measured, storeyFinishes(primitives, floorId), {
    metresWide: meta.sheetWidth / DWF_FLOOR_UNITS_PER_METRE,
    shift: meta.shift,
    rooms: meta.rooms,
    cover: storeyCover(primitives, floorId),
  }, { most: 4 });

  const inventory = planInventoryPromptFromPrimitives(primitives, floorId);
  const prompt = withPlanInventory(planWholePrompt(), inventory);

  const pkg: FluxPipelinePackage = {
    measured,
    swatches: swatches.map((s) => s.image),
    prompt,
    golden,
    inventoryAttached: true,
    seed: input.seed ?? 7,
    aspectRatio: "match_input_image",
    outputFormat: "png",
    engine: input.engine,
  };

  return { pkg, inventory, swatchMeta: swatches.map((s) => ({ material: s.material, rooms: s.rooms })) };
}
