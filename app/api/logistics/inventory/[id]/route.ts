import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { updateInventoryItemSchema } from "@/lib/validation/schemas/logistics";

export const dynamic = "force-dynamic";

const log = createLogger("logistics-inventory-id");

async function getOrgItem(orgId: string, id: string) {
  return prisma.inventoryItem.findFirst({
    where: { id, organizationId: orgId },
  });
}

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof updateInventoryItemSchema>(
  async (_req, { orgId }, segment, data) => {
    const { id } = await segment.params;
    const existing = await getOrgItem(orgId, id);
    if (!existing) return jsonNotFound("פריט המלאי לא נמצא");

    try {
      const item = await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
          ...(data.minQuantity !== undefined ? { minQuantity: data.minQuantity } : {}),
          ...(data.unit !== undefined ? { unit: data.unit } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
        },
      });
      return NextResponse.json(item);
    } catch (err: unknown) {
      log.error("update inventory item failed", {
        error: err instanceof Error ? err.message : String(err),
        id,
      });
      return apiErrorResponse(err, "logistics-inventory-patch");
    }
  },
  { schema: updateInventoryItemSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  const existing = await getOrgItem(orgId, id);
  if (!existing) return jsonNotFound("פריט המלאי לא נמצא");

  await prisma.inventoryItem.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
});
