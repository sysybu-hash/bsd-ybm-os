import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { listProjects } from "@/lib/workspace-api/project-detail";

export const GET = withWorkspacesAuth(async (_req, { orgId }) => {
  try {
    return NextResponse.json(await listProjects(orgId));
  } catch (error) {
    return apiErrorResponse(error, "Projects list GET");
  }
});
