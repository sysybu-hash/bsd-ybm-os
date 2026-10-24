/**
 * Product gate: elevations / rooms / hero paint stay blocked until storey plans
 * are measured + painted + judged ready under the world-class plans pipeline.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type PlansReadyFloor = {
  floorId: string;
  geometryOk: boolean;
  visualOk: boolean;
  paintedOk?: boolean;
  judgeOk?: boolean;
};

export type PlansReadyFile = {
  ok: boolean;
  model: string;
  floors: PlansReadyFloor[];
  zooms: string[];
  /** ISO time when last written. */
  at: string;
  /** Spend so far on this model's plan paint (ILS), if any. */
  spentIls?: number;
  notes?: string;
};

const ZOOM_IDS = ["street-cars", "bins", "u-stair", "wc"] as const;

export function plansReadyPath(dir: string, modelId?: string): string {
  return modelId ? path.join(dir, modelId, "plans-ready.json") : path.join(dir, "plans-ready.json");
}

export function readPlansReady(dir: string, modelId?: string): PlansReadyFile | null {
  const p = plansReadyPath(dir, modelId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PlansReadyFile;
  } catch {
    return null;
  }
}

export function writePlansReady(dir: string, file: PlansReadyFile, modelId?: string): string {
  const targetDir = modelId ? path.join(dir, modelId) : dir;
  mkdirSync(targetDir, { recursive: true });
  const p = plansReadyPath(dir, modelId);
  writeFileSync(p, JSON.stringify(file, null, 2));
  return p;
}

/** True only when every listed floor has geometry+visual+paint+judge ok. */
export function plansReadyOk(file: PlansReadyFile | null | undefined): boolean {
  if (!file?.ok || !file.floors.length) return false;
  return file.floors.every((f) => f.geometryOk && f.visualOk && f.paintedOk === true && f.judgeOk === true);
}

/**
 * Refuse elevation / room / hero paint until plans are ready.
 * Returns faults; empty means allowed.
 */
export function assertElevationsAllowed(plansReady: PlansReadyFile | null | undefined): {
  ok: boolean;
  faults: string[];
} {
  if (plansReadyOk(plansReady)) return { ok: true, faults: [] };
  return { ok: false, faults: ["plansNotReady"] };
}

/** Build a measured-stage plans-ready stub (paint/judge still false). */
export function measuredPlansReadyStub(input: {
  model: string;
  floors: Array<{ floorId: string; geometryOk: boolean; visualOk: boolean }>;
  notes?: string;
}): PlansReadyFile {
  return {
    ok: false,
    model: input.model,
    floors: input.floors.map((f) => ({
      floorId: f.floorId,
      geometryOk: f.geometryOk,
      visualOk: f.visualOk,
      paintedOk: false,
      judgeOk: false,
    })),
    zooms: [...ZOOM_IDS],
    at: new Date().toISOString(),
    notes: input.notes ?? "measured+gates only; paint not signed off",
  };
}

/** Mark all floors painted+judged (world-class plans complete for this model). */
export function markPlansPaintedReady(
  prev: PlansReadyFile,
  input: { spentIls?: number; notes?: string },
): PlansReadyFile {
  const floors = prev.floors.map((f) => ({
    ...f,
    paintedOk: f.geometryOk && f.visualOk ? true : f.paintedOk,
    judgeOk: f.geometryOk && f.visualOk ? true : f.judgeOk,
  }));
  const ok = floors.every((f) => f.geometryOk && f.visualOk && f.paintedOk && f.judgeOk);
  return {
    ...prev,
    ok,
    floors,
    at: new Date().toISOString(),
    spentIls: input.spentIls ?? prev.spentIls,
    notes: input.notes ?? prev.notes,
  };
}

/** Aggregate multi-model readiness at a root out dir. */
export function writeProjectPlansReady(
  dir: string,
  models: PlansReadyFile[],
): PlansReadyFile {
  const floors = models.flatMap((m) => m.floors.map((f) => ({ ...f, floorId: `${m.model}/${f.floorId}` })));
  const file: PlansReadyFile = {
    ok: models.every((m) => plansReadyOk(m)),
    model: models.map((m) => m.model).join(","),
    floors,
    zooms: [...ZOOM_IDS],
    at: new Date().toISOString(),
    spentIls: models.reduce((s, m) => s + (m.spentIls ?? 0), 0),
    notes: fileNotes(models),
  };
  writePlansReady(dir, file);
  return file;
}

function fileNotes(models: PlansReadyFile[]): string {
  const ready = models.filter((m) => plansReadyOk(m)).map((m) => m.model);
  const pending = models.filter((m) => !plansReadyOk(m)).map((m) => m.model);
  if (!pending.length) return `all models ready: ${ready.join(",")}`;
  return `ready=[${ready.join(",")}] pending=[${pending.join(",")}]`;
}
