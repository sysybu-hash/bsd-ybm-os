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
  z.object({ action: z.literal("retry"), workspaceId: id, projectId: id }),
  z.object({ action: z.literal("bench"), workspaceId: id, projectId: id, on: z.boolean() }),
  z.object({ action: z.literal("activate"), workspaceId: id, reference: z.string().trim().min(3).max(80) }),
  z.object({ action: z.literal("freeze"), workspaceId: id }),
  z.object({ action: z.literal("unfreeze"), workspaceId: id }),
  z.object({ action: z.literal("extend"), workspaceId: id, days: z.number().int().min(1).max(366) }),
  z.object({ action: z.literal("refund"), workspaceId: id, paymentId: id, note: z.string().trim().min(2).max(200) }),
]);
export type VmbAdminActionBody = z.infer<typeof vmbAdminActionSchema>;

const rateKey = z.enum(["dwgConversionUsd", "computeUsdPerHour", "storageUsdPerGbMonth", "paypalPercent", "paypalFixedIls", "dailyCeilingIls"]);
const isoDay = z.string().regex(/^d{4}-d{2}-d{2}$/);

/** One change to the cost console (lib/vmb/costs-store.ts): a rate, or a fixed monthly cost. */
export const vmbCostActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rate_set"), key: rateKey, value: z.number().min(0).max(100_000) }),
  z.object({ action: z.literal("rate_clear"), key: rateKey }),
  z.object({
    action: z.literal("fixed_add"),
    vendor: z.string().trim().min(2).max(80),
    amount: z.number().positive().max(1_000_000),
    currency: z.enum(["ILS", "USD"]),
    startsOn: isoDay,
    note: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("fixed_end"), id, endsOn: isoDay }),
  z.object({ action: z.literal("fixed_delete"), id }),
]);
export type VmbCostActionBody = z.infer<typeof vmbCostActionSchema>;
