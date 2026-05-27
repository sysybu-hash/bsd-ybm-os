import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { accountHasCalendarScope } from "@/lib/google-calendar-oauth";
import {
  isCalendarSyncEligible,
  isOrganizationSubscriptionActive,
  loadCalendarEligibilityContext,
} from "@/lib/google-calendar-eligibility";
import { buildGoogleCalendarConnectUrl } from "@/lib/google-calendar-oauth";
import { pauseCalendarSync, upsertUserCalendarSettingsRow } from "@/lib/google-calendar-sync";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-settings-get", 60, 60_000);
  if (limited) return limited;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { calendarGoogleEnabled: true, subscriptionStatus: true },
  });

  if (!org) {
    return NextResponse.json({ error: "ארגון לא נמצא" }, { status: 404 });
  }

  const ctx = await loadCalendarEligibilityContext(userId, orgId);
  const settings = ctx.settings ?? (await upsertUserCalendarSettingsRow(userId, orgId));
  const connected = accountHasCalendarScope(ctx.scope);
  const subscriptionActive = isOrganizationSubscriptionActive(org);
  const active = isCalendarSyncEligible(settings, org, ctx.scope);
  const suggested =
    org.calendarGoogleEnabled &&
    subscriptionActive &&
    !active;

  return NextResponse.json({
    suggested,
    orgCalendarEnabled: org.calendarGoogleEnabled,
    subscriptionActive,
    connected,
    active,
    connectUrl: buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard"),
    settings: {
      syncMode: settings.syncMode,
      enabled: settings.enabled,
      consentAt: settings.consentAt?.toISOString() ?? null,
      calendarId: settings.calendarId,
      calendarSummary: settings.calendarSummary,
      pushEnabled: settings.pushEnabled,
      reminderMinutesBefore: settings.reminderMinutesBefore,
      lastSyncAt: settings.lastSyncAt?.toISOString() ?? null,
      lastSyncError: settings.lastSyncError,
    },
  });
});

const updateSchema = z.object({
  calendarId: z.string().trim().min(1).optional(),
  calendarSummary: z.string().trim().optional(),
  pushEnabled: z.boolean().optional(),
  reminderMinutesBefore: z.number().int().min(5).max(120).optional(),
  pause: z.boolean().optional(),
});

export const PUT = withWorkspacesAuth(async (req, { userId, orgId }, body) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-settings-put", 30, 60_000);
  if (limited) return limited;

  const data = body as z.infer<typeof updateSchema>;

  if (data.pause) {
    await pauseCalendarSync(userId, orgId);
    return NextResponse.json({ ok: true, paused: true });
  }

  const existing = await prisma.userGoogleCalendarSettings.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!existing?.consentAt) {
    return jsonBadRequest("הפעילו סנכרון דרך מסך האישור תחילה", "consent_required");
  }

  const updated = await prisma.userGoogleCalendarSettings.update({
    where: { userId_organizationId: { userId, organizationId: orgId } },
    data: {
      calendarId: data.calendarId,
      calendarSummary: data.calendarSummary,
      pushEnabled: data.pushEnabled,
      reminderMinutesBefore: data.reminderMinutesBefore,
    },
  });

  return NextResponse.json({ ok: true, settings: updated });
}, { schema: updateSchema });
