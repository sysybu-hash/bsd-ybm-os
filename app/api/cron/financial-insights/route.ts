import type { NextRequest } from "next/server";
import { runDailyInsightsForAllOrganizations } from "@/lib/financial-insights";
import { withCronGuard } from "@/lib/cron-guard";
import { maybeFanOutOrgCron } from "@/lib/qstash-fanout";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-financial-insights", { type: "crontab", value: "0 6 * * *" }, async () => {
    const orgId = req.nextUrl.searchParams.get("orgId")?.trim() || undefined;
    const cursor = req.nextUrl.searchParams.get("cursor")?.trim() || undefined;
    const fanout = await maybeFanOutOrgCron({
      path: "/api/cron/financial-insights",
      orgId,
      cursor,
    });
    if (fanout) return { ran: true, ...fanout };
    const result = await runDailyInsightsForAllOrganizations({ orgId, cursor });
    return { ran: true, ...result };
  });
}
