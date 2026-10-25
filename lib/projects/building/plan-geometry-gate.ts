/**
 * Gate 0 — geometry QA before any paid plan paint (Gottlieb pipeline, 16/10/2026).
 * Free checks on measured model + sheet frustum. FAIL blocks booklet paint path.
 */
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { Primitive } from "@/lib/projects/building/model";

export type PlanGeometryFloorMeta = {
  id: string;
  sheetWidth: number;
  sheetHeight: number;
  shift: { x: number; y: number };
};

export type PlanGeometryGateInput = {
  floor: PlanGeometryFloorMeta;
  primitives: readonly Primitive[];
  /** Metres padded on each side of the sheet frame (planPayload house pad). */
  padM?: number;
  /** Half-length of a saloon along its nose (render-page). */
  carHalfM?: number;
  /** Clearance required from frustum edge to car bumper. */
  marginM?: number;
  /**
   * Expected counts from house-truth / CAD (TruthCounts). When set, parking
   * must match yard:car; optional doors/bins when provided.
   */
  truth?: { parking?: number; doors?: number; bins?: number };
  /** False for a building whose drawing has no parking (a school, an office): no cars is then right, not a missed reading. Default true. */
  requireCars?: boolean;
};

export type PlanGeometryCheck = { id: string; ok: boolean; detail: string };

export type PlanGeometryGateResult =
  | { ok: true; checks: PlanGeometryCheck[] }
  | { ok: false; faults: string[]; checks: PlanGeometryCheck[] };

/** Saloon half-length along nose — mesh bumper/plate reaches ~2.45 m (render-page). */
const CAR_HALF = 2.5;
const CAR_HALF_WIDTH = 1.1;
/** Clear asphalt/sidewalk past the bumper so cars do not sit on the white sheet edge. */
const MARGIN = 1.5;

/** World-metre AABB of the plan ortho frustum (same centre as the sheet). */
export function planFrustumMetres(
  floor: PlanGeometryFloorMeta,
  padM = 0,
): { x0: number; x1: number; z0: number; z1: number; w: number; h: number } {
  const w0 = floor.sheetWidth / DWF_FLOOR_UNITS_PER_METRE;
  const h0 = floor.sheetHeight / DWF_FLOOR_UNITS_PER_METRE;
  const w = w0 + 2 * padM;
  const h = h0 + 2 * padM;
  const cx = w0 / 2 + floor.shift.x;
  const cz = h0 / 2 + floor.shift.y;
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - h / 2, z1: cz + h / 2, w, h };
}

/**
 * Symmetric pad (metres each side) so every yard:car bumper sits ≥ margin inside
 * the sheet frustum, with room for the sidewalk strip past the street. Keeps
 * the sheet centre — booklet alignment stays.
 */
export function housePlanPadMetres(
  floor: PlanGeometryFloorMeta,
  primitives: readonly Primitive[],
  options?: { carHalfM?: number; marginM?: number },
): number {
  const carHalf = options?.carHalfM ?? CAR_HALF;
  const margin = options?.marginM ?? MARGIN;
  const fr0 = planFrustumMetres(floor, 0);
  let need = 0;
  for (const c of carBoxes(primitives)) {
    const alongZ = Math.abs(Math.sin(c.rotY)) < 0.5;
    const halfZ = alongZ ? carHalf : CAR_HALF_WIDTH;
    const halfX = alongZ ? CAR_HALF_WIDTH : carHalf;
    need = Math.max(
      need,
      fr0.x0 + margin - (c.x - halfX),
      c.x + halfX - (fr0.x1 - margin),
      fr0.z0 + margin - (c.z - halfZ),
      c.z + halfZ - (fr0.z1 - margin),
    );
  }
  // Always leave room for sidewalk + side clearance around outer cars (Gottlieb C).
  if (carBoxes(primitives).length === 0) return 0;
  return Math.max(2.5, need > 0 ? Math.ceil(need * 20) / 20 : 0);
}

