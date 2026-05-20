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
    const rows = await prisma.projectExpense.findMany({
      where: { projectId: id, organizationId: orgId },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ expenses: rows });
  } catch (error) {
    return apiErrorResponse(error, "Project expenses GET");
  }
});

const createSchema = z.object({
  month: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().nonnegative(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const gate = await requireProjectForOrg(id, orgId);
      if (!gate.ok) return gate.response;
      const row = await prisma.projectExpense.create({
        data: {
          projectId: id,
          organizationId: orgId,
          month: body.month,
          category: body.category,
          amount: body.amount,
        },
      });
      return NextResponse.json(row);
    } catch (error) {
      return apiErrorResponse(error, "Project expenses POST");
    }
  },
  { schema: createSchema },
);
