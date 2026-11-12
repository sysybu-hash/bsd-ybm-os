import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { vmbEngine } from "@/lib/vmb/engine";
import { runnerReady } from "@/lib/vmb/run-store";
import { claimJob, runClaimed } from "@/lib/vmb/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const log = createLogger("cron/vmb-job");

/**
 * One VMB booklet job, called by QStash with the cron secret as the job is queued (lib/vmb/run-queue.ts). Each call
 * runs its own job, so jobs run side by side. A job already taken (a retry, or the sweeper got there first) is left.
 *
 * Not withCronGuard: these calls follow a job, not a clock (as cron/building-booklet-step). The secret is checked the
 * same way.
 */
export async function POST(req: NextRequest) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    log.warn("vmb job auth failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!runnerReady()) return NextResponse.json({ ready: false });
  const jobId = req.nextUrl.searchParams.get("job")?.trim();
  if (!jobId || !/^[\w-]{1,64}$/.test(jobId)) return NextResponse.json({ error: "missing job" }, { status: 400 });
  const input = await claimJob(jobId);
  if (!input) return NextResponse.json({ ready: true, ran: null });
  const result = await runClaimed(input, vmbEngine);
  return NextResponse.json({ ready: true, ran: jobId, result });
}
