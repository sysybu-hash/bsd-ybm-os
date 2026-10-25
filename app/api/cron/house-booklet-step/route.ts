import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { houseStepLabel } from "@/lib/projects/building/house-booklet-job";
import { advanceHouseBookletJob } from "@/lib/projects/building/house-booklet-steps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("cron/house-booklet-step");

/**
 * One step of a private-house booklet, called by QStash with the cron secret.
 *
 * Not withCronGuard: that reports to a Sentry Crons monitor on a schedule,
 * and these calls follow a job, not a clock (as building-booklet-step).
 */
export async function POST(req: NextRequest) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    log.warn("house booklet step auth failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const job = await advanceHouseBookletJob(id);
  return NextResponse.json({ ok: true, status: job?.status ?? "busy", stage: job ? houseStepLabel(job.at) : null });
}
