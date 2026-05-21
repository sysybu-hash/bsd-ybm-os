import type { NextRequest } from "next/server";
import { runCollectionRemindersCron } from "@/lib/collection/run-collection-cron";
import { withCronGuard } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-collection-reminders", { type: "crontab", value: "0 8 * * 0" }, async () => {
    return await runCollectionRemindersCron();
  });
}
