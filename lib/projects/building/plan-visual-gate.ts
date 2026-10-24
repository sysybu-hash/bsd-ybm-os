/**
 * Free visual QA on measured (or painted) storey plans — Gate 1 after geometry.
 * Pixel checks on plan frames / zooms. FAIL blocks paid paint.
 */
import sharp from "sharp";

import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { housePlanPadMetres, type PlanGeometryFloorMeta } from "@/lib/projects/building/plan-geometry-gate";
import type { Primitive } from "@/lib/projects/building/model";

export type PlanVisualCheck = { id: string; ok: boolean; detail: string };

export type PlanVisualGateResult =
  | { ok: true; checks: PlanVisualCheck[] }
  | { ok: false; faults: string[]; checks: PlanVisualCheck[] };

/** Fractions of the plan frame (sheet-aligned ortho, street at image bottom). */
export const PLAN_ZOOM_CROPS = [
  { id: "street-cars", left: 0.0, top: 0.58, width: 1.0, height: 0.42 },
  { id: "bins", left: 0.38, top: 0.62, width: 0.24, height: 0.3 },
  { id: "u-stair", left: 0.06, top: 0.38, width: 0.2, height: 0.26 },
  { id: "wc", left: 0.2, top: 0.44, width: 0.16, height: 0.18 },
] as const;

export type PlanZoomId = (typeof PLAN_ZOOM_CROPS)[number]["id"];

/** Crop a plan buffer to a named zoom (same fractions as measured zooms). */
export async function cropPlanZoom(plan: Buffer, id: PlanZoomId): Promise<Buffer> {
  const crop = PLAN_ZOOM_CROPS.find((c) => c.id === id);
  if (!crop) throw new Error(`unknown plan zoom ${id}`);
  const meta = await sharp(plan).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 100 || H < 100) throw new Error(`plan too small for zoom ${id}`);
  const left = Math.max(0, Math.floor(crop.left * W));
  const top = Math.max(0, Math.floor(crop.top * H));
  const width = Math.min(W - left, Math.floor(crop.width * W));
  const height = Math.min(H - top, Math.floor(crop.height * H));
  return sharp(plan).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
}

type RegionStats = {
  mean: number;
  whitePct: number;
  darkPct: number;
  brownPct: number;
  oakPct: number;
  n: number;
};

async function regionStats(
  image: Buffer,
  region: { x0: number; x1: number; y0: number; y1: number },
): Promise<RegionStats> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const x0 = Math.max(0, Math.floor(region.x0 * w));
  const x1 = Math.min(w, Math.ceil(region.x1 * w));
  const y0 = Math.max(0, Math.floor(region.y0 * h));
  const y1 = Math.min(h, Math.ceil(region.y1 * h));
  let sum = 0;
  let n = 0;
  let white = 0;
  let dark = 0;
  let brown = 0;
  let oak = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const m = (r + g + b) / 3;
      sum += m;
      n++;
      if (r > 240 && g > 240 && b > 240) white++;
      if (m < 90) dark++;
      if (r > g + 8 && g > b && m > 70 && m < 210) brown++;
      // Warm oak boards (bedrooms / invented tread bands) — not pale porcelain.
      if (r > 110 && r < 210 && g > 70 && g < 170 && b < 140 && r > g + 15 && g > b + 5) oak++;
    }
  }
  if (!n) return { mean: 0, whitePct: 100, darkPct: 0, brownPct: 0, oakPct: 0, n: 0 };
  return {
    mean: sum / n,
    whitePct: (100 * white) / n,
    darkPct: (100 * dark) / n,
    brownPct: (100 * brown) / n,
    oakPct: (100 * oak) / n,
    n,
  };
}

/**
 * Street / parking strip must show asphalt or paving — not the white sheet margin.
 * Samples the lower band of the street-cars zoom (road + sidewalk under cars).
 */
