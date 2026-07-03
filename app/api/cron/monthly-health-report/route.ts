import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runMonthlyHealthReports } from "@/lib/reports/monthly-health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-monthly-health-report",
    { type: "crontab", value: "0 8 1 * *" },
    async () => {
      return runMonthlyHealthReports();
    },
  );
}
