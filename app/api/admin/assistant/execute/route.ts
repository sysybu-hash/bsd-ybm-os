import { NextResponse } from "next/server";
import { z } from "zod";
import { manageSubsUpdateSubscriptionAction } from "@/app/actions/manage-subscriptions";
import { withOSAdmin } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { consumePendingAction } from "@/lib/admin-assistant/pending-actions";
import { prisma } from "@/lib/prisma";
import { AccountStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  actionId: z.string().min(8),
  token: z.string().min(8),
});

const TITLE_MAX = 160;
const BODY_MAX = 4000;
const CHUNK = 400;

export const POST = withOSAdmin(async (req, { email: adminEmail }) => {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonBadRequest("גוף הבקשה לא תקין", "invalid_body");
    }

    const action = consumePendingAction(parsed.data.actionId, parsed.data.token, adminEmail);
    if (!action) {
      return jsonBadRequest("פעולה לא נמצאה או שפג תוקפה", "invalid_or_expired_action");
    }

    if (action.type === "subscription_update") {
      const form = new FormData();
      form.set("organizationId", action.organizationId);
      form.set("tier", action.tier);
      form.set("subscriptionStatus", action.subscriptionStatus);
      const result = await manageSubsUpdateSubscriptionAction(form);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, type: action.type });
    }

    if (action.type === "broadcast") {
      const title = action.title.trim();
      const body = action.body.trim();
      if (!title || !body) {
        return jsonBadRequest("חובה למלא כותרת ותוכן", "missing_title_or_body");
      }
      if (title.length > TITLE_MAX || body.length > BODY_MAX) {
        return jsonBadRequest("הטקסט ארוך מדי", "text_too_long");
      }

      const users = await prisma.user.findMany({
        where: { accountStatus: AccountStatus.ACTIVE },
        select: { id: true },
      });
      for (let i = 0; i < users.length; i += CHUNK) {
        const slice = users.slice(i, i + CHUNK);
        await prisma.inAppNotification.createMany({
          data: slice.map((u) => ({ userId: u.id, title, body })),
        });
      }
      return NextResponse.json({ ok: true, type: action.type, count: users.length });
    }

    return jsonBadRequest("סוג פעולה לא נתמך", "unsupported_action");
  } catch (error) {
    return apiErrorResponse(error, "admin/assistant/execute");
  }
});
