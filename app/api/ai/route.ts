import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { processDocumentAction } from "@/app/actions/process-document";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const UPLOADS_PER_MINUTE = 5;
const UPLOADS_PER_MINUTE_PLATFORM = 60;

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const dev = isAdmin(user?.email);
    const limit = dev ? UPLOADS_PER_MINUTE_PLATFORM : UPLOADS_PER_MINUTE;
    const rateKey = `ai:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, limit, 60 * 60 * 1000);

    if (!rl.success) {
      return jsonTooManyRequests(
        `חרגת ממכסת השימוש המותרת לשעה זו. נסה שוב לאחר ${rl.resetAt.toLocaleTimeString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt.toISOString() },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ", "missing_file");
    }

    const persist = formData.get("persist") !== "false";

    const result = await processDocumentAction(formData, userId, orgId, persist);

    if (!result.success) {
      const status = result.code === "QUOTA_EXCEEDED" ? 403 : 500;
      return NextResponse.json(
        {
          error: result.error ?? "אירעה שגיאה בפענוח המסמך",
          code: result.code,
          billingUrl: result.code === "QUOTA_EXCEEDED" ? "/app/settings/billing" : undefined,
        },
        { status },
      );
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    return apiErrorResponse(err, "API Route Error");
  }
});
