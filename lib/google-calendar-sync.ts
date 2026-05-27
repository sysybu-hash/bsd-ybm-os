import type { GoogleCalendarSyncMode, Task } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  canReadFromGoogleCalendar,
  canWriteToGoogleCalendar,
  isCalendarSyncEligible,
  loadCalendarEligibilityContext,
} from "@/lib/google-calendar-eligibility";
import { GOOGLE_CALENDAR_CONSENT_VERSION } from "@/lib/google-calendar-config";
import {
  GoogleCalendarService,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
  type CalendarEventView,
} from "@/lib/services/google-calendar";
import type { ActivateCalendarSyncInput } from "@/lib/google-calendar-eligibility";

const log = createLogger("google-calendar-sync");

function parseEventTimes(startRaw: string, endRaw: string): { startAt: Date; endAt: Date; allDay: boolean } {
  const allDay = !startRaw.includes("T");
  const startAt = new Date(startRaw);
  const endAt = endRaw ? new Date(endRaw) : new Date(startAt.getTime() + (allDay ? 86_400_000 : 3_600_000));
  return { startAt, endAt, allDay };
}

function taskEventWindow(task: Pick<Task, "title" | "dueDate" | "endDate" | "startDate">): {
  summary: string;
  start: string;
  end: string;
} | null {
  const anchor = task.dueDate ?? task.endDate ?? task.startDate;
  if (!anchor) return null;
  const start = anchor;
  const end = task.endDate && task.endDate > anchor ? task.endDate : new Date(anchor.getTime() + 60 * 60 * 1000);
  return {
    summary: task.title,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function upsertUserCalendarSettingsRow(userId: string, organizationId: string) {
  return prisma.userGoogleCalendarSettings.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId },
    update: {},
  });
}

export async function activateCalendarSync(
  userId: string,
  organizationId: string,
  input: ActivateCalendarSyncInput,
) {
  if (!input.consent) {
    throw new Error("נדרש אישור מפורש לפני הפעלת סנכרון יומן");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { calendarGoogleEnabled: true, subscriptionStatus: true },
  });
  if (!org?.calendarGoogleEnabled) {
    throw new Error("יומן Google כבוי בהגדרות הארגון");
  }
  if (org.subscriptionStatus !== "ACTIVE") {
    throw new Error("נדרש מנוי פעיל כדי להפעיל סנכרון יומן");
  }

  const calendarId = input.calendarId.trim();
  if (!calendarId) throw new Error("נדרש לבחור יומן");

  return prisma.userGoogleCalendarSettings.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: {
      userId,
      organizationId,
      syncMode: input.syncMode,
      enabled: true,
      consentAt: new Date(),
      consentVersion: GOOGLE_CALENDAR_CONSENT_VERSION,
      calendarId,
      calendarSummary: input.calendarSummary?.trim() || null,
      calendarColor: input.calendarColor?.trim() || null,
      pushEnabled: input.pushEnabled ?? false,
      reminderMinutesBefore: input.reminderMinutesBefore ?? 15,
    },
    update: {
      syncMode: input.syncMode,
      enabled: true,
      consentAt: new Date(),
      consentVersion: GOOGLE_CALENDAR_CONSENT_VERSION,
      calendarId,
      calendarSummary: input.calendarSummary?.trim() || null,
      calendarColor: input.calendarColor?.trim() || null,
      pushEnabled: input.pushEnabled ?? false,
      reminderMinutesBefore: input.reminderMinutesBefore ?? 15,
      lastSyncError: null,
    },
  });
}

export async function pauseCalendarSync(userId: string, organizationId: string) {
  return prisma.userGoogleCalendarSettings.updateMany({
    where: { userId, organizationId },
    data: { enabled: false, syncMode: "OFF" },
  });
}

