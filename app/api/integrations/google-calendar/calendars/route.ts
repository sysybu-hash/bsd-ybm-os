import { type NextRequest, NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { accountHasCalendarScope } from "@/lib/google-calendar-oauth";
import { getGoogleAccountScopeForUser } from "@/lib/google-calendar-eligibility";
import {
  GoogleCalendarService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-calendar";
import { buildGoogleCalendarConnectUrl } from "@/lib/google-calendar-oauth";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { userId }) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-list", 30, 60_000);
  if (limited) return limited;

  const scope = await getGoogleAccountScopeForUser(userId);
  if (!accountHasCalendarScope(scope)) {
    return NextResponse.json({
      connected: false,
      connectUrl: buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard"),
      calendars: [],
    });
  }

  try {
    const cal = await GoogleCalendarService.forUser(userId);
    const calendars = await cal.listCalendars();
    return NextResponse.json({ connected: true, calendars });
  } catch (e) {
    if (e instanceof GoogleOAuthNotLinkedError) {
      return NextResponse.json({
        connected: false,
        connectUrl: buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard"),
        calendars: [],
      });
    }
    if (e instanceof GoogleOAuthRefreshError) {
      return jsonBadRequest(e.message, "google_refresh_failed");
    }
    throw e;
  }
});
