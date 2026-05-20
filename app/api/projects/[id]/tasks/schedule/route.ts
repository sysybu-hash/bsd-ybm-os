import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId }, segment) => {
  const { id } = await segment.params;
  try {
    const gate = await requireProjectForOrg(id, orgId);
    if (!gate.ok) return gate.response;
    const tasks = await prisma.task.findMany({
      where: { projectId: id, organizationId: orgId },
      orderBy: { startDate: "asc" },
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    return apiErrorResponse(error, "Task schedule GET");
  }
});

const patchSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      startDate: z.string().datetime().nullable().optional(),
      endDate: z.string().datetime().nullable().optional(),
      progress: z.number().int().min(0).max(100).optional(),
      dependencies: z.string().nullable().optional(),
    }),
  ),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      await prisma.$transaction(
        body.tasks.map((t) =>
          prisma.task.updateMany({
            where: { id: t.id, projectId, organizationId: orgId },
            data: {
              startDate: t.startDate === undefined ? undefined : t.startDate ? new Date(t.startDate) : null,
              endDate: t.endDate === undefined ? undefined : t.endDate ? new Date(t.endDate) : null,
              progress: t.progress,
              dependencies: t.dependencies === undefined ? undefined : t.dependencies,
            },
          }),
        ),
      );

      const tasks = await prisma.task.findMany({
        where: { projectId, organizationId: orgId },
        orderBy: { startDate: "asc" },
      });
      return NextResponse.json({ tasks });
    } catch (error) {
      return apiErrorResponse(error, "Task schedule PATCH");
    }
  },
  { schema: patchSchema },
);
