import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonBadRequest, jsonConflict, jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { mapPurchaseOrderRow } from "@/lib/procurement/map-purchase-order";
import { issuePurchaseOrderDocument } from "@/lib/procurement/po-document";
import { PoDocumentError } from "@/lib/procurement/po-errors";
import { createLogger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { issuePoDocumentSchema } from "@/lib/validation/schemas/procurement";

export const dynamic = "force-dynamic";

const log = createLogger("procurement-orders-issue-document");

function poDocumentErrorResponse(err: PoDocumentError) {
  switch (err.code) {
    case "ORDER_NOT_FOUND":
      return jsonNotFound("ההזמנה לא נמצאה");
    case "ORDER_CANCELLED":
      return jsonConflict("לא ניתן להפיק מסמך להזמנה שבוטלה");
    case "NO_LINES":
      return jsonBadRequest("להזמנה אין שורות להפקה", "po_no_lines");
    case "ORG_NOT_FOUND":
      return jsonNotFound("ארגון לא נמצא");
  }
  return apiErrorResponse(err, "procurement-orders-issue-document");
}

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof issuePoDocumentSchema>(
  async (_req, { orgId, userId }, segment, data) => {
    const limited = await applyRateLimit(_req, "procurement:orders:issue-document", 20, 60_000);
    if (limited) return limited;

    const { id } = await segment.params;
    if (!id) return jsonNotFound("ההזמנה לא נמצאה");

    try {
      const { order, issuedDocumentId } = await issuePurchaseOrderDocument(
        orgId,
        userId,
        id,
        { markSent: data.markSent ?? false },
      );

      return NextResponse.json({
        order: mapPurchaseOrderRow(order),
        issuedDocumentId,
      });
    } catch (err: unknown) {
      if (err instanceof PoDocumentError) return poDocumentErrorResponse(err);
      log.error("issue PO document failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
        orderId: id,
      });
      return apiErrorResponse(err, "procurement-orders-issue-document");
    }
  },
  { schema: issuePoDocumentSchema },
);
