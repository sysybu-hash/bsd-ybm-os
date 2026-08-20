import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonConflict, jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createPoFromRequest } from "@/lib/procurement/create-po-from-request";
import { issuePurchaseOrderDocument } from "@/lib/procurement/po-document";
import { mapPurchaseOrderRow } from "@/lib/procurement/map-purchase-order";
import { PoError } from "@/lib/procurement/po-errors";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  createPoFromRequestSchema,
} from "@/lib/validation/schemas/procurement";

export const dynamic = "force-dynamic";

const log = createLogger("procurement-orders");

function poErrorResponse(err: PoError) {
  switch (err.code) {
    case "SUPPLIER_NOT_FOUND":
      return jsonNotFound("הספק לא נמצא");
    case "REQUEST_NOT_FOUND":
      return jsonNotFound("דרישת הרכש לא נמצאה");
    case "INVENTORY_NOT_FOUND":
      return jsonNotFound("פריט המלאי לא נמצא");
    case "REQUEST_NOT_PENDING":
      return jsonConflict("הדרישה כבר טופלה");
    default:
      return jsonNotFound("לא נמצא");
  }
}

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const limited = await applyRateLimit(req, "procurement:orders", 30, 60_000);
  if (limited) return limited;

  try {
    const orders = await prisma.purchaseOrder.findMany({
      where: { organizationId: orgId },
      include: {
        supplier: { select: { id: true, name: true } },
        lineItems: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ orders: orders.map(mapPurchaseOrderRow) });
  } catch (err: unknown) {
    log.error("list purchase orders failed", {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    });
    return apiErrorResponse(err, "procurement-orders-list");
  }
});

export const POST = withWorkspacesAuth(
  async (req, { orgId, userId }, data) => {
    const limited = await applyRateLimit(req, "procurement:orders:create", 15, 60_000);
    if (limited) return limited;

    try {
      const expectedDate = data.expectedDate
        ? new Date(`${data.expectedDate}T12:00:00.000Z`)
        : null;

      const order = await createPoFromRequest({
        orgId,
        requestId: data.requestId,
        supplierId: data.supplierId,
        unitPrice: data.unitPrice,
        expectedDate,
        notes: data.notes?.trim() || null,
      });

      if (data.issueDocument) {
        const { order: issuedOrder } = await issuePurchaseOrderDocument(
          orgId,
          userId,
          order.id,
          { markSent: data.markSent ?? false },
        );
        return NextResponse.json(
          { order: mapPurchaseOrderRow(issuedOrder) },
          { status: 201 },
        );
      }

      return NextResponse.json({ order: mapPurchaseOrderRow(order) }, { status: 201 });
    } catch (err: unknown) {
      if (err instanceof PoError) return poErrorResponse(err);
      log.error("create purchase order failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
      });
      return apiErrorResponse(err, "procurement-orders-create");
    }
  },
  { schema: createPoFromRequestSchema },
);
