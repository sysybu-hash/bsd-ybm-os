import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runMeckanoScheduledSyncForAllOrganizations } from "@/lib/meckano-scheduled-sync";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-meckano-sync", { type: "crontab", value: "0 5 * * *" }, async () => {
    const result = await runMeckanoScheduledSyncForAllOrganizations();
    return { ran: true, ...result };
  });
}