async function applyInboundEvent(
  userId: string,
  organizationId: string,
  calendarId: string,
  ev: CalendarEventView,
  syncMode: GoogleCalendarSyncMode,
) {
  if (!ev.id) return;
  if (ev.status === "cancelled") {
    await prisma.googleCalendarEventLink.deleteMany({
      where: { userId, googleCalendarId: calendarId, googleEventId: ev.id },
    });
    return;
  }

  const { startAt, endAt, allDay } = parseEventTimes(ev.start, ev.end);
  const existingLink = await prisma.googleCalendarEventLink.findUnique({
    where: {
      userId_googleCalendarId_googleEventId: {
        userId,
        googleCalendarId: calendarId,
        googleEventId: ev.id,
      },
    },
  });

  const taskIdFromProps = existingLink?.taskId ?? null;

  let entityType = existingLink?.entityType ?? "STANDALONE";
  let taskId = taskIdFromProps;

  if (syncMode === "BIDIRECTIONAL" && taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId },
    });
    if (task && (!existingLink || existingLink.lastSyncedFrom !== "LOCAL")) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          title: ev.summary,
          dueDate: startAt,
          endDate: endAt,
        },
      });
    }
  }

  await prisma.googleCalendarEventLink.upsert({
    where: {
      userId_googleCalendarId_googleEventId: {
        userId,
        googleCalendarId: calendarId,
        googleEventId: ev.id,
      },
    },
    create: {
      userId,
      organizationId,
      googleCalendarId: calendarId,
      googleEventId: ev.id,
      googleEtag: ev.etag ?? null,
      entityType,
      taskId,
      summary: ev.summary,
      startAt,
      endAt,
      allDay,
      htmlLink: ev.htmlLink ?? null,
      lastSyncedFrom: "GOOGLE",
    },
    update: {
      googleEtag: ev.etag ?? null,
      summary: ev.summary,
      startAt,
      endAt,
      allDay,
      htmlLink: ev.htmlLink ?? null,
      lastSyncedFrom: "GOOGLE",
      pushNotifiedAt: null,
    },
  });
}

