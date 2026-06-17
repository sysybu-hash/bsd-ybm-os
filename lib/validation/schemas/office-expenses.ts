import { z } from "zod";

export const officeExpenseStatusSchema = z.enum(["DRAFT", "POSTED"]);

export const createOfficeExpenseSchema = z.object({
  vendorName: z.string().min(1).max(200),
  invoiceNumber: z.string().max(80).optional().nullable(),
  expenseDate: z.string().min(1).optional(),
  description: z.string().max(2000).optional().nullable(),
  amountNet: z.number().finite().nonnegative(),
  vat: z.number().finite().nonnegative().optional(),
  total: z.number().finite().nonnegative().optional(),
  status: officeExpenseStatusSchema.optional(),
});

export const updateOfficeExpenseSchema = createOfficeExpenseSchema.partial();

export const listOfficeExpensesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: officeExpenseStatusSchema.optional(),
  fromDate: z.string().min(1).optional(),
  toDate: z.string().min(1).optional(),
});

export type CreateOfficeExpenseInput = z.infer<typeof createOfficeExpenseSchema>;
export type UpdateOfficeExpenseInput = z.infer<typeof updateOfficeExpenseSchema>;
export type ListOfficeExpensesQuery = z.infer<typeof listOfficeExpensesQuerySchema>;
