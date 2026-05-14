import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  lineTotal: z.number().optional(),
  priceAlertPending: z.boolean().optional(),
});

export type LineItemPatchBody = z.infer<typeof LineItemSchema>;
