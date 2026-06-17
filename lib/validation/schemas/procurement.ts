import { z } from "zod";

export const purchaseRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "ORDERED",
  "REJECTED",
]);

export const purchaseRequestSourceSchema = z.enum(["LOW_STOCK", "BOQ", "MANUAL"]);

export const procurementRequestRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: purchaseRequestStatusSchema,
  source: purchaseRequestSourceSchema,
  quantityNeeded: z.number(),
  notes: z.string().nullable(),
  inventoryItemId: z.string().nullable(),
  projectId: z.string().nullable(),
  createdAt: z.string(),
  isVirtual: z.boolean().optional(),
  virtualMeta: z
    .object({
      itemName: z.string(),
      quantity: z.number(),
      minQuantity: z.number(),
      unit: z.string(),
    })
    .optional(),
});

export const procurementRequestsResponseSchema = z.object({
  requests: z.array(procurementRequestRowSchema),
});

export type ProcurementRequestRow = z.infer<typeof procurementRequestRowSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().max(120).optional().nullable(),
  email: z.union([z.string().email().max(200), z.literal(""), z.null()]).optional(),
  phone: z.string().max(40).optional().nullable(),
  taxId: z.string().max(20).optional().nullable(),
  paymentTerms: z.string().max(120).optional().nullable(),
});

export const createPoFromRequestSchema = z.object({
  requestId: z.string().min(1).max(200),
  supplierId: z.string().cuid(),
  unitPrice: z.number().finite().min(0),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
  issueDocument: z.boolean().optional(),
  markSent: z.boolean().optional(),
});

export const issuePoDocumentSchema = z.object({
  markSent: z.boolean().optional(),
});

export const supplierRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
  paymentTerms: z.string().nullable(),
});

export const suppliersResponseSchema = z.object({
  suppliers: z.array(supplierRowSchema),
});

export const purchaseOrderRowSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  expectedDate: z.string().nullable(),
  notes: z.string().nullable(),
  issuedDocumentId: z.string().nullable().optional(),
  createdAt: z.string(),
  supplier: z.object({
    id: z.string(),
    name: z.string(),
  }),
  lineItems: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      totalPrice: z.number(),
      receivedQty: z.number(),
      inventoryItemId: z.string().nullable().optional(),
    }),
  ),
});

export const poStatusSchema = z.enum(["DRAFT", "SENT", "PARTIAL", "RECEIVED", "CANCELLED"]);

export const updatePoStatusSchema = z.object({
  status: poStatusSchema,
});

export const receivePoLineSchema = z.object({
  lineId: z.string().cuid(),
  quantityReceived: z.number().finite().positive(),
});

export const receivePoSchema = z.object({
  lines: z.array(receivePoLineSchema).min(1).max(50),
});

export const createPurchaseRequestSchema = z.object({
  title: z.string().min(1).max(200),
  quantityNeeded: z.number().finite().positive(),
  notes: z.string().max(1000).optional().nullable(),
  inventoryItemId: z.string().cuid().optional().nullable(),
  projectId: z.string().cuid().optional().nullable(),
});

export const purchaseOrdersResponseSchema = z.object({
  orders: z.array(purchaseOrderRowSchema),
});

export type SupplierRow = z.infer<typeof supplierRowSchema>;
export type PurchaseOrderRow = z.infer<typeof purchaseOrderRowSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type CreatePoFromRequestInput = z.infer<typeof createPoFromRequestSchema>;
export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type UpdatePoStatusInput = z.infer<typeof updatePoStatusSchema>;
export type ReceivePoInput = z.infer<typeof receivePoSchema>;
