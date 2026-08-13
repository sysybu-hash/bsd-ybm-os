import { type NextRequest, NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { describeGoogleCalendarListError } from "@/lib/google-calendar-api-errors";
import { accountHasCalendarScope, buildGoogleCalendarConnectUrl } from "@/lib/google-calendar-oauth";
import { getGoogleAccountScopeForUser } from "@/lib/google-calendar-eligibility";
import {
  GoogleCalendarService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-calendar";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("google-calendar-list");

const WIZARD_CALLBACK = "/?w=settings&calendar=wizard";

function notConnectedResponse(error?: string, code?: string) {
  return NextResponse.json({
    connected: false,
    connectUrl: buildGoogleCalendarConnectUrl(WIZARD_CALLBACK),
    calendars: [],
    ...(error ? { error, code } : {}),
  });
}

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { userId }) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-list", 30, 60_000);
  if (limited) return limited;

  const scope = await getGoogleAccountScopeForUser(userId);
  if (!accountHasCalendarScope(scope)) {
    return notConnectedResponse();
  }

  try {
    const cal = await GoogleCalendarService.forUser(userId);
    const calendars = await cal.listCalendars();
    return NextResponse.json({ connected: true, calendars });
  } catch (e) {
    if (e instanceof GoogleOAuthNotLinkedError) {
      return notConnectedResponse();
    }
    if (e instanceof GoogleOAuthRefreshError) {
      return notConnectedResponse(e.message, "google_refresh_failed");
    }
    const info = describeGoogleCalendarListError(e);
    log.warn("calendar list failed", { code: info.code });
    return notConnectedResponse(info.message, info.code);
  }
});
