import type { NextRequest } from "next/server";
import { runDailyInsightsForAllOrganizations } from "@/lib/financial-insights";
import { withCronGuard } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-financial-insights", { type: "crontab", value: "0 6 * * *" }, async () => {
    await runDailyInsightsForAllOrganizations();
    return { ran: true };
  });
}
