import { z } from "zod";

const id = z.string().trim().min(1).max(64);

/** One VMB administrator action (lib/vmb/admin-store.ts). */
export const vmbAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    workspaceId: id,
    amount: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((n) => n !== 0),
    note: z.string().trim().min(2).max(200),
  }),
  z.object({ action: z.literal("activate"), workspaceId: id, reference: z.string().trim().min(3).max(80) }),
  z.object({ action: z.literal("freeze"), workspaceId: id }),
  z.object({ action: z.literal("unfreeze"), workspaceId: id }),
  z.object({ action: z.literal("extend"), workspaceId: id, days: z.number().int().min(1).max(366) }),
  z.object({ action: z.literal("refund"), workspaceId: id, paymentId: id, note: z.string().trim().min(2).max(200) }),
]);
export type VmbAdminActionBody = z.infer<typeof vmbAdminActionSchema>;
