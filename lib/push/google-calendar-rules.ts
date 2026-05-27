import { createLogger } from "@/lib/logger";
import { isCalendarSyncEligible } from "@/lib/google-calendar-eligibility";
import { getGoogleAccountScopeForUser } from "@/lib/google-calendar-eligibility";
import { sendPushToUser } from "@/lib/push/send-notification";
import { prisma } from "@/lib/prisma";

const log = createLogger("google-calendar-push");

export async function runGoogleCalendarEventReminders(): Promise<{
  usersNotified: number;
  eventsNotified: number;
}> {
  const now = new Date();
  const settingsRows = await prisma.userGoogleCalendarSettings.findMany({
    where: {
      enabled: true,
      pushEnabled: true,
      consentAt: { not: null },
      syncMode: { not: "OFF" },
    },
    include: {
      organization: {
        select: { calendarGoogleEnabled: true, subscriptionStatus: true },
      },
    },
    take: 100,
  });

  let usersNotified = 0;
  let eventsNotified = 0;

  for (const settings of settingsRows) {
    const scope = await getGoogleAccountScopeForUser(settings.userId);
    if (!isCalendarSyncEligible(settings, settings.organization, scope)) continue;

    const windowEnd = new Date(now.getTime() + settings.reminderMinutesBefore * 60_000);
    const events = await prisma.googleCalendarEventLink.findMany({
      where: {
        userId: settings.userId,
        organizationId: settings.organizationId,
        pushNotifiedAt: null,
        startAt: { gt: now, lte: windowEnd },
      },
      take: 20,
    });

    if (events.length === 0) continue;

    let sentForUser = 0;
    for (const ev of events) {
      const minutes = Math.max(
        1,
        Math.round((ev.startAt.getTime() - now.getTime()) / 60_000),
      );
      const count = await sendPushToUser(settings.userId, {
        title: ev.summary,
        body: `מתחיל בעוד ${minutes} דקות`,
        url: "/?w=googleCalendar",
        tag: `cal-${ev.googleEventId}`,
      });
      if (count > 0) {
        await prisma.googleCalendarEventLink.update({
          where: { id: ev.id },
          data: { pushNotifiedAt: new Date() },
        });
        sentForUser++;
        eventsNotified++;
      }
    }

    if (sentForUser > 0) usersNotified++;
  }

  log.info("calendar push run", { usersNotified, eventsNotified });
  return { usersNotified, eventsNotified };
}
