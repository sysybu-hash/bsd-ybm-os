import { z } from "zod";

export const executiveStatsSchema = z.object({
  netCashflow: z.number(),
  lateTasks: z.number().int().nonnegative(),
  budgetAlerts: z.number().int().nonnegative(),
  activeProjects: z.number().int().nonnegative(),
  pendingProgressBills: z.number().int().nonnegative(),
});

export type ExecutiveStatsResponse = z.infer<typeof executiveStatsSchema>;
