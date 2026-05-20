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
    const rows = await prisma.projectExtra.findMany({
      where: { projectId: id, organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ extras: rows });
  } catch (error) {
    return apiErrorResponse(error, "Extras GET");
  }
});

const createSchema = z.object({
  description: z.string().min(1),
  cost: z.number().nonnegative(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const gate = await requireProjectForOrg(id, orgId);
      if (!gate.ok) return gate.response;
      const row = await prisma.projectExtra.create({
        data: {
          projectId: id,
          organizationId: orgId,
          description: body.description,
          cost: body.cost,
        },
      });
      return NextResponse.json(row);
    } catch (error) {
      return apiErrorResponse(error, "Extras POST");
    }
  },
  { schema: createSchema },
);

const patchSchema = z.object({
  id: z.string().min(1),
  isApproved: z.boolean(),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;
      const existing = await prisma.projectExtra.findFirst({
        where: { id: body.id, projectId, organizationId: orgId },
      });
      if (!existing) {
        return NextResponse.json({ error: "תוספת לא נמצאה" }, { status: 404 });
      }
      const row = await prisma.projectExtra.update({
        where: { id: body.id },
        data: { isApproved: body.isApproved },
      });
      return NextResponse.json(row);
    } catch (error) {
      return apiErrorResponse(error, "Extras PATCH");
    }
  },
  { schema: patchSchema },
);
