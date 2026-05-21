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

export const blueprintBoqLineSchema = z.object({
  description: z.string().min(1),
  unit: z.string().optional(),
  quantity: z.number().optional(),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const blueprintAnalysisSchema = z.object({
  tasks: z.array(blueprintTaskSchema).optional().default([]),
  milestones: z.array(blueprintMilestoneSchema).optional().default([]),
  boqLineItems: z.array(blueprintBoqLineSchema).optional().default([]),
  requiresReview: z.boolean().optional().default(true),
});

export type BlueprintAnalysis = z.infer<typeof blueprintAnalysisSchema>;

export function parseBlueprintAnalysis(raw: Record<string, unknown>): BlueprintAnalysis {
  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const milestonesRaw = Array.isArray(raw.milestones) ? raw.milestones : [];
  const boqRaw = Array.isArray(raw.boqLineItems) ? raw.boqLineItems : [];

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
    boqLineItems: boqRaw.map((b) => {
      const row = b as Record<string, unknown>;
      return {
        description: String(row.description ?? row.name ?? "").trim(),
        unit: row.unit != null ? String(row.unit) : undefined,
        quantity: row.quantity != null ? Number(row.quantity) : undefined,
        note: row.note != null ? String(row.note) : undefined,
        confidence: row.confidence != null ? Number(row.confidence) : undefined,
      };
    }).filter((b) => b.description.length > 0),
    requiresReview: raw.requiresReview !== false,
  });
}
