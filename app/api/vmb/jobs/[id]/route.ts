import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { getJob } from "@/lib/vmb/projects";

export const dynamic = "force-dynamic";

/**
 * A job's live progress. Every shell polls this (every ~2 s while running);
 * the job lives on the server, so a closed tab loses nothing.
 */
export const GET = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:job-get", 120, 60_000);
  if (limited) return limited;
  const job = await getJob(user.id, params.id);
  if (!job) return NextResponse.json({ code: "not_found" }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
});