function carBoxes(primitives: readonly Primitive[]): Array<{ x: number; z: number; rotY: number }> {
  return primitives
    .filter((p): p is Extract<Primitive, { type: "car" }> => p.type === "car")
    .map((p) => ({ x: p.at.x, z: p.at.z, rotY: p.rotY }));
}

function binFootprint(primitives: readonly Primitive[]): { x0: number; x1: number; z0: number; z1: number } | null {
  const bins = primitives.filter((p) => (p.tag ?? "").startsWith("yard:bins"));
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let n = 0;
  for (const p of bins) {
    if (p.type === "box") {
      x0 = Math.min(x0, p.centre.x - p.size.x / 2);
      x1 = Math.max(x1, p.centre.x + p.size.x / 2);
      z0 = Math.min(z0, p.centre.z - p.size.z / 2);
      z1 = Math.max(z1, p.centre.z + p.size.z / 2);
      n++;
    } else if (p.type === "prism" && p.ring?.length) {
      for (const [x, z] of p.ring) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
        n++;
      }
    }
  }
  if (!n || !Number.isFinite(x0)) return null;
  return { x0, x1, z0, z1 };
}

/** Wet-room fixture centres on a storey (toilet / bath / basin). */
function wetCentres(primitives: readonly Primitive[], floorId: string): Array<{ x: number; z: number }> {
  const id = floorId.startsWith("floor-") ? floorId : `floor-${floorId}`;
  const out: Array<{ x: number; z: number }> = [];
  for (const p of primitives) {
    if (!p.tag?.startsWith(`${id}:`)) continue;
    const t = p.tag.toLowerCase();
    if (!/toilet|cistern|bath|tub|basin|shower|אסלה|אמבט|כיור/.test(t)) continue;
    if (p.type === "box") out.push({ x: p.centre.x, z: p.centre.z });
    else if (p.type === "car") continue;
    else if ("at" in p && p.at && typeof p.at === "object" && "x" in p.at) out.push({ x: (p.at as { x: number }).x, z: (p.at as { z: number }).z });
  }
  return out;
}

function stairCentres(primitives: readonly Primitive[], floorId: string): Array<{ x: number; z: number; tag: string }> {
  const id = floorId.startsWith("floor-") ? floorId : `floor-${floorId}`;
  const out: Array<{ x: number; z: number; tag: string }> = [];
  for (const p of primitives) {
    if (!p.tag?.startsWith(`${id}:`)) continue;
    if (!/stair|tread/i.test(p.tag)) continue;
    if (/yard:/.test(p.tag)) continue;
    if (p.type === "box") out.push({ x: p.centre.x, z: p.centre.z, tag: p.tag });
    else if (p.type === "prism" && p.ring?.length) {
      const xs = p.ring.map(([x]) => x);
      const zs = p.ring.map(([, z]) => z);
      out.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, tag: p.tag });
    }
  }
  return out;
}

/**
 * Validate measured geometry for one storey plan. Does not call paid AI.
 */
