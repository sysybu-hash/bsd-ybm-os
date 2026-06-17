import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonConflict, jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { mapPurchaseOrderRow } from "@/lib/procurement/map-purchase-order";
import { ReceivePoError, UpdatePoStatusError } from "@/lib/procurement/receive-errors";
import { receivePoLines } from "@/lib/procurement/receive-po-lines";
import { updatePoStatus } from "@/lib/procurement/update-po-status";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  receivePoSchema,
  updatePoStatusSchema,
} from "@/lib/validation/schemas/procurement";

export const dynamic = "force-dynamic";

const log = createLogger("procurement-order-id");

function receiveErrorResponse(err: ReceivePoError) {
  switch (err.code) {
    case "ORDER_NOT_FOUND":
      return jsonNotFound("ההזמנה לא נמצאה");
    case "INVALID_ORDER_STATUS":
      return jsonConflict("לא ניתן לקלוט סחורה להזמנה בסטטוס זה");
    case "LINE_NOT_FOUND":
      return jsonNotFound("שורת ההזמנה לא נמצאה");
    case "OVER_RECEIVE":
      return jsonConflict("כמות הקליטה חורגת מההזמנה");
    case "INVENTORY_NOT_FOUND":
      return jsonNotFound("פריט המלאי לא נמצא");
    default:
      return jsonNotFound("לא נמצא");
  }
}

function statusErrorResponse(err: UpdatePoStatusError) {
  switch (err.code) {
    case "ORDER_NOT_FOUND":
      return jsonNotFound("ההזמנה לא נמצאה");
    case "INVALID_TRANSITION":
      return jsonConflict("מעבר סטטוס לא חוקי");
    default:
      return jsonNotFound("לא נמצא");
  }
}

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof updatePoStatusSchema>(
  async (req, { orgId }, segment, data) => {
    const limited = await applyRateLimit(req, "procurement:orders:status", 20, 60_000);
    if (limited) return limited;

    const { id } = await segment.params;

    try {
      const order = await updatePoStatus(orgId, id, data.status);
      return NextResponse.json({ order: mapPurchaseOrderRow(order) });
    } catch (err: unknown) {
      if (err instanceof UpdatePoStatusError) return statusErrorResponse(err);
      log.error("update purchase order status failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
        orderId: id,
      });
      return apiErrorResponse(err, "procurement-order-status");
    }
  },
  { schema: updatePoStatusSchema },
);

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof receivePoSchema>(
  async (req, { orgId }, segment, data) => {
    const limited = await applyRateLimit(req, "procurement:orders:receive", 15, 60_000);
    if (limited) return limited;

    const { id } = await segment.params;

    try {
      const order = await receivePoLines({
        orgId,
        orderId: id,
        lines: data.lines,
      });
      return NextResponse.json({ order: mapPurchaseOrderRow(order) });
    } catch (err: unknown) {
      if (err instanceof ReceivePoError) return receiveErrorResponse(err);
      log.error("receive purchase order failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
        orderId: id,
      });
      return apiErrorResponse(err, "procurement-order-receive");
    }
  },
  { schema: receivePoSchema },
);
