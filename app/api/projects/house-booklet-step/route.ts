import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { getHouseBookletJob, houseBookletView } from "@/lib/projects/building/house-booklet-job";
import { advanceHouseBookletJob } from "@/lib/projects/building/house-booklet-steps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One step of a private-house booklet, asked for by the page that started it
 * (`?id=`). At a path no other route contains, so the renderer, Chromium and
 * the painter it carries are traced into this function alone (next.config.js).
 *
 * Where QStash is configured it drives the job and this mostly finds the job
 * taken; where it is not, the open page drives it with this. Either way a
 * step only runs if nobody else holds the job, and nothing is painted that
 * the owner did not approve (the approval is the private-house route's).
 */
export const POST = withWorkspacesAuth(async (req, { orgId, role }) => {
  try {
    const limited = await applyRateLimit(req, "building-booklet:house-step", 30, 60_000);
    if (limited) return limited;
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    const job = (await advanceHouseBookletJob(id, orgId)) ?? (await getHouseBookletJob(orgId, id));
    if (!job) return jsonNotFound("החוברת לא נמצאה", "booklet_not_found");
    return NextResponse.json(houseBookletView(job));
  } catch (error) {
    return apiErrorResponse(error, "house booklet step");
  }
});
