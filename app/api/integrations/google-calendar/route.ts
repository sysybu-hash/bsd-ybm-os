import { randomUUID } from "crypto";
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
  allDay: z.boolean().optional(),
  /** event | meeting | task — purely cosmetic prefix for the standalone entry */
  kind: z.enum(["event", "meeting", "task"]).optional(),
});

const LOCAL_CALENDAR_ID = "local";
const KIND_PREFIX: Record<string, string> = { meeting: "👥 ", task: "✅ ", event: "" };

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

const SYNC_ON_GET_TIMEOUT_MS = 8_000;

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
    // Google Calendar not connected — show local tasks/projects as calendar events
    const range = parseEventRange(req);
    const localEvents = await buildLocalCalendarEvents(userId, orgId, range.from, range.to);
    return NextResponse.json({
      connected: false,
      active: true,       // ← always show the calendar UI
      localOnly: true,    // ← hint to UI: show "connect Google" banner
      suggested: Boolean(org?.calendarGoogleEnabled && ctx.org && ctx.org.subscriptionStatus === "ACTIVE"),
      connectUrl: buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard"),
      syncRoutes: {
        settings: "/api/integrations/google-calendar/settings",
        sync: "/api/integrations/google-calendar/sync",
        calendars: "/api/integrations/google-calendar/calendars",
        activate: "/api/integrations/google-calendar/settings/activate",
      },
      calendarSummary: "יומן מקומי",
      canWrite: true, // local calendar supports creating standalone events
      events: localEvents,
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
    const syncResult = await Promise.race([
      runGoogleCalendarSyncForUser(userId, orgId),
      new Promise<{ ok: false; error: string }>((resolve) => {
        setTimeout(() => resolve({ ok: false, error: "sync_timeout" }), SYNC_ON_GET_TIMEOUT_MS);
      }),
    ]);
    if (syncResult.ok) {
      links = await prisma.googleCalendarEventLink.findMany({
        where: eventWhere,
        orderBy: { startAt: "asc" },
        take: 200,
      });
    } else if (syncResult.error !== "sync_timeout") {
      return NextResponse.json({
        connected: true,
        active: true,
        calendarId: settings.calendarId,
        calendarSummary: settings.calendarSummary,
        calendarColor: settings.calendarColor,
        canWrite: canWriteToGoogleCalendar(settings),
        events: [],
        message: syncResult.error,
      });
    } else {
      void runGoogleCalendarSyncForUser(userId, orgId).catch(() => undefined);
    }
  }

  return NextResponse.json({
    connected: true,
    active: true,
    calendarId: settings.calendarId,
    calendarSummary: settings.calendarSummary,
    calendarColor: settings.calendarColor,
    canWrite: canWriteToGoogleCalendar(settings),
    events: mapEvents(links),
    syncPending: links.length === 0,
  });
});

export const POST = withWorkspacesAuth(async (req, { userId, orgId }, data) => {
  const limited = await applyRateLimit(req as NextRequest, "google:calendar-events-post", 20, 60_000);
  if (limited) return limited;

  const { summary: rawSummary, description, start, end, allDay, kind } =
    data as z.infer<typeof createEventSchema>;
  const summary = `${KIND_PREFIX[kind ?? "event"] ?? ""}${rawSummary}`;

  const ctx = await loadCalendarEligibilityContext(userId, orgId);

  // ── Standalone local calendar (no Google connection) ──────────────────────
  // The calendar works on its own: store the event locally. If Google is later
  // connected, a future sync can push these up.
  if (!canWriteToGoogleCalendar(ctx.settings)) {
    const startAt = new Date(start);
    const endAt = new Date(end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      return jsonBadRequest("טווח תאריכים לא תקין", "invalid_range");
    }
    const localEventId = `local-${randomUUID()}`;
    const row = await prisma.googleCalendarEventLink.create({
      data: {
        userId,
        organizationId: orgId,
        googleCalendarId: LOCAL_CALENDAR_ID,
        googleEventId: localEventId,
        entityType: "STANDALONE",
        summary,
        startAt,
        endAt,
        allDay: Boolean(allDay),
        lastSyncedFrom: "LOCAL",
      },
    });
    return NextResponse.json({ ok: true, local: true, event: { id: row.id, summary } });
  }

  const calendarId = ctx.settings?.calendarId;
  if (!calendarId) {
    return jsonBadRequest("לא נבחר יומן", "no_calendar");
  }

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

// ── Local calendar events (tasks + projects) shown when Google not connected ──

async function buildLocalCalendarEvents(
  userId: string,
  orgId: string,
  from: Date,
  to: Date,
) {
  type LocalEvent = {
    id: string;
    summary: string;
    start: string;
    end: string;
    allDay: boolean;
    entityType: string;
    htmlLink: null;
    googleEventId: null;
    taskId: string | null;
    local: true;
  };

  const events: LocalEvent[] = [];

  // 0. Standalone local events the user created directly in the calendar.
  const localRows = await prisma.googleCalendarEventLink.findMany({
    where: {
      userId,
      organizationId: orgId,
      googleCalendarId: LOCAL_CALENDAR_ID,
      startAt: { lte: to },
      endAt: { gte: from },
    },
    select: { id: true, summary: true, startAt: true, endAt: true, allDay: true },
    take: 200,
    orderBy: { startAt: "asc" },
  }).catch(() => []);

  for (const r of localRows) {
    events.push({
      id: r.id,
      summary: r.summary,
      start: r.startAt.toISOString(),
      end: r.endAt.toISOString(),
      allDay: r.allDay,
      entityType: "STANDALONE",
      htmlLink: null,
      googleEventId: null,
      taskId: null,
      local: true,
    });
  }

  // 1. Tasks with dueDate or startDate in range
  const tasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      status: { notIn: ["DONE", "ARCHIVED"] },
      OR: [
        { dueDate: { gte: from, lte: to } },
        { startDate: { gte: from, lte: to } },
      ],
    },
    select: { id: true, title: true, dueDate: true, startDate: true, status: true },
    take: 100,
    orderBy: { dueDate: "asc" },
  }).catch(() => []);

  for (const t of tasks) {
    const date = t.dueDate ?? t.startDate;
    if (!date) continue;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    events.push({
      id: `task-${t.id}`,
      summary: t.title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: true,
      entityType: "task",
      htmlLink: null,
      googleEventId: null,
      taskId: t.id,
      local: true,
    });
  }

  // 2. Projects with activeFrom/activeTo in range
  const projects = await prisma.project.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      OR: [
        { activeFrom: { gte: from, lte: to } },
        { activeTo: { gte: from, lte: to } },
      ],
    },
    select: { id: true, name: true, activeFrom: true, activeTo: true },
    take: 50,
    orderBy: { activeFrom: "asc" },
  }).catch(() => []);

  for (const p of projects) {
    const date = p.activeFrom ?? p.activeTo;
    if (!date) continue;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    events.push({
      id: `project-${p.id}`,
      summary: `📁 ${p.name}`,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: true,
      entityType: "project",
      htmlLink: null,
      googleEventId: null,
      taskId: null,
      local: true,
    });
  }

  // Sort by date
  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return events;
}
