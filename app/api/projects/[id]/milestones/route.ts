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
    const rows = await prisma.paymentMilestone.findMany({
      where: { projectId: id, organizationId: orgId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ milestones: rows });
  } catch (error) {
    return apiErrorResponse(error, "Milestones GET");
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  sortOrder: z.number().int().optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const gate = await requireProjectForOrg(id, orgId);
      if (!gate.ok) return gate.response;
      const row = await prisma.paymentMilestone.create({
        data: {
          projectId: id,
          organizationId: orgId,
          name: body.name,
          amount: body.amount,
          sortOrder: body.sortOrder ?? 0,
        },
      });
      return NextResponse.json(row);
    } catch (error) {
      return apiErrorResponse(error, "Milestones POST");
    }
  },
  { schema: createSchema },
);

const patchSchema = z.object({
  id: z.string().min(1),
  isPaid: z.boolean().optional(),
  datePaid: z.string().datetime().nullable().optional(),
});

export const PATCH = withWorkspacesAuthDynamic<{ id: string }, typeof patchSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id: projectId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const existing = await prisma.paymentMilestone.findFirst({
        where: { id: body.id, projectId, organizationId: orgId },
      });
      if (!existing) {
        return NextResponse.json({ error: "אבן דרך לא נמצאה" }, { status: 404 });
      }

      const row = await prisma.paymentMilestone.update({
        where: { id: body.id },
        data: {
          isPaid: body.isPaid ?? existing.isPaid,
          datePaid:
            body.datePaid === null
              ? null
              : body.datePaid
                ? new Date(body.datePaid)
                : body.isPaid
                  ? new Date()
                  : existing.datePaid,
        },
      });
      return NextResponse.json(row);
    } catch (error) {
      return apiErrorResponse(error, "Milestones PATCH");
    }
  },
  { schema: patchSchema },
);
