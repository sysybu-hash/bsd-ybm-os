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

const scanCount = z.object({ read: z.number(), total: z.number() });

/** VmbScanReport.counts as stored (see lib/vmb/scan.ts). */
export const vmbScanCountsSchema = z.object({ layers: scanCount, blocks: scanCount, entities: scanCount, hatches: scanCount });

/** VmbScanReport.unread as stored: every left-out thing with its reason. */
export const vmbScanUnreadSchema = z.array(
  z.object({
    name: z.string(),
    count: z.number(),
    reason: z.string(),
    holds: z.object({ lines: z.number(), hatches: z.number(), texts: z.number(), arcs: z.number(), blocks: z.number() }).optional(),
  }),
);

/** VmbScanReport.facts as stored (see ScanFacts in lib/vmb/scan.ts). */
export const vmbScanFactsSchema = z.object({ headerUnitsM: z.number().nullable(), levels: z.array(z.number()) });

/** The questions form as sent: answers by question id; each is checked against its question on the server. */
export const vmbAnswersBodySchema = z.object({ answers: z.record(z.string(), z.unknown()) });

/** The flat to build on a whole-floor drawing. */
export const vmbUnitBodySchema = z.object({ unit: z.number().int().min(1).max(9999) });
