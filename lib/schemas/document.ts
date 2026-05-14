import { z } from "zod";

/** גוף בקשה ל־PATCH על מסמך ERP (ארכיון חכם) */
export const DocumentSchema = z.object({
  fileName: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  aiData: z.record(z.string(), z.unknown()).optional(),
});

export type DocumentPatchBody = z.infer<typeof DocumentSchema>;
