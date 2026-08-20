import { z } from "zod";

export const assetStatusSchema = z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE", "LOST"]);

export const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(80).optional().nullable(),
  category: z.string().min(1).max(80).optional(),
  quantity: z.number().finite().min(0).optional(),
  minQuantity: z.number().finite().min(0).optional(),
  unit: z.string().min(1).max(40).optional(),
  location: z.string().max(200).optional().nullable(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  serialNumber: z.string().max(120).optional().nullable(),
  type: z.string().min(1).max(80).optional(),
  status: assetStatusSchema.optional(),
});

export const assetCheckoutSchema = z.object({
  action: z.enum(["CHECK_OUT", "CHECK_IN"]),
  userId: z.string().cuid().optional().nullable(),
  projectId: z.string().cuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type AssetCheckoutInput = z.infer<typeof assetCheckoutSchema>;
