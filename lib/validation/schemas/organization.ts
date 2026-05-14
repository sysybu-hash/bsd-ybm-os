import { z } from "zod";

/** שמירת זהות ארגון (הגדרות → ארגון) */
export const organizationIdentityFormSchema = z.object({
  name: z.string().trim().min(1, "שם ארגון חובה").max(200),
  type: z.enum(["HOME", "FREELANCER", "COMPANY", "ENTERPRISE"]),
  companyType: z.enum(["LICENSED_DEALER", "EXEMPT_DEALER", "LTD_COMPANY"]),
  taxId: z.string().trim().max(32).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export type OrganizationIdentityFormValues = z.infer<typeof organizationIdentityFormSchema>;

export const organizationInviteFormSchema = z.object({
  email: z.string().trim().email("אימייל לא תקין").max(320),
  role: z.enum(["EMPLOYEE", "PROJECT_MGR", "CLIENT", "ORG_ADMIN"]),
  validDays: z.coerce.number().int().min(1).max(90),
});
