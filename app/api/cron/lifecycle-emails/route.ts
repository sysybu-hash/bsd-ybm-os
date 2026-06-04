import type { NextRequest } from "next/server";
import { runLifecycleCampaigns } from "@/lib/lifecycle-emails";
import { withCronGuard } from "@/lib/cron-guard";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-lifecycle-emails",
    { type: "crontab", value: "0 10 * * *" },
    async () => {
      const result = await runLifecycleCampaigns();
      return result;
    },
  );
}
