import type { NextRequest } from "next/server";
import { runCashflowGuardian } from "@/lib/cashflow-guardian";
import { withCronGuard } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-cashflow-guardian",
    { type: "crontab", value: "0 8 * * *" },
    async () => {
      const result = await runCashflowGuardian();
      return result;
    },
  );
}
