import { createLogger } from "@/lib/logger";
import { decodePlannerSummary, LOCAL_PLANNER_CALENDAR_ID } from "@/lib/planner/meta";
import { sendPushToUser } from "@/lib/push/send-notification";
import { prisma } from "@/lib/prisma";

const log = createLogger("planner-reminders");

/**
 * Push reminders for local planner items (meetings/tasks/reminders with reminderMinutes).
 * Complements Google calendar push; works without Google sync enabled.
 */
export async function runPlannerLocalReminders(): Promise<{
  usersNotified: number;
  eventsNotified: number;
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60_000);

  const candidates = await prisma.googleCalendarEventLink.findMany({
    where: {
      googleCalendarId: LOCAL_PLANNER_CALENDAR_ID,
      pushNotifiedAt: null,
      startAt: { gt: now, lte: windowEnd },
    },
    take: 200,
    orderBy: { startAt: "asc" },
  });

  let usersNotified = 0;
  let eventsNotified = 0;
  const notifiedUsers = new Set<string>();

  for (const ev of candidates) {
    const { title, kind, reminderMinutes } = decodePlannerSummary(ev.summary);
    const mins = reminderMinutes ?? (kind === "reminder" ? 15 : null);
    if (mins == null) continue;

    const fireAt = ev.startAt.getTime() - mins * 60_000;
    if (now.getTime() < fireAt) continue;

    const minutesUntil = Math.max(
      1,
      Math.round((ev.startAt.getTime() - now.getTime()) / 60_000),
    );

    const count = await sendPushToUser(ev.userId, {
      title: title || ev.summary,
      body: `מתחיל בעוד ${minutesUntil} דקות`,
      url: "/dashboard",
      tag: `planner-${ev.id}`,
    });

    if (count > 0) {
      await prisma.googleCalendarEventLink.update({
        where: { id: ev.id },
        data: { pushNotifiedAt: new Date() },
      });
      eventsNotified++;
      if (!notifiedUsers.has(ev.userId)) {
        notifiedUsers.add(ev.userId);
        usersNotified++;
      }
    }
  }

  log.info("planner local reminders", { usersNotified, eventsNotified });
  return { usersNotified, eventsNotified };
}
