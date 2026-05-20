import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { getProjectDashboard } from "@/lib/workspace-api/project-dashboard";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const dashboard = await getProjectDashboard(orgId, id);
    if (!dashboard) return jsonNotFound("הפרויקט לא נמצא");
    return NextResponse.json(dashboard);
  } catch (error) {
    return apiErrorResponse(error, "Project dashboard GET");
  }
});