export async function checkCarsOnGround(streetCarsZoom: Buffer): Promise<PlanVisualCheck> {
  const bottom = await regionStats(streetCarsZoom, { x0: 0.05, x1: 0.95, y0: 0.72, y1: 0.98 });
  const mid = await regionStats(streetCarsZoom, { x0: 0.1, x1: 0.9, y0: 0.35, y1: 0.7 });
  const groundOk = bottom.whitePct < 25 && bottom.mean < 230 && (bottom.darkPct + bottom.brownPct) > 20;
  const carsAreaOk = mid.whitePct < 40;
  const ok = groundOk && carsAreaOk && bottom.n > 100;
  return {
    id: "CarsOnGround",
    ok,
    detail: ok
      ? `street strip mean=${bottom.mean.toFixed(0)} white=${bottom.whitePct.toFixed(1)}% ground=${(bottom.darkPct + bottom.brownPct).toFixed(1)}%`
      : `sheet/empty under cars: mean=${bottom.mean.toFixed(0)} white=${bottom.whitePct.toFixed(1)}% ground=${(bottom.darkPct + bottom.brownPct).toFixed(1)}%`,
  };
}

/** Bin yard strip: not blank white; some paving / bin mass present. */
export async function checkBinsGround(binsZoom: Buffer): Promise<PlanVisualCheck> {
  const s = await regionStats(binsZoom, { x0: 0.1, x1: 0.9, y0: 0.15, y1: 0.9 });
  const ok = s.whitePct < 55 && s.mean < 235 && s.n > 50;
  return {
    id: "BinsGround",
    ok,
    detail: ok
      ? `bins zoom mean=${s.mean.toFixed(0)} white=${s.whitePct.toFixed(1)}%`
      : `bins look empty/sheet: mean=${s.mean.toFixed(0)} white=${s.whitePct.toFixed(1)}%`,
  };
}

/**
 * Wet-room zoom: oak-coloured bands must stay rare next to the toilet
 * (no invented stair wood in the WC). Samples the centre of a WC-focused crop
 * (prefer geometry-based crop from wet fixtures — fixed PLAN_ZOOM_CROPS can land
 * on the U-stair for models whose layout differs from C).
 */
export async function checkNoOakInWc(wcZoom: Buffer): Promise<PlanVisualCheck> {
  const wet = await regionStats(wcZoom, { x0: 0.25, x1: 0.75, y0: 0.25, y1: 0.75 });
  // Measured porcelain can have warm tint; fail only when oak-like density is high.
  const ok = wet.oakPct < 12;
  return {
    id: "NoOakInWc",
    ok,
    detail: ok
      ? `WC fixture oak-like=${wet.oakPct.toFixed(2)}%`
      : `oak bands near WC: oak-like=${wet.oakPct.toFixed(2)}%`,
  };
}

/**
 * WC centres only (toilet / cistern) — not kitchen sinks / basins, which would
 * pull the oak check onto hall wood.
 */
export function wetFixtureCentres(primitives: readonly Primitive[], floorId: string): Array<{ x: number; z: number }> {
  const id = floorId.startsWith("floor-") ? floorId : `floor-${floorId}`;
  const out: Array<{ x: number; z: number }> = [];
  for (const p of primitives) {
    if (!p.tag?.startsWith(`${id}:`)) continue;
    const t = p.tag.toLowerCase();
    if (!/toilet|cistern|אסלה/.test(t)) continue;
    if (/kitchen|מטבח/.test(t)) continue;
    if (p.type === "box") out.push({ x: p.centre.x, z: p.centre.z });
    else if ("at" in p && p.at && typeof p.at === "object" && "x" in p.at) {
      out.push({ x: (p.at as { x: number }).x, z: (p.at as { z: number }).z });
    }
  }
  return out;
}

export type WetRoomBox = { kind: string; x: number; z: number; w: number; d: number; areaM2?: number };

/** Small bathroom / WC rooms from state — toilet nooks are typically ≤2.5 m². */
export function wcRoomCentres(rooms: readonly WetRoomBox[] | undefined): Array<{ x: number; z: number }> {
  if (!rooms?.length) return [];
  const baths = rooms.filter((r) => /bath|toilet|wc|שירות/.test(r.kind));
  const small = baths.filter((r) => (r.areaM2 ?? r.w * r.d) <= 2.5);
  const pick = small.length ? small : baths.filter((r) => (r.areaM2 ?? r.w * r.d) <= 4);
  return pick.map((r) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 }));
}

