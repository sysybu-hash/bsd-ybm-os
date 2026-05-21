import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { syncMeckanoToWorkDiaries } from "@/lib/meckano-work-diary-sync";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, userId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { meckanoZoneId: true },
    });

    let rows: Array<{ id?: number; employeeName?: string; date?: string; hours?: number; status?: string }> =
      [];

    if (project?.meckanoZoneId) {
      const { getMeckanoAttendanceForProject } = await import("@/lib/meckano-access");
      rows = await getMeckanoAttendanceForProject(projectId, orgId);
    }

    const result = await syncMeckanoToWorkDiaries(projectId, orgId, userId, rows);
    return NextResponse.json({ ok: true, ...result, rowCount: rows.length });
  } catch (error) {
    return apiErrorResponse(error, "sync-meckano");
  }
});
