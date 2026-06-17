import { z } from "zod";

export const progressBillStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PAID",
]);

export const createProgressBillSchema = z.object({
  projectId: z.string().min(1),
  contractorName: z.string().min(1).max(200),
  amount: z.number().positive(),
  completionPercent: z.number().min(0).max(100),
  submit: z.boolean().optional(),
});

export const updateProgressBillSchema = z.object({
  action: z.enum(["submit", "approve", "pay"]),
});

export const progressBillPortalRowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  billNumber: z.number().int(),
  contractorName: z.string().nullable(),
  amount: z.number(),
  completionPercent: z.number().nullable(),
  status: progressBillStatusSchema,
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ProgressBillPortalRow = z.infer<typeof progressBillPortalRowSchema>;
