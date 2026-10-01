import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { isFloorplanBlobUrl } from "@/lib/projects/floorplan-blob";
import { createBookletJob, listBookletJobs, scheduleNextStep } from "@/lib/projects/building/booklet-job";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  /** The permit strip's drawing, uploaded to Blob by the browser. */
  blobUrl: z.string().url(),
  /** Typed by the person: the strip's title block sits beside the permit form. */
  name: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(160).optional(),
  projectId: z.string().optional(),
});

/** Start a building booklet from an uploaded permit strip; the job runs on in steps. */
export const POST = withWorkspacesAuth(async (req, { orgId, userId, role }) => {
  try {
    // A booklet is minutes of rendering: a few an hour is plenty.
    const limited = await applyRateLimit(req, "building-booklet:create", 5, 3_600_000);
    if (limited) return limited;
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonBadRequest("חסרים פרטים להפקת החוברת", "missing_fields");
    const { blobUrl, name, subtitle, projectId } = parsed.data;
    if (!isFloorplanBlobUrl(blobUrl)) return jsonBadRequest("קובץ הגרמושקה שהועלה אינו זמין", "blob_unavailable");
    if (projectId) {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;
    }
    const job = await createBookletJob({ orgId, userId, projectId: projectId ?? null, name, subtitle, sourceUrl: blobUrl });
    const queued = await scheduleNextStep(job.id);
    return NextResponse.json({ job, queued });
  } catch (error) {
    return apiErrorResponse(error, "building booklet create");
  }
});

export const GET = withWorkspacesAuth(async (req, { orgId, role }) => {
  try {
    const limited = await applyRateLimit(req, "building-booklet:list", 60, 60_000);
    if (limited) return limited;
    const block = await guardConstructionOnlyApi(orgId, role);
    if (block) return block;
    return NextResponse.json({ jobs: await listBookletJobs(orgId) });
  } catch (error) {
    return apiErrorResponse(error, "building booklet list");
  }
});
