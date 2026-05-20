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
    const rows = await prisma.workDiary.findMany({
      where: { projectId: id, organizationId: orgId },
      orderBy: { date: "desc" },
    });
    return NextResponse.json({ diaries: rows });
  } catch (error) {
    return apiErrorResponse(error, "Work diaries GET");
  }
});

const createSchema = z.object({
  description: z.string().min(1),
  workersCount: z.number().int().min(1).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  isSyncedToAI: z.boolean().optional(),
  date: z.string().datetime().optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof createSchema>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id } = await segment.params;
    try {
      const gate = await requireProjectForOrg(id, orgId);
      if (!gate.ok) return gate.response;

      const diary = await prisma.workDiary.create({
        data: {
          projectId: id,
          organizationId: orgId,
          description: body.description,
          workersCount: body.workersCount ?? 1,
          progress: body.progress ?? 0,
          isSyncedToAI: body.isSyncedToAI ?? true,
          date: body.date ? new Date(body.date) : new Date(),
          createdByUserId: userId,
        },
      });

      if (diary.isSyncedToAI) {
        try {
          const { createProjectNote } = await import("@/lib/workspace-api/project-detail");
          await createProjectNote(orgId, userId, id, `[יומן עבודה] ${body.description}`);
        } catch {
          /* non-blocking */
        }
      }

      return NextResponse.json(diary);
    } catch (error) {
      return apiErrorResponse(error, "Work diaries POST");
    }
  },
  { schema: createSchema },
);
