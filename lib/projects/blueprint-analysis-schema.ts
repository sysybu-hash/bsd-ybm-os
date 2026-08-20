import { z } from "zod";

export const blueprintTaskSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  durationDays: z.number().optional(),
  tradeCategory: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
});

export const blueprintMilestoneSchema = z.object({
  name: z.string().min(1),
  percent: z.union([z.number(), z.string()]).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  description: z.string().optional(),
});

export const blueprintBoqLineSchema = z.object({
  description: z.string().min(1),
  unit: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  lineTotal: z.number().optional(),
  note: z.string().optional(),
  tradeCategory: z.string().optional(),
  drawingRef: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const blueprintAnalysisSchema = z.object({
  tasks: z.array(blueprintTaskSchema).optional().default([]),
  milestones: z.array(blueprintMilestoneSchema).optional().default([]),
  boqLineItems: z.array(blueprintBoqLineSchema).optional().default([]),
  projectSummary: z.string().optional(),
  totalEstimatedCost: z.number().optional(),
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
        durationDays: row.durationDays != null ? Number(row.durationDays) : undefined,
        tradeCategory: row.tradeCategory != null ? String(row.tradeCategory) : undefined,
        dependsOn: Array.isArray(row.dependsOn) ? (row.dependsOn as unknown[]).map(String) : undefined,
      };
    }).filter((t) => t.name.length > 0),
    milestones: milestonesRaw.map((m) => {
      const row = m as Record<string, unknown>;
      const pctRaw = row.percent ?? row.percentage ?? row.share;
      const amountRaw = row.amount ?? row.amountIls ?? row.value;
      return {
        name: String(row.name ?? "").trim(),
        percent: pctRaw != null ? pctRaw : undefined,
        amount: amountRaw != null ? amountRaw : undefined,
        description: row.description != null ? String(row.description) : undefined,
      };
    }).filter((m) => m.name.length > 0),
    boqLineItems: boqRaw.map((b) => {
      const row = b as Record<string, unknown>;
      return {
        description: String(row.description ?? row.name ?? "").trim(),
        unit: row.unit != null ? String(row.unit) : undefined,
        quantity: row.quantity != null ? Number(row.quantity) : undefined,
        unitPrice: row.unitPrice != null ? Number(row.unitPrice) : undefined,
        lineTotal: row.lineTotal != null ? Number(row.lineTotal) : undefined,
        note: row.note != null ? String(row.note) : undefined,
        tradeCategory: row.tradeCategory != null ? String(row.tradeCategory) : undefined,
        drawingRef: row.drawingRef != null ? String(row.drawingRef) : undefined,
        confidence: row.confidence != null ? Number(row.confidence) : undefined,
      };
    }).filter((b) => b.description.length > 0),
    projectSummary: raw.projectSummary != null ? String(raw.projectSummary) : undefined,
    totalEstimatedCost: raw.totalEstimatedCost != null ? Number(raw.totalEstimatedCost) : undefined,
    requiresReview: raw.requiresReview !== false,
  });
}
