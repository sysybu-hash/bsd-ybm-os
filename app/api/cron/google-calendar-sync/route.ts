import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runGoogleCalendarSyncCron } from "@/lib/google-calendar-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-google-calendar-sync",
    { type: "crontab", value: "*/15 * * * *" },
    async () => {
      const result = await runGoogleCalendarSyncCron();
      return { ok: true, ...result };
    },
  );
}
