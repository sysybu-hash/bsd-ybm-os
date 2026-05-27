import { type NextRequest, NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { loadCalendarEligibilityContext } from "@/lib/google-calendar-eligibility";
import { runGoogleCalendarSyncForUser } from "@/lib/google-calendar-sync";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-sync", 10, 60_000);
  if (limited) return limited;

  const ctx = await loadCalendarEligibilityContext(userId, orgId);
  if (!ctx.eligible) {
    return jsonBadRequest("סנכרון יומן לא פעיל", "sync_not_active");
  }

  const result = await runGoogleCalendarSyncForUser(userId, orgId);
  if (!result.ok) {
    return jsonBadRequest(result.error ?? "סנכרון נכשל", "sync_failed");
  }

  return NextResponse.json({ ok: true });
});
