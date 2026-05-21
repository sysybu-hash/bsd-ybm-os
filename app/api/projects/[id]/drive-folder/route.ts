import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { ensureProjectDriveFolder } from "@/lib/projects/ensure-project-drive-folder";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, userId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const folder = await ensureProjectDriveFolder(projectId, orgId, userId);
    if (!folder) {
      return NextResponse.json({ error: "לא ניתן ליצור תיקיית Drive" }, { status: 502 });
    }
    return NextResponse.json(folder);
  } catch (error) {
    return apiErrorResponse(error, "drive-folder");
  }
});
