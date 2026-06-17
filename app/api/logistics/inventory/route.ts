import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createInventoryItemSchema } from "@/lib/validation/schemas/logistics";

export const dynamic = "force-dynamic";

const log = createLogger("logistics-inventory");

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const items = await prisma.inventoryItem.findMany({
    where: {
      organizationId: orgId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ items });
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      const item = await prisma.inventoryItem.create({
        data: {
          name: data.name,
          sku: data.sku ?? null,
          category: data.category ?? "general",
          quantity: data.quantity ?? 0,
          minQuantity: data.minQuantity ?? 0,
          unit: data.unit ?? "units",
          location: data.location ?? null,
          organizationId: orgId,
        },
      });
      return NextResponse.json(item, { status: 201 });
    } catch (err: unknown) {
      log.error("create inventory item failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiErrorResponse(err, "logistics-inventory-create");
    }
  },
  { schema: createInventoryItemSchema },
);
