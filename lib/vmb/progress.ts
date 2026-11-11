/**
 * Job progress: a job is a list of weighted stages, each with done/total.
 * Pure functions, shared by the server (writes VmbJob) and every shell's UI.
 */

export type StageProgress = {
  /** Stable key, e.g. "read", "build", "render". */
  key: string;
  /** Relative share of the whole job's time. */
  weight: number;
  done: number;
  total: number;
  /** Human detail, e.g. "floor 2 of 4"; already translated by the caller. */
  detail?: string;
};

export type JobProgress = { stages: StageProgress[]; startedAt: number };

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Fraction of one stage done; an empty stage (total 0) counts as done. */
export function stageFraction(s: StageProgress): number {
  if (s.total <= 0) return 1;
  return clamp01(s.done / s.total);
}

/** Whole-job percent, 0..100, weighted by stage. 100 only when every stage is complete. */
export function jobPercent(stages: StageProgress[]): number {
  const totalWeight = stages.reduce((a, s) => a + Math.max(0, s.weight), 0);
  if (totalWeight <= 0) return stages.length === 0 ? 0 : 100;
  const done = stages.reduce((a, s) => a + Math.max(0, s.weight) * stageFraction(s), 0);
  const pct = Math.floor((done / totalWeight) * 100);
  const complete = stages.every((s) => stageFraction(s) >= 1);
  return complete ? 100 : Math.min(99, pct);
}

/** The first stage not yet complete: what the job is doing now. */
export function currentStage(stages: StageProgress[]): StageProgress | null {
  return stages.find((s) => stageFraction(s) < 1) ?? null;
}

/**
 * Seconds left: from earlier runs of the same kind when known (seconds per
 * unit of weight), else extrapolated from this run's own pace. Null before
 * there is anything to go on.
 */
export function etaSeconds(p: JobProgress, now: number, secondsPerWeight?: number): number | null {
  const totalWeight = p.stages.reduce((a, s) => a + Math.max(0, s.weight), 0);
  if (totalWeight <= 0) return null;
  const doneWeight = p.stages.reduce((a, s) => a + Math.max(0, s.weight) * stageFraction(s), 0);
  const left = totalWeight - doneWeight;
  if (left <= 0) return 0;
  if (secondsPerWeight && secondsPerWeight > 0) return Math.round(left * secondsPerWeight);
  const elapsed = (now - p.startedAt) / 1000;
  if (doneWeight <= 0 || elapsed <= 0) return null;
  return Math.round((elapsed / doneWeight) * left);
}

/** Returns a copy with one stage advanced; unknown keys are ignored, never thrown. */
export function advance(p: JobProgress, key: string, done: number, total?: number, detail?: string): JobProgress {
  return {
    ...p,
    stages: p.stages.map((s) =>
      s.key === key ? { ...s, done: Math.max(0, done), total: total ?? s.total, ...(detail !== undefined ? { detail } : {}) } : s,
    ),
  };
}
