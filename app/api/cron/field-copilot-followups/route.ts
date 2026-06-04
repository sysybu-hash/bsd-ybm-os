import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { runCashflowGuardian } from "@/lib/cashflow-guardian";
import { runFieldCopilotFollowupsForAllOrganizations } from "@/lib/field-copilot/followup-runner";

export async function GET(req: NextRequest) {
  return withCronGuard(req, "cron-field-copilot-followups", { type: "crontab", value: "0 8 * * *" }, async () => {
    const followups = await runFieldCopilotFollowupsForAllOrganizations();
    const cashflow = await runCashflowGuardian();
    return { followups, cashflow };
  });
}
