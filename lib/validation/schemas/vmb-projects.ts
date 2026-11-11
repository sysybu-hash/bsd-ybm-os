import { z } from "zod";

/** Building kinds a VMB project can be; each routes to its own engine pipeline. */
export const VMB_PROJECT_KINDS = ["flat", "house", "building", "industrial", "public"] as const;
export type VmbProjectKind = (typeof VMB_PROJECT_KINDS)[number];

export const createVmbProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(VMB_PROJECT_KINDS).default("building"),
});
export type CreateVmbProject = z.infer<typeof createVmbProjectSchema>;

/** One stage of a job as stored in VmbJob.progress (see lib/vmb/progress.ts). */
export const vmbStageSchema = z.object({
  key: z.string(),
  weight: z.number(),
  done: z.number(),
  total: z.number(),
  detail: z.string().optional(),
});

export const vmbJobProgressSchema = z.object({
  startedAt: z.number(),
  stages: z.array(vmbStageSchema),
});