async function syncOutboundTasks(
  userId: string,
  organizationId: string,
  calendarId: string,
  cal: GoogleCalendarService,
) {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId,
      OR: [{ dueDate: { not: null } }, { endDate: { not: null } }, { startDate: { not: null } }],
    },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  for (const task of tasks) {
    const window = taskEventWindow(task);
    if (!window) continue;

    const existing = await prisma.googleCalendarEventLink.findFirst({
      where: { userId, organizationId, taskId: task.id, entityType: "TASK" },
    });

    try {
      if (existing) {
        await cal.patchEvent(calendarId, existing.googleEventId, window, {
          orgId: organizationId,
          taskId: task.id,
          linkId: existing.id,
        });
        const { startAt, endAt } = parseEventTimes(window.start, window.end);
        await prisma.googleCalendarEventLink.update({
          where: { id: existing.id },
          data: {
            summary: window.summary,
            startAt,
            endAt,
            lastSyncedFrom: "LOCAL",
            pushNotifiedAt: null,
          },
        });
      } else {
        const created = await cal.createEvent(window, calendarId, {
          orgId: organizationId,
          taskId: task.id,
        });
        if (!created.id) continue;
        const { startAt, endAt } = parseEventTimes(window.start, window.end);
        await prisma.googleCalendarEventLink.create({
          data: {
            userId,
            organizationId,
            googleCalendarId: calendarId,
            googleEventId: created.id,
            googleEtag: created.etag ?? null,
            entityType: "TASK",
            taskId: task.id,
            summary: window.summary,
            startAt,
            endAt,
            allDay: false,
            htmlLink: created.htmlLink ?? null,
            lastSyncedFrom: "LOCAL",
          },
        });
      }
    } catch (err: unknown) {
      log.warn("outbound task sync failed", {
        taskId: task.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function runGoogleCalendarSyncForUser(
  userId: string,
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await loadCalendarEligibilityContext(userId, organizationId);
  if (!ctx.org || !ctx.settings || !ctx.eligible) {
    return { ok: false, error: "סנכרון לא פעיל" };
  }

  const calendarId = ctx.settings.calendarId!;
  const syncMode = ctx.settings.syncMode;

  try {
    const cal = await GoogleCalendarService.forUser(userId);

    if (canReadFromGoogleCalendar(ctx.settings)) {
      const { events, nextSyncToken } = await cal.listEventsIncremental(
        calendarId,
        ctx.settings.syncToken,
      );
      for (const ev of events) {
        await applyInboundEvent(userId, organizationId, calendarId, ev, syncMode);
      }
      if (nextSyncToken) {
        await prisma.userGoogleCalendarSettings.update({
          where: { userId_organizationId: { userId, organizationId } },
          data: { syncToken: nextSyncToken },
        });
      }
    }

    if (canWriteToGoogleCalendar(ctx.settings)) {
      await syncOutboundTasks(userId, organizationId, calendarId, cal);
    }

    await prisma.userGoogleCalendarSettings.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });

    return { ok: true };
  } catch (err: unknown) {
    const message =
      err instanceof GoogleOAuthNotLinkedError || err instanceof GoogleOAuthRefreshError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    await prisma.userGoogleCalendarSettings.updateMany({
      where: { userId, organizationId },
      data: { lastSyncError: message },
    });
    log.error("sync failed", { userId, organizationId, message });
    return { ok: false, error: message };
  }
}

export async function runGoogleCalendarSyncCron(): Promise<{ processed: number; errors: number }> {
  const rows = await prisma.userGoogleCalendarSettings.findMany({
    where: {
      enabled: true,
      syncMode: { not: "OFF" },
      consentAt: { not: null },
      calendarId: { not: null },
    },
    include: {
      organization: {
        select: { calendarGoogleEnabled: true, subscriptionStatus: true },
      },
    },
    take: 50,
    orderBy: { lastSyncAt: "asc" },
  });

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    const scope = await import("@/lib/google-calendar-eligibility").then((m) =>
      m.getGoogleAccountScopeForUser(row.userId),
    );
    if (!isCalendarSyncEligible(row, row.organization, scope)) continue;

    const result = await runGoogleCalendarSyncForUser(row.userId, row.organizationId);
    processed++;
    if (!result.ok) errors++;
  }

  return { processed, errors };
}

export async function syncTaskToGoogleCalendarIfEligible(
  userId: string,
  organizationId: string,
  task: Task,
): Promise<void> {
  const ctx = await loadCalendarEligibilityContext(userId, organizationId);
  if (!ctx.canWrite || !ctx.settings?.calendarId) return;

  const cal = await GoogleCalendarService.forUser(userId);
  const calendarId = ctx.settings.calendarId;
  const window = taskEventWindow(task);

  const existing = await prisma.googleCalendarEventLink.findFirst({
    where: { userId, organizationId, taskId: task.id, entityType: "TASK" },
  });

  if (!window) {
    if (existing) {
      try {
        await cal.deleteEvent(calendarId, existing.googleEventId);
      } catch {
        /* event may already be gone */
      }
      await prisma.googleCalendarEventLink.delete({ where: { id: existing.id } });
    }
    return;
  }

  if (existing) {
    await cal.patchEvent(calendarId, existing.googleEventId, window, {
      orgId: organizationId,
      taskId: task.id,
      linkId: existing.id,
    });
    const { startAt, endAt } = parseEventTimes(window.start, window.end);
    await prisma.googleCalendarEventLink.update({
      where: { id: existing.id },
      data: { summary: window.summary, startAt, endAt, lastSyncedFrom: "LOCAL", pushNotifiedAt: null },
    });
    return;
  }

  const created = await cal.createEvent(window, calendarId, {
    orgId: organizationId,
    taskId: task.id,
  });
  if (!created.id) return;
  const { startAt, endAt } = parseEventTimes(window.start, window.end);
  await prisma.googleCalendarEventLink.create({
    data: {
      userId,
      organizationId,
      googleCalendarId: calendarId,
      googleEventId: created.id,
      googleEtag: created.etag ?? null,
      entityType: "TASK",
      taskId: task.id,
      summary: window.summary,
      startAt,
      endAt,
      allDay: false,
      htmlLink: created.htmlLink ?? null,
      lastSyncedFrom: "LOCAL",
    },
  });
}
