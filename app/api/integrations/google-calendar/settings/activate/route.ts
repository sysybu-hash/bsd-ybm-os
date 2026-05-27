import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { accountHasCalendarScope } from "@/lib/google-calendar-oauth";
import { activateCalendarSync, runGoogleCalendarSyncForUser } from "@/lib/google-calendar-sync";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const activateSchema = z.object({
  consent: z.literal(true),
  syncMode: z.enum(["READ_ONLY", "BIDIRECTIONAL"]),
  calendarId: z.string().trim().min(1),
  calendarSummary: z.string().trim().optional(),
  calendarColor: z.string().trim().optional(),
  pushEnabled: z.boolean().optional(),
  reminderMinutesBefore: z.number().int().min(5).max(120).optional(),
});

export const PUT = withWorkspacesAuth(async (req, { userId, orgId }, body) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-activate", 10, 60_000);
  if (limited) return limited;

  const data = body as z.infer<typeof activateSchema>;

  const scope = await import("@/lib/google-calendar-eligibility").then((m) =>
    m.getGoogleAccountScopeForUser(userId),
  );
  if (!accountHasCalendarScope(scope)) {
    return jsonBadRequest("חברו Google Calendar תחילה", "calendar_not_connected");
  }

  try {
    const settings = await activateCalendarSync(userId, orgId, {
      consent: true,
      syncMode: data.syncMode,
      calendarId: data.calendarId,
      calendarSummary: data.calendarSummary,
      calendarColor: data.calendarColor,
      pushEnabled: data.pushEnabled,
      reminderMinutesBefore: data.reminderMinutesBefore,
    });

    const sync = await runGoogleCalendarSyncForUser(userId, orgId);

    return NextResponse.json({
      ok: true,
      settings: {
        syncMode: settings.syncMode,
        enabled: settings.enabled,
        consentAt: settings.consentAt?.toISOString() ?? null,
        calendarId: settings.calendarId,
      },
      initialSync: sync,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonBadRequest(message, "activate_failed");
  }
}, { schema: activateSchema });
