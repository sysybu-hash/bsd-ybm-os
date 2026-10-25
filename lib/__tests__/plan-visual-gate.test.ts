/**
 * @jest-environment node
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  assertPlanPipelineReady,
  assertProductionPlanPaintEnv,
  housePaintPlansOnly,
} from "@/lib/projects/building/plan-geometry-gate";
import {
  assertPlanVisual,
  checkCarsOnGround,
  checkNoOakInWc,
  cropPlanZoom,
  formatPlanVisualGate,
  PLAN_ZOOM_CROPS,
} from "@/lib/projects/building/plan-visual-gate";

const measuredPlan = path.join("previews", "free-check-photoreal-C", "C", "view-plan-floor-1.jpg");
const streetZoom = path.join("previews", "free-check-photoreal-C", "C", "zooms", "street-cars.jpg");

describe("plan visual gate", () => {
  it("exports four zoom crops used by measured script", () => {
    expect(PLAN_ZOOM_CROPS.map((c) => c.id)).toEqual(["street-cars", "bins", "u-stair", "wc"]);
  });

  it("passes CarsOnGround on Gottlieb C measured street zoom when present", async () => {
    if (!existsSync(streetZoom)) return;
    const check = await checkCarsOnGround(readFileSync(streetZoom));
    expect(check.ok).toBe(true);
  });

  it("fails CarsOnGround on a blank white image", async () => {
    const blank = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    const check = await checkCarsOnGround(blank);
    expect(check.ok).toBe(false);
  });

  it("passes NoOakInWc on a pale porcelain patch", async () => {
    const porcelain = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 220, g: 215, b: 205 } },
    })
      .jpeg()
      .toBuffer();
    const check = await checkNoOakInWc(porcelain);
    expect(check.ok).toBe(true);
  });

  it("fails NoOakInWc on a warm oak patch", async () => {
    const oak = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 160, g: 110, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const check = await checkNoOakInWc(oak);
    expect(check.ok).toBe(false);
  });

  it("assertPlanVisual PASS on measured floor-1 when present", async () => {
    if (!existsSync(measuredPlan)) return;
    const modelPath = path.join("previews", "free-check-photoreal-C", "C", "model.json");
    const statePath = path.join("previews", "free-check-photoreal-C", "C", "state.json");
    if (!existsSync(modelPath) || !existsSync(statePath)) return;
    const primitives = (JSON.parse(readFileSync(modelPath, "utf8")) as { primitives: import("@/lib/projects/building/model").Primitive[] }).primitives;
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      floors: Array<{ id: string; sheetWidth: number; sheetHeight: number; shift?: { x: number; y: number } }>;
    };
    const meta = state.floors.find((f) => f.id === "floor-1");
    if (!meta) return;
    const gate = await assertPlanVisual({
      plan: readFileSync(measuredPlan),
      floorId: "floor-1",
      floor: { id: meta.id, sheetWidth: meta.sheetWidth, sheetHeight: meta.sheetHeight, shift: meta.shift ?? { x: 0, y: 0 } },
      primitives,
    });
    expect(gate.ok).toBe(true);
    expect(formatPlanVisualGate(gate)).toMatch(/PASS/);
  });

  it("cropPlanZoom matches street-cars size class", async () => {
    if (!existsSync(measuredPlan)) return;
    const zoom = await cropPlanZoom(readFileSync(measuredPlan), "street-cars");
    const meta = await sharp(zoom).metadata();
    expect((meta.width ?? 0) > 100).toBe(true);
    expect((meta.height ?? 0) > 50).toBe(true);
  });

  it("assertPlanPipelineReady requires visual when provided", () => {
    const geometry = { ok: true as const, checks: [] };
    expect(assertPlanPipelineReady({ geometry }).ok).toBe(true);
    expect(assertPlanPipelineReady({ geometry, visual: { ok: false, faults: ["CarsOnGround"] } }).ok).toBe(false);
    expect(assertPlanPipelineReady({ geometry, visual: { ok: true } }).ok).toBe(true);
  });

  it("assertProductionPlanPaintEnv blocks KEEP_* unless debug", () => {
    expect(assertProductionPlanPaintEnv({} as NodeJS.ProcessEnv).ok).toBe(true);
    expect(assertProductionPlanPaintEnv({ KEEP_RENDER: "1:0,0,1,1" } as unknown as NodeJS.ProcessEnv).ok).toBe(false);
    expect(assertProductionPlanPaintEnv({ KEEP_RENDER: "1:0,0,1,1", HOUSE_PLAN_DEBUG_COMPOSE: "1" } as unknown as NodeJS.ProcessEnv).ok).toBe(true);
  });

  it("housePaintPlansOnly allows whole/tile only", () => {
    expect(housePaintPlansOnly("view-planwhole-floor-0.jpg")).toBe(true);
    expect(housePaintPlansOnly("view-plantile-floor-1-front.jpg")).toBe(true);
    expect(housePaintPlansOnly("view-elev-north.jpg")).toBe(false);
    expect(housePaintPlansOnly("view-room-kitchen.jpg")).toBe(false);
    expect(housePaintPlansOnly("view-hero.jpg")).toBe(false);
  });
});