export function assertPlanGeometry(input: PlanGeometryGateInput): PlanGeometryGateResult {
  const carHalf = input.carHalfM ?? CAR_HALF;
  const margin = input.marginM ?? MARGIN;
  // Default pad matches planPayload: expand so cars fit with margin.
  const padM = input.padM ?? housePlanPadMetres(input.floor, input.primitives, { carHalfM: carHalf, marginM: margin });
  const fr = planFrustumMetres(input.floor, padM);
  const checks: PlanGeometryCheck[] = [];
  const faults: string[] = [];

  const cars = carBoxes(input.primitives);
  const noCarsOk = input.requireCars === false && cars.length === 0;
  if (noCarsOk) {
    checks.push({ id: "CarsPresent", ok: true, detail: "no parking drawn" });
  } else if (cars.length === 0) {
    checks.push({ id: "CarsPresent", ok: false, detail: "no yard:car primitives" });
    faults.push("CarsPresent");
  } else {
    checks.push({ id: "CarsPresent", ok: true, detail: `${cars.length} cars` });
  }

  let carsIn = true;
  const clipped: string[] = [];
  for (const c of cars) {
    const alongZ = Math.abs(Math.sin(c.rotY)) < 0.5;
    const halfZ = alongZ ? carHalf : CAR_HALF_WIDTH;
    const halfX = alongZ ? CAR_HALF_WIDTH : carHalf;
    const x0 = c.x - halfX;
    const x1 = c.x + halfX;
    const z0 = c.z - halfZ;
    const z1 = c.z + halfZ;
    if (x0 < fr.x0 + margin || x1 > fr.x1 - margin || z0 < fr.z0 + margin || z1 > fr.z1 - margin) {
      carsIn = false;
      clipped.push(`(${c.x.toFixed(2)},${c.z.toFixed(2)})`);
    }
  }
  checks.push({
    id: "CarsInFrame",
    ok: noCarsOk || (carsIn && cars.length > 0),
    detail: carsIn ? `all ${cars.length} cars ≥${margin}m inside frustum (pad=${padM}m)` : `clipped: ${clipped.join("; ")}`,
  });
  if (!noCarsOk && (!carsIn || cars.length === 0)) faults.push("CarsInFrame");

  const bins = binFootprint(input.primitives);
  let inventOk = true;
  let inventDetail = "no bin enclosure";
  if (bins) {
    // Match stripInventStoneAtBins grow (lip pillars sit on the enclosure edge).
    const grow = 0.55;
    const zone = { x0: bins.x0 - grow, x1: bins.x1 + grow, z0: bins.z0 - grow, z1: bins.z1 + grow };
    const invent: string[] = [];
    for (const p of input.primitives) {
      if (p.type !== "box" || (p.tag !== "yard:fence" && p.tag !== "yard:fence:coping")) continue;
      if (p.material !== "jerusalemStone" && p.material !== "renderBrown") continue;
      // Centre inside the enclosure — not a party wall that only grazes the AABB.
      if (p.centre.x < zone.x0 || p.centre.x > zone.x1 || p.centre.z < zone.z0 || p.centre.z > zone.z1) continue;
      // Long thin walls are CAD boundaries; invent stone is pillars / short stubs.
      const span = Math.max(p.size.x, p.size.z);
      const thick = Math.min(p.size.x, p.size.z);
      if (span >= 1.2 && thick <= 0.3) continue;
      invent.push(`fence@${p.centre.x.toFixed(2)},${p.centre.z.toFixed(2)}`);
    }
    inventOk = invent.length === 0;
    inventDetail = inventOk ? "no jerusalemStone fence centre inside bin zone" : `invent stone: ${invent.join("; ")}`;
  }
  checks.push({ id: "NoInventStoneAtBins", ok: inventOk, detail: inventDetail });
  if (!inventOk) faults.push("NoInventStoneAtBins");

  const wet = wetCentres(input.primitives, input.floor.id);
  const stairs = stairCentres(input.primitives, input.floor.id);
  const near: string[] = [];
  for (const s of stairs) {
    for (const w of wet) {
      if (Math.hypot(s.x - w.x, s.z - w.z) < 1.6) near.push(s.tag);
    }
  }
  const stairOk = near.length === 0;
  checks.push({
    id: "StairTags",
    ok: stairOk,
    detail: stairOk ? `${stairs.length} stair pieces, none within 1.6m of wet fixtures` : `stair near wet: ${[...new Set(near)].join(", ")}`,
  });
  if (!stairOk) faults.push("StairTags");

  if (input.truth) {
    const parking = input.primitives.filter((p) => p.tag === "yard:car").length;
    const binMetal = input.primitives.filter((p) => p.tag === "yard:bins" && p.type === "box" && p.material === "metal").length;
    const doors = input.primitives.filter((p) => typeof p.tag === "string" && /:door\b|:leaf\b/i.test(p.tag)).length;
    const parts: string[] = [];
    let truthOk = true;
    if (input.truth.parking != null) {
      const ok = parking === input.truth.parking;
      if (!ok) truthOk = false;
      parts.push(`parking ${parking}/${input.truth.parking}`);
    }
    if (input.truth.bins != null) {
      const ok = binMetal === input.truth.bins;
      if (!ok) truthOk = false;
      parts.push(`bins ${binMetal}/${input.truth.bins}`);
    }
    if (input.truth.doors != null) {
      const ok = doors === input.truth.doors;
      if (!ok) truthOk = false;
      parts.push(`doors ${doors}/${input.truth.doors}`);
    }
    checks.push({ id: "TruthCounts", ok: truthOk, detail: parts.join("; ") || "no truth fields" });
    if (!truthOk) faults.push("TruthCounts");
  }

  if (faults.length) return { ok: false, faults, checks };
  return { ok: true, checks };
}

