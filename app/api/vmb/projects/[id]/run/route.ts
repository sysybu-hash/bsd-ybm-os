import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, withVmbAuth } from "@/lib/vmb/api";
import { cancelQueuedRun, startRun } from "@/lib/vmb/run-store";

export const dynamic = "force-dynamic";

const STATUS = {
  not_found: 404,
  questions_pending: 409,
  no_files: 409,
  already_running: 409,
  runner_not_ready: 503,
  no_subscription: 402,
  insufficient_credits: 402,
} as const;

/** The one button: holds the estimate's ceiling and queues the booklet. */
export const POST = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:run", 10, 60_000);
  if (limited) return limited;
  const out = await startRun(user.id, params.id);
  return out.ok ? NextResponse.json({ jobId: out.jobId }) : NextResponse.json({ code: out.code }, { status: STATUS[out.code] });
});

/** Cancels a booklet that has not started, and gives its credits back. */
export const DELETE = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  if (!isSameOrigin(req)) return NextResponse.json({ code: "forbidden" }, { status: 403 });
  const limited = await applyRateLimit(req, "vmb:run-cancel", 10, 60_000);
  if (limited) return limited;
  const ok = await cancelQueuedRun(user.id, params.id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: "not_cancellable" }, { status: 409 });
});
