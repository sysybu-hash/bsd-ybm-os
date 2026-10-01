import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { getBookletJob } from "@/lib/projects/building/booklet-job";

export const dynamic = "force-dynamic";

/** Where a building booklet stands. */
export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId, role }, segment) => {
  try {
    const limited = await applyRateLimit(req, "building-booklet:status", 120, 60_000);
    if (limited) return limited;
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const { id } = await segment.params;
    const job = await getBookletJob(orgId, id);
    if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
    return NextResponse.json({ job });
  } catch (error) {
    return apiErrorResponse(error, "building booklet status");
  }
});
