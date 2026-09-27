import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import {
  deleteFloorplanVizRun,
  getFloorplanVizRunForOrg,
  updateFloorplanVizRunMeta,
  updateFloorplanVizRunRooms,
} from "@/lib/projects/floorplan-viz-store";
import { floorplanRoomSchema } from "@/lib/projects/floorplan-layout";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  projectId: z.string().nullable().optional(),
  /** The room list a person checked against the sheet; replaces the read. */
  rooms: z.array(floorplanRoomSchema).min(1).max(40).optional(),
});

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, role }, segment) => {
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId, role);
    if (industryBlock) return industryBlock;
    const { id } = await segment.params;
    const run = await getFloorplanVizRunForOrg(orgId, id);
    if (!run) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
    return NextResponse.json({
      success: true,
      runId: run.id,
      title: run.title,
      projectId: run.projectId,
      sourceFileName: run.sourceFileName,
      layout: run.layout,
      images: run.images,
      enginesUsed: run.enginesUsed,
      ocrEngines: run.ocrEngines,
      visionEngines: run.visionEngines,
      confidence: run.confidence,
      spend: run.spend,
      geometry: run.geometry,
      grounding: {
        dimensionStrings: run.layout.dimensionStrings,
        roomNameHits: run.layout.rooms.map((room) => room.name),
      },
      styleKit: run.styleKit,
      scope: run.scope,
      planBase64: run.planBase64,
      planMimeType: run.planMimeType,
    });
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan GET");
  }
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId, role }, segment, body) => {
    try {
      const industryBlock = await guardConstructionOnlyApi(orgId, role);
      if (industryBlock) return industryBlock;
      const { id } = await segment.params;
      if (body.projectId) {
        const gate = await requireProjectForOrg(body.projectId, orgId);
        if (!gate.ok) return gate.response;
      }
      if (body.rooms) {
        const updated = await updateFloorplanVizRunRooms(orgId, id, body.rooms);
        if (!updated) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
        if (body.title === undefined && body.projectId === undefined) {
          return NextResponse.json({ success: true, runId: updated.id, layout: updated.layout });
        }
      }
      const run = await updateFloorplanVizRunMeta(orgId, id, {
        title: body.title,
        projectId: body.projectId,
      });
      if (!run) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
      return NextResponse.json({
        success: true,
        runId: run.id,
        title: run.title,
        projectId: run.projectId,
        layout: run.layout,
      });
    } catch (error) {
      return apiErrorResponse(error, "visualize-floorplan PATCH");
    }
  },
  { schema: patchSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, role }, segment) => {
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId, role);
    if (industryBlock) return industryBlock;
    const { id } = await segment.params;
    const ok = await deleteFloorplanVizRun(orgId, id);
    if (!ok) return jsonNotFound("ההדמיה לא נמצאה", "viz_run_not_found");
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "visualize-floorplan DELETE");
  }
});
