import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { loadCalendarEligibilityContext } from "@/lib/google-calendar-eligibility";
import { GoogleCalendarService } from "@/lib/services/google-calendar";

const log = createLogger("gantt-calendar");

/** השדות הדרושים לדחיפת משימת גאנט כאירוע יום-שלם */
export type GanttCalendarTask = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

/**
 * מוחק את אירועי Google Calendar המקושרים למשימות שעומדות להימחק (best-effort).
 *
 * נדרש כי GoogleCalendarEventLink.taskId הוא onDelete: SetNull — מחיקת המשימה
 * לבדה תשאיר אירוע יתום ב-Google. לכן מנקים אירועים + לינקים *לפני* מחיקת המשימות.
 * כשלים מול Google אינם חוסמים (האירוע אולי כבר נמחק / החיבור נותק).
 */
export async function deleteTaskCalendarEvents(
  userId: string,
  organizationId: string,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;

  const links = await prisma.googleCalendarEventLink.findMany({
    where: { organizationId, taskId: { in: taskIds } },
    select: { id: true, googleCalendarId: true, googleEventId: true },
  });
  if (links.length === 0) return;

  let cal: GoogleCalendarService | null = null;
  try {
    cal = await GoogleCalendarService.forUser(userId);
  } catch {
    cal = null; // לא מחובר — עדיין ננקה את רשומות הלינק המקומיות
  }

  if (cal) {
    for (const link of links) {
      try {
        await cal.deleteEvent(link.googleCalendarId, link.googleEventId);
      } catch {
        /* אירוע כבר נמחק / אין הרשאה — לא חוסם */
      }
    }
  }

  await prisma.googleCalendarEventLink.deleteMany({
    where: { id: { in: links.map((l) => l.id) } },
  });
}

/**
 * דוחף משימות גאנט כאירועי יום-שלם ל-Google Calendar ושומר GoogleCalendarEventLink
 * עבור כל אירוע שנוצר. אם אין חיבור/הרשאת כתיבה — מחזיר { connected: false }.
 * כל דחיפה היא best-effort: כשל של משימה בודדת לא מפיל את השאר.
 */
export async function pushGanttTasksToCalendar(
  userId: string,
  organizationId: string,
  tasks: GanttCalendarTask[],
): Promise<{ connected: boolean; synced: number }> {
  const ctx = await loadCalendarEligibilityContext(userId, organizationId);
  if (!ctx.canWrite || !ctx.settings?.calendarId) {
    return { connected: false, synced: 0 };
  }
  const calendarId = ctx.settings.calendarId;

  let cal: GoogleCalendarService;
  try {
    cal = await GoogleCalendarService.forUser(userId);
  } catch (err: unknown) {
    log.warn("calendar client unavailable", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { connected: false, synced: 0 };
  }

  let synced = 0;
  for (const task of tasks) {
    if (!task.startDate || !task.endDate) continue;

    // אירוע יום-שלם: סיום בלעדי ב-Google Calendar → endDate + יום אחד
    const endExclusive = new Date(task.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);

    try {
      const created = await cal.createEvent(
        {
          summary: task.title,
          description: task.description ?? undefined,
          start: task.startDate.toISOString(),
          end: endExclusive.toISOString(),
          allDay: true,
        },
        calendarId,
        { orgId: organizationId, taskId: task.id },
      );
      if (!created.id) continue;

      await prisma.googleCalendarEventLink.create({
        data: {
          userId,
          organizationId,
          googleCalendarId: calendarId,
          googleEventId: created.id,
          googleEtag: created.etag ?? null,
          entityType: "TASK",
          taskId: task.id,
          summary: task.title,
          startAt: task.startDate,
          endAt: task.endDate,
          allDay: true,
          htmlLink: created.htmlLink ?? null,
          lastSyncedFrom: "LOCAL",
        },
      });
      synced++;
    } catch (err: unknown) {
      log.warn("failed to push gantt task to calendar", {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { connected: true, synced };
}
