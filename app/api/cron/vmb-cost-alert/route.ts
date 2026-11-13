import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { sendCostAlert } from "@/lib/vmb/cost-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: mails the administrators when yesterday's running costs went over the ceiling they set. */
export async function GET(req: NextRequest) {
  return withCronGuard(req, "vmb-cost-alert", { type: "crontab", value: "0 5 * * *" }, async () => sendCostAlert());
}
