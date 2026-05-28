import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { flushAllEmailDigests } from "@/lib/email-digest";

export async function GET(req: NextRequest) {
  return withCronGuard(
    req,
    "cron-email-digest",
    { type: "crontab", value: "0 9 * * *" },
    async () => await flushAllEmailDigests(),
  );
}
