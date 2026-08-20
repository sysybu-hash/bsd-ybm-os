import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runGoogleCalendarEventReminders } from "@/lib/push/google-calendar-rules";
import { runPlannerLocalReminders } from "@/lib/planner/reminder-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-google-calendar-push",
    { type: "crontab", value: "30 4 * * *" },
    async () => {
      const result = await runGoogleCalendarEventReminders();
      const planner = await runPlannerLocalReminders();
      return { ok: true, ...result, planner };
    },
  );
}
