import { z } from "zod";

export const progressBillStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PAID",
]);

export const progressBillLineInputSchema = z.object({
  boqLineId: z.string().min(1),
  executedQty: z.number().nonnegative(),
});

export const createProgressBillSchema = z
  .object({
    projectId: z.string().min(1),
    contractorName: z.string().min(1).max(200),
    amount: z.number().positive().optional(),
    completionPercent: z.number().min(0).max(100),
    submit: z.boolean().optional(),
    lines: z.array(progressBillLineInputSchema).max(200).optional(),
  })
  .refine(
    (v) =>
      (Array.isArray(v.lines) && v.lines.length > 0) ||
      (typeof v.amount === "number" && v.amount > 0),
    { message: "amount_or_lines_required" },
  );

export const updateProgressBillSchema = z.object({
  action: z.enum(["submit", "approve", "pay"]),
});

export const progressBillPortalLineSchema = z.object({
  id: z.string(),
  boqLineId: z.string().nullable(),
  description: z.string().nullable(),
  contractQty: z.number().nullable(),
  unitPrice: z.number().nullable(),
  executedQty: z.number().nullable(),
  lineTotal: z.number(),
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
  lines: z.array(progressBillPortalLineSchema).optional(),
});

export type ProgressBillPortalRow = z.infer<typeof progressBillPortalRowSchema>;
