import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { getBookletJob } from "@/lib/projects/building/booklet-job";
import { advanceBookletJob } from "@/lib/projects/building/booklet-job-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One step of a building booklet, asked for by the page that started it.
 *
 * Where QStash is configured it drives the job and this mostly finds the job
 * taken; where it is not, the open page drives it with this. Either way a
 * step only runs if nobody else holds the job.
 */
export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId, role }, segment) => {
  try {
    const limited = await applyRateLimit(req, "building-booklet:step", 20, 60_000);
    if (limited) return limited;
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const { id } = await segment.params;
    const job = (await advanceBookletJob(id, orgId)) ?? (await getBookletJob(orgId, id));
    if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
    return NextResponse.json({ job });
  } catch (error) {
    return apiErrorResponse(error, "building booklet step");
  }
});
