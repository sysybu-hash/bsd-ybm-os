import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { flushAllEmailDigests } from "@/lib/email-digest";
import { runLifecycleCampaigns } from "@/lib/lifecycle-emails";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-email-digest",
    { type: "crontab", value: "0 9 * * *" },
    async () => {
      const digest = await flushAllEmailDigests();
      const lifecycle = await runLifecycleCampaigns();
      return { digest, lifecycle };
    },
  );
}
