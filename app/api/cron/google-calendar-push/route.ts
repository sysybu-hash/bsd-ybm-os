import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runGoogleCalendarEventReminders } from "@/lib/push/google-calendar-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-google-calendar-push",
    { type: "crontab", value: "30 4 * * *" },
    async () => {
      const result = await runGoogleCalendarEventReminders();
      return { ok: true, ...result };
    },
  );
}
