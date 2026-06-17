import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import type { ProcurementRequestRow } from "@/lib/validation/schemas/procurement";
import {
  createPurchaseRequestSchema,
} from "@/lib/validation/schemas/procurement";
import { jsonNotFound } from "@/lib/api-json";
import {
  isLowStockItem,
  mapLowStockToVirtualRequest,
} from "@/lib/procurement/low-stock-requests";

export const dynamic = "force-dynamic";

const log = createLogger("procurement-requests");

function mapDbRequest(row: {
  id: string;
  title: string;
  source: string;
  quantityNeeded: number;
  notes: string | null;
  inventoryItemId: string | null;
  projectId: string | null;
  createdAt: Date;
}): ProcurementRequestRow {
  return {
    id: row.id,
    title: row.title,
    status: "PENDING",
    source: row.source as ProcurementRequestRow["source"],
    quantityNeeded: row.quantityNeeded,
    notes: row.notes,
    inventoryItemId: row.inventoryItemId,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    isVirtual: false,
  };
}

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req, "procurement:requests", 30, 60_000);
  if (limited) return limited;

  try {
    const [dbRequests, inventoryItems] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where: { organizationId: orgId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.inventoryItem.findMany({
        where: { organizationId: orgId, minQuantity: { gt: 0 } },
        orderBy: { name: "asc" },
      }),
    ]);

    const dbRows = dbRequests.map(mapDbRequest);

    const existingInventoryIds = new Set(
      dbRows.map((row) => row.inventoryItemId).filter((id): id is string => Boolean(id)),
    );

    const autoRows = inventoryItems
      .filter(isLowStockItem)
      .filter((item) => !existingInventoryIds.has(item.id))
      .map(mapLowStockToVirtualRequest);

    return NextResponse.json({
      requests: [...autoRows, ...dbRows],
    });
  } catch (err: unknown) {
    log.error("list procurement requests failed", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
    return apiErrorResponse(err, "procurement-requests");
  }
});

export const POST = withWorkspacesAuth(
  async (req, { orgId }, data) => {
    const limited = await applyRateLimit(req, "procurement:requests:create", 20, 60_000);
    if (limited) return limited;

    try {
      if (data.projectId) {
        const projectGate = await requireProjectForOrg(data.projectId, orgId);
        if (!projectGate.ok) return projectGate.response;
      }

      if (data.inventoryItemId) {
        const item = await prisma.inventoryItem.findFirst({
          where: { id: data.inventoryItemId, organizationId: orgId },
        });
        if (!item) return jsonNotFound("פריט המלאי לא נמצא");
      }

      const created = await prisma.purchaseRequest.create({
        data: {
          organizationId: orgId,
          title: data.title.trim(),
          source: "MANUAL",
          status: "PENDING",
          quantityNeeded: data.quantityNeeded,
          notes: data.notes?.trim() || null,
          inventoryItemId: data.inventoryItemId ?? null,
          projectId: data.projectId ?? null,
        },
      });

      return NextResponse.json({ request: mapDbRequest(created) }, { status: 201 });
    } catch (err: unknown) {
      log.error("create procurement request failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
      });
      return apiErrorResponse(err, "procurement-requests-create");
    }
  },
  { schema: createPurchaseRequestSchema },
);
