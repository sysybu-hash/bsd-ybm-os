/** Client-side shapes of /api/vmb/projects and /api/vmb/jobs/[id] (dates as ISO strings). */

export type JobItem = {
  id: string;
  kind: string;
  status: string;
  percent: number;
  etaSeconds: number | null;
  stage: string | null;
  stageDetail: string | null;
  error: string | null;
};

export type ProjectItem = {
  id: string;
  name: string;
  kind: string;
  status: string;
  updatedAt: string;
  lastJob: JobItem | null;
};

export type ProgressText = {
  /** Templates with {n}: minutes left. */
  etaMinutes: string;
  etaSoon: string;
  etaUnknown: string;
  /** Stage key → name; unknown keys fall back to `stageWorking`. */
  stages: Record<string, string>;
  stageWorking: string;
  queued: string;
};

export const isLive = (job: JobItem | null | undefined) => job?.status === "queued" || job?.status === "running";

export function etaText(seconds: number | null, t: ProgressText): string {
  if (seconds === null) return t.etaUnknown;
  if (seconds < 60) return t.etaSoon;
  return t.etaMinutes.replace("{n}", String(Math.round(seconds / 60)));
}

export function stageText(job: JobItem, t: ProgressText): string {
  if (job.status === "queued") return t.queued;
  const name = job.stage ? (t.stages[job.stage] ?? t.stageWorking) : t.stageWorking;
  return job.stageDetail ? `${name} · ${job.stageDetail}` : name;
}
