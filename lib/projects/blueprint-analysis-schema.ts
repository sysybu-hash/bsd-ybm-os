import { z } from "zod";

export const blueprintTaskSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const blueprintMilestoneSchema = z.object({
  name: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
});

export const blueprintAnalysisSchema = z.object({
  tasks: z.array(blueprintTaskSchema).optional().default([]),
  milestones: z.array(blueprintMilestoneSchema).optional().default([]),
});

export type BlueprintAnalysis = z.infer<typeof blueprintAnalysisSchema>;

export function parseBlueprintAnalysis(raw: Record<string, unknown>): BlueprintAnalysis {
  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const milestonesRaw = Array.isArray(raw.milestones) ? raw.milestones : [];

  return blueprintAnalysisSchema.parse({
    tasks: tasksRaw.map((t) => {
      const row = t as Record<string, unknown>;
      return {
        name: String(row.name ?? row.title ?? "").trim(),
        startDate: row.startDate != null ? String(row.startDate) : undefined,
        endDate: row.endDate != null ? String(row.endDate) : undefined,
      };
    }).filter((t) => t.name.length > 0),
    milestones: milestonesRaw.map((m) => {
      const row = m as Record<string, unknown>;
      return {
        name: String(row.name ?? "").trim(),
        amount: row.amount ?? row.value ?? 0,
      };
    }).filter((m) => m.name.length > 0),
  });
}
