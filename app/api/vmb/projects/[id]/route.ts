import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { getProject } from "@/lib/vmb/projects";

export const dynamic = "force-dynamic";

/** One project with its recent jobs and every scan round. 404 for projects outside the user's offices. */
export const GET = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:project-get", 120, 60_000);
  if (limited) return limited;
  const project = await getProject(user.id, params.id);
  if (!project) return NextResponse.json({ code: "not_found" }, { status: 404 });
  return NextResponse.json({ project });
});