/** Run gate 0 for every non-roof storey; FAIL if any storey fails. */
export function assertHousePlanGeometry(input: {
  floors: readonly PlanGeometryFloorMeta[];
  primitives: readonly Primitive[];
  truth?: PlanGeometryGateInput["truth"];
  requireCars?: boolean;
}): PlanGeometryGateResult {
  const all: PlanGeometryCheck[] = [];
  const faults: string[] = [];
  for (const floor of input.floors) {
    if (floor.id.startsWith("roof")) continue;
    const padM = housePlanPadMetres(floor, input.primitives);
    const r = assertPlanGeometry({ floor, primitives: input.primitives, padM, truth: input.truth, requireCars: input.requireCars });
    for (const c of r.checks) all.push({ ...c, id: `${floor.id}/${c.id}`, detail: `${c.detail}` });
    if (!r.ok) faults.push(...r.faults.map((f) => `${floor.id}:${f}`));
  }
  if (faults.length) return { ok: false, faults, checks: all };
  return { ok: true, checks: all };
}

export function formatPlanGeometryGate(result: PlanGeometryGateResult): string {
  const lines = result.checks.map((c) => `${c.ok ? "OK" : "FAIL"}  ${c.id}: ${c.detail}`);
  if (result.ok) return ["Plan geometry gate: PASS", ...lines].join("\n");
  return ["Plan geometry gate: BLOCKED", ...lines, `faults: ${result.faults.join(", ")}`].join("\n");
}

/** Combine geometry + visual + FLUX prompt gate readiness before paid calls. */
export function assertPlanPipelineReady(input: {
  geometry: PlanGeometryGateResult;
  /** Gate 1 — pixel QA on measured plans; required when provided. */
  visual?: { ok: boolean; faults?: string[] };
  /** When set, must already be ok from assertFluxPipelineReady. */
  fluxPromptOk?: boolean;
}): { ok: boolean; faults: string[] } {
  const faults: string[] = [];
  if (!input.geometry.ok) faults.push(...input.geometry.faults.map((f) => `geometry:${f}`));
  if (input.visual && !input.visual.ok) {
    faults.push(...(input.visual.faults ?? ["visual"]).map((f) => (f.startsWith("visual:") ? f : `visual:${f}`)));
  }
  if (input.fluxPromptOk === false) faults.push("fluxPrompt");
  return { ok: faults.length === 0, faults };
}

/**
 * Production plan paint forbids KEEP_RENDER / KEEP_BASE / DONOR compose patches.
 * Debug scripts may set HOUSE_PLAN_DEBUG_COMPOSE=1 to allow them.
 */
export function assertProductionPlanPaintEnv(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  faults: string[];
} {
  if (env.HOUSE_PLAN_DEBUG_COMPOSE === "1") return { ok: true, faults: [] };
  const faults: string[] = [];
  for (const key of ["KEEP_RENDER", "KEEP_BASE", "KEEP_OWN", "DONOR"] as const) {
    if (env[key]?.trim()) faults.push(`productionForbids:${key}`);
  }
  return { ok: faults.length === 0, faults };
}

/** Paint filter: whole/tile plan jobs only — no elevations, rooms, hero. */
export function housePaintPlansOnly(name: string): boolean {
  return /^view-plan(whole|tile)-/.test(name);
}
