import type { GoogleCalendarSyncMode, Task } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { loadCalendarEligibilityContext } from "@/lib/google-calendar-eligibility";
import {
  GoogleCalendarService,
  type CalendarEventView,
} from "@/lib/services/google-calendar";

const log = createLogger("google-calendar-sync");

export function parseEventTimes(startRaw: string, endRaw: string): { startAt: Date; endAt: Date; allDay: boolean } {
  const allDay = !startRaw.includes("T");
  const startAt = new Date(startRaw);
  const endAt = endRaw ? new Date(endRaw) : new Date(startAt.getTime() + (allDay ? 86_400_000 : 3_600_000));
  return { startAt, endAt, allDay };
}

export function taskEventWindow(task: Pick<Task, "title" | "dueDate" | "endDate" | "startDate">): {
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

export async function applyInboundEvent(
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

export async function syncOutboundTasks(
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

export { log };

