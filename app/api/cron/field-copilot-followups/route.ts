import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runFieldCopilotFollowupsForAllOrganizations } from "@/lib/field-copilot/followup-runner";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-field-copilot-followups", { type: "crontab", value: "0 8 * * *" }, async () => {
    return await runFieldCopilotFollowupsForAllOrganizations();
  });
}