/** Crop a square around WC fixtures / small bath rooms in plan image space. */
export async function cropWetZone(
  plan: Buffer,
  floor: PlanGeometryFloorMeta,
  primitives: readonly Primitive[],
  rooms?: readonly WetRoomBox[],
): Promise<Buffer | null> {
  const centres = wetFixtureCentres(primitives, floor.id);
  const fromRooms = centres.length ? centres : wcRoomCentres(rooms);
  if (!fromRooms.length) return null;
  const use = fromRooms;
  const meta = await sharp(plan).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 100 || H < 100) return null;
  const padM = housePlanPadMetres(floor, primitives);
  const w0 = floor.sheetWidth / DWF_FLOOR_UNITS_PER_METRE;
  const h0 = floor.sheetHeight / DWF_FLOOR_UNITS_PER_METRE;
  const w = w0 + 2 * padM;
  const h = h0 + 2 * padM;
  const cx = w0 / 2 + floor.shift.x;
  const cz = h0 / 2 + floor.shift.y;
  const x0m = cx - w / 2;
  const z0m = cz - h / 2;
  // Plan image Y grows with world Z (verified against bathroom room marks).
  const xs = use.map((c) => ((c.x - x0m) / w) * W);
  const ys = use.map((c) => ((c.z - z0m) / h) * H);
  // Check each WC nook separately — take the worst oak reading via caller;
  // here return a crop around the first small room (scripts write zooms).
  const mx = xs[0]!;
  const my = ys[0]!;
  // ~1.8 m square around one WC nook.
  const side = Math.max(64, Math.round((1.8 / w) * W));
  const left = Math.max(0, Math.min(W - side, Math.round(mx - side / 2)));
  const top = Math.max(0, Math.min(H - side, Math.round(my - side / 2)));
  const width = Math.min(side, W - left);
  const height = Math.min(side, H - top);
  return sharp(plan).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
}

/** Oak check over every small WC room; FAIL if any nook is oak-heavy. */
export async function checkNoOakInWcRooms(
  plan: Buffer,
  floor: PlanGeometryFloorMeta,
  primitives: readonly Primitive[],
  rooms?: readonly WetRoomBox[],
): Promise<PlanVisualCheck> {
  const centres = wetFixtureCentres(primitives, floor.id);
  const pts = centres.length ? centres : wcRoomCentres(rooms);
  if (!pts.length) {
    // No geometry — fall back handled by caller with fixed zoom.
    return { id: "NoOakInWc", ok: true, detail: "no WC rooms/fixtures to sample" };
  }
  const meta = await sharp(plan).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const padM = housePlanPadMetres(floor, primitives);
  const w0 = floor.sheetWidth / DWF_FLOOR_UNITS_PER_METRE;
  const h0 = floor.sheetHeight / DWF_FLOOR_UNITS_PER_METRE;
  const w = w0 + 2 * padM;
  const h = h0 + 2 * padM;
  const cx = w0 / 2 + floor.shift.x;
  const cz = h0 / 2 + floor.shift.y;
  const x0m = cx - w / 2;
  const z0m = cz - h / 2;
  const side = Math.max(64, Math.round((1.8 / w) * W));
  let worst = 0;
  let worstAt = "";
  for (const c of pts) {
    const mx = ((c.x - x0m) / w) * W;
    const my = ((c.z - z0m) / h) * H;
    const left = Math.max(0, Math.min(W - side, Math.round(mx - side / 2)));
    const top = Math.max(0, Math.min(H - side, Math.round(my - side / 2)));
    const width = Math.min(side, W - left);
    const height = Math.min(side, H - top);
    const crop = await sharp(plan).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
    const s = await regionStats(crop, { x0: 0.2, x1: 0.8, y0: 0.2, y1: 0.8 });
    if (s.oakPct > worst) {
      worst = s.oakPct;
      worstAt = `(${c.x.toFixed(1)},${c.z.toFixed(1)})`;
    }
  }
  const ok = worst < 12;
  return {
    id: "NoOakInWc",
    ok,
    detail: ok ? `WC nooks oak-like≤${worst.toFixed(2)}%` : `oak bands near WC ${worstAt}: oak-like=${worst.toFixed(2)}%`,
  };
}

