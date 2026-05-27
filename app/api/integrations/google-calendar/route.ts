import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { buildGoogleCalendarConnectUrl } from "@/lib/google-calendar-oauth";
import { canWriteToGoogleCalendar, loadCalendarEligibilityContext } from "@/lib/google-calendar-eligibility";
import {
  GoogleCalendarService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/services/google-calendar";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { runGoogleCalendarSyncForUser } from "@/lib/google-calendar-sync";

const createEventSchema = z.object({
  summary: z.string().trim().min(1),
  description: z.string().trim().optional(),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";

function parseEventRange(req: Request): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { from, to };
    }
  }
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 42);
  return { from, to };
}

export const GET = withWorkspacesAuth(async (req, { userId, orgId }) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-events-get", 60, 60_000);
  if (limited) return limited;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { calendarGoogleEnabled: true },
  });

  if (org?.calendarGoogleEnabled === false) {
    return NextResponse.json({
      connected: false,
      disabled: true,
      suggested: false,
      message: "יומן Google כבוי בהגדרות הארגון.",
      events: [],
    });
  }

  const ctx = await loadCalendarEligibilityContext(userId, orgId);

  if (!ctx.eligible) {
    return NextResponse.json({
      connected: ctx.scope ? true : false,
      active: false,
      suggested: Boolean(org?.calendarGoogleEnabled && ctx.org && ctx.org.subscriptionStatus === "ACTIVE"),
      connectUrl: buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard"),
      events: [],
    });
  }

  const settings = ctx.settings!;
  const range = parseEventRange(req);

  const eventWhere = {
    userId,
    organizationId: orgId,
    startAt: { lte: range.to },
    endAt: { gte: range.from },
  };

  const mapEvents = (
    rows: Awaited<ReturnType<typeof prisma.googleCalendarEventLink.findMany>>,
  ) =>
    rows.map((e) => ({
      id: e.id,
      googleEventId: e.googleEventId,
      summary: e.summary,
      start: e.startAt.toISOString(),
      end: e.endAt.toISOString(),
      allDay: e.allDay,
      htmlLink: e.htmlLink,
      entityType: e.entityType,
      taskId: e.taskId,
    }));

  let links = await prisma.googleCalendarEventLink.findMany({
    where: eventWhere,
    orderBy: { startAt: "asc" },
    take: 200,
  });

  if (links.length === 0) {
    await runGoogleCalendarSyncForUser(userId, orgId);
    links = await prisma.googleCalendarEventLink.findMany({
      where: eventWhere,
      orderBy: { startAt: "asc" },
      take: 200,
    });
  }

  return NextResponse.json({
    connected: true,
    active: true,
    calendarId: settings.calendarId,
    calendarSummary: settings.calendarSummary,
    calendarColor: settings.calendarColor,
    canWrite: canWriteToGoogleCalendar(settings),
    events: mapEvents(links),
  });
});

export const POST = withWorkspacesAuth(async (req, { userId, orgId }, data) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-events-post", 20, 60_000);
  if (limited) return limited;

  const ctx = await loadCalendarEligibilityContext(userId, orgId);
  if (!canWriteToGoogleCalendar(ctx.settings)) {
    return jsonBadRequest("יצירת אירועים דורשת סנכרון דו-כיווני פעיל", "bidirectional_required");
  }

  const calendarId = ctx.settings?.calendarId;
  if (!calendarId) {
    return jsonBadRequest("לא נבחר יומן", "no_calendar");
  }

  const { summary, description, start, end } = data as z.infer<typeof createEventSchema>;

  try {
    const cal = await GoogleCalendarService.forUser(userId);
    const created = await cal.createEvent(
      { summary, description, start, end },
      calendarId,
      { orgId },
    );
    if (created.id) {
      const startAt = new Date(start);
      const endAt = new Date(end);
      await prisma.googleCalendarEventLink.create({
        data: {
          userId,
          organizationId: orgId,
          googleCalendarId: calendarId,
          googleEventId: created.id,
          googleEtag: created.etag ?? null,
          entityType: "STANDALONE",
          summary,
          startAt,
          endAt,
          allDay: false,
          htmlLink: created.htmlLink ?? null,
          lastSyncedFrom: "LOCAL",
        },
      });
    }
    return NextResponse.json({ ok: true, event: created });
  } catch (e) {
    if (e instanceof GoogleOAuthNotLinkedError) {
      return jsonBadRequest(e.message, "google_not_linked");
    }
    if (e instanceof GoogleOAuthRefreshError) {
      return jsonBadRequest(e.message, "google_refresh_failed");
    }
    throw e;
  }
}, { schema: createEventSchema });
