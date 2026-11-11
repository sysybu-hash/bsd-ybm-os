import type { NextRequest } from "next/server";
import { withCronGuard } from "@/lib/cron-guard";
import { vmbEngine } from "@/lib/vmb/engine";
import { runnerReady } from "@/lib/vmb/run-store";
import { claimNextJob, reapStalledJobs, runClaimed } from "@/lib/vmb/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * VMB's runner, every minute: fails jobs that stopped reporting (their credits go back), then takes one queued booklet
 * job and runs it. Does nothing while VMB_RUNNER_READY is off.
 */
export async function GET(req: NextRequest) {
  return withCronGuard(req, "vmb-runner", { type: "crontab", value: "* * * * *" }, async () => {
    if (!runnerReady()) return { ready: false };
    const reaped = await reapStalledJobs();
    const input = await claimNextJob();
    if (!input) return { ready: true, reaped, ran: null };
    const result = await runClaimed(input, vmbEngine);
    return { ready: true, reaped, ran: input.jobId, result };
  });
}
