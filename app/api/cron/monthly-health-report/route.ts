import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runMonthlyHealthReports } from "@/lib/reports/monthly-health";
import { maybeFanOutOrgCron } from "@/lib/qstash-fanout";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-monthly-health-report",
    { type: "crontab", value: "0 8 1 * *" },
    async () => {
      const orgId = req.nextUrl.searchParams.get("orgId")?.trim() || undefined;
      const cursor = req.nextUrl.searchParams.get("cursor")?.trim() || undefined;
      const fanout = await maybeFanOutOrgCron({
        path: "/api/cron/monthly-health-report",
        orgId,
        cursor,
      });
      if (fanout) return fanout;
      return runMonthlyHealthReports({ orgId, cursor });
    },
  );
}
