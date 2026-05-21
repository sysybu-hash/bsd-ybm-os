import type { NextRequest } from "next/server";
import { runWorkDiaryDailyReminders } from "@/lib/push/work-diary-rules";
import { withCronGuard } from "@/lib/cron-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-work-diary-push", { type: "crontab", value: "0 16 * * *" }, async () => {
    return await runWorkDiaryDailyReminders();
  });
}
