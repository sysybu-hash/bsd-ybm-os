import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonNotFound, jsonTooManyRequests } from "@/lib/api-json";
import {
  mapProgressBillPortalRow,
  transitionProgressBill,
} from "@/lib/progress-bills/progress-bill-portal";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateProgressBillSchema } from "@/lib/validation/schemas/progress-bill-portal";

export const dynamic = "force-dynamic";

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof updateProgressBillSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    if (!userId) return jsonBadRequest("משתמש לא מזוהה");

    const rate = await checkRateLimit(`rl:progress-bills:update:user:${userId}`, 30, 60_000);
    if (!rate.success) {
      return jsonTooManyRequests("יותר מדי בקשות. נסה שוב בעוד כמה דקות.", "rate_limited", {
        resetAt: rate.resetAt,
      });
    }

    const { id } = await segment.params;

    try {
      const result = await transitionProgressBill({
        billId: id,
        organizationId: orgId,
        action: body.action,
        userId,
      });

      if (!result) return jsonNotFound("חשבון חלקי לא נמצא");
      if ("error" in result) {
        return jsonBadRequest("מעבר סטטוס לא חוקי");
      }

      return NextResponse.json({ bill: mapProgressBillPortalRow(result) });
    } catch (error) {
      return apiErrorResponse(error, "Progress bill PATCH");
    }
  },
  { schema: updateProgressBillSchema },
);
