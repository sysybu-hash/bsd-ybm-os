import { z } from "zod";

const statusEnum = z.enum([
  "LEAD",
  "PROPOSAL",
  "ACTIVE",
  "CLOSED_WON",
  "CLOSED_LOST",
]);

/** יצירת לקוח (טופס / CRM) */
export const clientCreateFormSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם לקוח").max(200),
  email: z
    .string()
    .trim()
    .max(320)
    .superRefine((val, ctx) => {
      if (!val) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        ctx.addIssue({ code: "custom", message: "אימייל לא תקין" });
      }
    }),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  status: statusEnum.default("LEAD"),
  projectId: z.string().trim().optional().or(z.literal("")),
  value: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Number.parseFloat(v)), "ערך עסקה מספרי בלבד"),
  notes: z.string().trim().max(20_000).optional().or(z.literal("")),
});

export type ClientCreateFormValues = z.infer<typeof clientCreateFormSchema>;

/** עדכון לקוח (מודאל עריכה) */
export const clientUpdateFormSchema = clientCreateFormSchema.extend({
  contactId: z.string().trim().min(1),
});

export type ClientUpdateFormValues = z.infer<typeof clientUpdateFormSchema>;
