import { z } from "zod";

const docTypeSchema = z.enum(["INVOICE", "RECEIPT", "INVOICE_RECEIPT", "CREDIT_NOTE"]);

export const invoiceLineItemSchema = z.object({
  desc: z.string().trim().min(1, "תיאור פריט חובה").max(2000),
  qty: z.number().positive("כמות חייבת להיות חיובית"),
  price: z.number().positive("מחיר חייב להיות חיובי"),
});

/** הנפקת מסמך — אימות לפני POST ל־/api/erp/issued-documents */
export const invoiceIssuancePayloadSchema = z.object({
  type: docTypeSchema,
  clientName: z.string().trim().min(1, "נא להזין שם לקוח").max(300),
  items: z.array(invoiceLineItemSchema).min(1, "נדרש לפחות פריט אחד"),
  dueDate: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
});

export type InvoiceIssuancePayload = z.infer<typeof invoiceIssuancePayloadSchema>;

/** שלב 1 באשף הנפקה — לפני מילוי שורות */
export const invoiceIssuanceStep1Schema = z.object({
  type: docTypeSchema,
  clientName: z.string().trim().min(1, "נא להזין שם לקוח").max(300),
  dueDate: z.string().trim().optional().or(z.literal("")),
});

/** שלב 2 — שורות פריטים בלבד */
export const invoiceIssuanceItemsOnlySchema = z.object({
  items: z.array(invoiceLineItemSchema).min(1, "נדרש לפחות פריט אחד"),
});
