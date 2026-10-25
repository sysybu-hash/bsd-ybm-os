/**
 * @jest-environment node
 */
import {
  assertPlanGeometry,
  assertPlanPipelineReady,
  formatPlanGeometryGate,
  housePlanPadMetres,
  planFrustumMetres,
} from "@/lib/projects/building/plan-geometry-gate";
import type { Primitive } from "@/lib/projects/building/model";

const floor = { id: "floor-1", sheetWidth: 680, sheetHeight: 680, shift: { x: 0, y: 0 } };

describe("plan geometry gate", () => {
  it("computes frustum from sheet metres", () => {
    const fr = planFrustumMetres(floor, 0);
    expect(fr.w).toBeCloseTo(680 / 28.346456692913385, 2);
    expect(fr.x0).toBeCloseTo(0, 5);
  });

  it("passes cars inside the frame with margin", () => {
    const fr = planFrustumMetres(floor, 0);
    const midZ = (fr.z0 + fr.z1) / 2;
    const cars: Primitive[] = [
      { type: "car", at: { x: fr.x0 + 4, y: 0, z: midZ }, rotY: 0, colour: 0xffffff, tag: "yard:car" },
      { type: "car", at: { x: fr.x1 - 4, y: 0, z: midZ }, rotY: 0, colour: 0, tag: "yard:car" },
    ];
    const gate = assertPlanGeometry({ floor, primitives: cars, marginM: 1.5, carHalfM: 2.5, padM: 0 });
    expect(gate.ok).toBe(true);
    expect(formatPlanGeometryGate(gate)).toMatch(/PASS/);
  });

  it("fails cars clipped at the street edge when pad is forced to zero", () => {
    const fr = planFrustumMetres(floor, 0);
    const cars: Primitive[] = [
      { type: "car", at: { x: (fr.x0 + fr.x1) / 2, y: 0, z: fr.z1 - 0.5 }, rotY: 0, colour: 0, tag: "yard:car" },
    ];
    const gate = assertPlanGeometry({ floor, primitives: cars, padM: 0 });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.faults).toContain("CarsInFrame");
  });

  it("auto-pads so a street-edge car passes CarsInFrame", () => {
    const fr = planFrustumMetres(floor, 0);
    const cars: Primitive[] = [
      { type: "car", at: { x: (fr.x0 + fr.x1) / 2, y: 0, z: fr.z1 - 0.5 }, rotY: 0, colour: 0, tag: "yard:car" },
    ];
    const gate = assertPlanGeometry({ floor, primitives: cars });
    expect(gate.ok).toBe(true);
  });

  it("fails jerusalemStone fence overlapping the bin zone", () => {
    const fr = planFrustumMetres(floor, 0);
    const cx = (fr.x0 + fr.x1) / 2;
    const cz = fr.z1 - 3;
    const prims: Primitive[] = [
      { type: "car", at: { x: fr.x0 + 5, y: 0, z: (fr.z0 + fr.z1) / 2 }, rotY: 0, colour: 0, tag: "yard:car" },
      { type: "box", centre: { x: cx, y: 0.5, z: cz }, size: { x: 1.5, y: 1, z: 0.8 }, material: "metal", tag: "yard:bins" },
      {
        type: "box",
        centre: { x: cx + 0.9, y: 0.6, z: cz },
        size: { x: 0.3, y: 1.2, z: 0.3 },
        material: "jerusalemStone",
        tag: "yard:fence",
      },
    ];
    const gate = assertPlanGeometry({ floor, primitives: prims });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.faults).toContain("NoInventStoneAtBins");
  });

  it("fails stair tags within 1.6m of a toilet", () => {
    const fr = planFrustumMetres(floor, 0);
    const prims: Primitive[] = [
      { type: "car", at: { x: fr.x0 + 5, y: 0, z: (fr.z0 + fr.z1) / 2 }, rotY: 0, colour: 0, tag: "yard:car" },
      { type: "box", centre: { x: 5, y: 0.4, z: 5 }, size: { x: 0.4, y: 0.8, z: 0.5 }, material: "ceramic", tag: "floor-1:fixture:toilet" },
      { type: "box", centre: { x: 5.5, y: 0.2, z: 5.2 }, size: { x: 0.9, y: 0.15, z: 0.28 }, material: "floorWood", tag: "floor-1:stair:tread" },
    ];
    const gate = assertPlanGeometry({ floor, primitives: prims });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.faults).toContain("StairTags");
  });

  it("assertPlanPipelineReady requires geometry ok", () => {
    const bad = assertPlanGeometry({ floor, primitives: [] });
    expect(assertPlanPipelineReady({ geometry: bad }).ok).toBe(false);
    const fr = planFrustumMetres(floor, 0);
    const good = assertPlanGeometry({
      floor,
      primitives: [{ type: "car", at: { x: fr.x0 + 5, y: 0, z: (fr.z0 + fr.z1) / 2 }, rotY: 0, colour: 0, tag: "yard:car" }],
    });
    expect(assertPlanPipelineReady({ geometry: good }).ok).toBe(true);
    expect(assertPlanPipelineReady({ geometry: good, visual: { ok: false, faults: ["CarsOnGround"] } }).ok).toBe(false);
  });

  it("TruthCounts fails when parking does not match truth", () => {
    const fr = planFrustumMetres(floor, 0);
    const cars: Primitive[] = [
      { type: "car", at: { x: fr.x0 + 5, y: 0, z: (fr.z0 + fr.z1) / 2 }, rotY: 0, colour: 0, tag: "yard:car" },
    ];
    const gate = assertPlanGeometry({ floor, primitives: cars, truth: { parking: 4 } });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.faults).toContain("TruthCounts");
  });

  it("housePlanPadMetres grows when a bumper sits past the sheet edge", () => {
    const fr = planFrustumMetres(floor, 0);
    const pad = housePlanPadMetres(floor, [
      { type: "car", at: { x: (fr.x0 + fr.x1) / 2, y: 0, z: fr.z1 - 0.5 }, rotY: 0, colour: 0, tag: "yard:car" },
    ]);
    expect(pad).toBeGreaterThan(0);
  });
});