export type PlanVisualGateInput = {
  /** Measured (or candidate) full storey plan JPEG. */
  plan: Buffer;
  /** Optional pre-cut zooms; missing ones are cropped from `plan`. */
  zooms?: Partial<Record<PlanZoomId, Buffer>>;
  /** Storey id for check prefixes, e.g. floor-0. */
  floorId?: string;
  /** When set with primitives/rooms, NoOakInWc uses WC room crops (layout-safe). */
  floor?: PlanGeometryFloorMeta;
  primitives?: readonly Primitive[];
  rooms?: readonly WetRoomBox[];
};

/** Run visual checks for one storey plan. Free — no paid AI. */
export async function assertPlanVisual(input: PlanVisualGateInput): Promise<PlanVisualGateResult> {
  const prefix = input.floorId ? `${input.floorId}/` : "";
  const zooms: Partial<Record<PlanZoomId, Buffer>> = { ...input.zooms };
  for (const c of PLAN_ZOOM_CROPS) {
    if (!zooms[c.id]) zooms[c.id] = await cropPlanZoom(input.plan, c.id);
  }
  const checks: PlanVisualCheck[] = [];
  const faults: string[] = [];

  const cars = await checkCarsOnGround(zooms["street-cars"]!);
  checks.push({ ...cars, id: `${prefix}${cars.id}` });
  if (!cars.ok) faults.push(`${prefix}CarsOnGround`);

  const bins = await checkBinsGround(zooms.bins!);
  checks.push({ ...bins, id: `${prefix}${bins.id}` });
  if (!bins.ok) faults.push(`${prefix}BinsGround`);

  let wc: PlanVisualCheck;
  if (input.floor && (input.primitives?.length || input.rooms?.length)) {
    wc = await checkNoOakInWcRooms(input.plan, input.floor, input.primitives ?? [], input.rooms);
    if (wc.detail === "no WC rooms/fixtures to sample") {
      wc = await checkNoOakInWc(zooms.wc!);
    }
  } else {
    wc = await checkNoOakInWc(zooms.wc!);
  }
  checks.push({ ...wc, id: `${prefix}${wc.id}` });
  if (!wc.ok) faults.push(`${prefix}NoOakInWc`);

  // U-stair zoom must exist and not be blank white (structure present).
  const stair = await regionStats(zooms["u-stair"]!, { x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.9 });
  const stairOk = stair.whitePct < 60 && stair.mean < 240;
  checks.push({
    id: `${prefix}UStairPresent`,
    ok: stairOk,
    detail: stairOk
      ? `u-stair mean=${stair.mean.toFixed(0)} white=${stair.whitePct.toFixed(1)}%`
      : `u-stair empty/sheet: mean=${stair.mean.toFixed(0)} white=${stair.whitePct.toFixed(1)}%`,
  });
  if (!stairOk) faults.push(`${prefix}UStairPresent`);

  if (faults.length) return { ok: false, faults, checks };
  return { ok: true, checks };
}

/** Visual gate for every non-roof storey plan buffer. */
export async function assertHousePlanVisual(input: {
  plans: Array<{
    floorId: string;
    plan: Buffer;
    zooms?: Partial<Record<PlanZoomId, Buffer>>;
    floor?: PlanGeometryFloorMeta;
    rooms?: readonly WetRoomBox[];
  }>;
  primitives?: readonly Primitive[];
}): Promise<PlanVisualGateResult> {
  const all: PlanVisualCheck[] = [];
  const faults: string[] = [];
  for (const p of input.plans) {
    const r = await assertPlanVisual({
      plan: p.plan,
      zooms: p.zooms,
      floorId: p.floorId,
      floor: p.floor,
      primitives: input.primitives,
      rooms: p.rooms,
    });
    all.push(...r.checks);
    if (!r.ok) faults.push(...r.faults);
  }
  if (faults.length) return { ok: false, faults, checks: all };
  return { ok: true, checks: all };
}

export function formatPlanVisualGate(result: PlanVisualGateResult): string {
  const lines = result.checks.map((c) => `${c.ok ? "OK" : "FAIL"}  ${c.id}: ${c.detail}`);
  if (result.ok) return ["Plan visual gate: PASS", ...lines].join("\n");
  return ["Plan visual gate: BLOCKED", ...lines, `faults: ${result.faults.join(", ")}`].join("\n");
}
