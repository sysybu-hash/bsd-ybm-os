import { z } from "zod";

export const saveScannedDocumentSchema = z
  .object({
    fileName: z.string().trim().min(1, "שם קובץ חובה").max(512),
    targetModule: z.enum(["ERP", "CRM"]),
    contactId: z.string().trim().min(1).optional(),
    scanJobId: z.string().trim().min(8).max(64).optional(),
    aiData: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scanJobId) return;
    if (val.aiData && Object.keys(val.aiData).length > 0) return;
    ctx.addIssue({
      code: "custom",
      message: "נדרשים aiData או מזהה משימת סריקה (scanJobId)",
      path: ["aiData"],
    });
  });

export type SaveScannedDocumentInput = z.infer<typeof saveScannedDocumentSchema>;
