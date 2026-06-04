import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runGoogleCalendarSyncCron } from "@/lib/google-calendar-sync";
import { runGoogleCalendarEventReminders } from "@/lib/push/google-calendar-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-google-calendar-sync",
    { type: "crontab", value: "0 4 * * *" },
    async () => {
      const sync = await runGoogleCalendarSyncCron();
      const reminders = await runGoogleCalendarEventReminders();
      return { ok: true, sync, reminders };
    },
  );
}
