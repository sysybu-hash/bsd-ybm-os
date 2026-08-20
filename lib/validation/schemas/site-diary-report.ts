import { z } from "zod";

export const siteDiaryTaskStatusSchema = z.enum(["todo", "in-progress", "review", "done"]);

export const siteDiaryAnalysisSchema = z.object({
  summary: z.string().min(1),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
  materialsDetected: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  suggestedTaskStatus: siteDiaryTaskStatusSchema.nullable().optional(),
  weather: z.string().nullable().optional(),
});

export const fieldSiteReportSchema = z.object({
  imageBase64: z.string().min(100).max(12_000_000),
  mimeType: z.string().regex(/^image\//),
  taskId: z.string().cuid().optional(),
  notes: z.string().max(500).optional().nullable(),
  locale: z.string().max(8).optional(),
  applyTaskStatus: z.boolean().optional(),
});

export type SiteDiaryAnalysis = z.infer<typeof siteDiaryAnalysisSchema>;
export type FieldSiteReportInput = z.infer<typeof fieldSiteReportSchema>;
