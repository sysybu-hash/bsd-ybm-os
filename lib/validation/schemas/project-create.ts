import { z } from "zod";

export const createProjectWithClientSchema = z.discriminatedUnion("clientMode", [
  z.object({
    clientMode: z.literal("existing"),
    projectName: z.string().trim().min(1).max(200),
    contactId: z.string().trim().min(1),
  }),
  z.object({
    clientMode: z.literal("new"),
    projectName: z.string().trim().min(1).max(200),
    contactName: z.string().trim().min(1).max(200),
    contactEmail: z
      .string()
      .trim()
      .max(320)
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success),
    contactPhone: z.string().trim().max(40).optional(),
  }),
]);

export type CreateProjectWithClientInput = z.infer<typeof createProjectWithClientSchema>;
