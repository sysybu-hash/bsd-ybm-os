import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonNotFound } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { notifyProgressDrop } from "@/lib/push/work-diary-rules";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  description: z.string().min(1).optional(),
  workersCount: z.number().int().min(1).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  isSyncedToAI: z.boolean().optional(),
  date: z.string().datetime().optional(),
  weather: z.string().optional(),
  workHours: z.number().optional(),
  materialsJson: z.unknown().optional(),
  photosJson: z.unknown().optional(),
  linkedTaskId: z.string().nullable().optional(),
  linkedBoqLineId: z.string().nullable().optional(),
  progressNote: z.string().optional(),
});

export const PATCH = withWorkspacesAuthDynamic<
  { id: string; diaryId: string },
  typeof patchSchema
>(
  async (_req, { orgId, userId }, segment, body) => {
    const { id: projectId, diaryId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const existing = await prisma.workDiary.findFirst({
        where: { id: diaryId, projectId, organizationId: orgId },
      });
      if (!existing) return jsonNotFound("רשומת יומן לא נמצאה");

      const project = await prisma.project.findFirst({
        where: { id: projectId },
        select: { name: true },
      });

      const diary = await prisma.workDiary.update({
        where: { id: diaryId },
        data: {
          description: body.description ?? body.progressNote ?? existing.description,
          workersCount: body.workersCount,
          progress: body.progress,
          isSyncedToAI: body.isSyncedToAI,
          date: body.date ? new Date(body.date) : undefined,
          weather: body.weather,
          workHours: body.workHours,
          materialsJson:
            body.materialsJson === undefined
              ? undefined
              : (body.materialsJson as Prisma.InputJsonValue),
          photosJson:
            body.photosJson === undefined ? undefined : (body.photosJson as Prisma.InputJsonValue),
          linkedTaskId: body.linkedTaskId,
          linkedBoqLineId: body.linkedBoqLineId,
        },
      });

      if (body.progress != null && body.progress < existing.progress) {
        await notifyProgressDrop(userId, projectId, project?.name ?? "פרויקט", existing.progress, body.progress);
      }

      if (body.linkedBoqLineId && body.progress != null) {
        await prisma.projectBoqLine.updateMany({
          where: { id: body.linkedBoqLineId, projectId },
          data: {
            progressCoefficient: body.progress / 100,
            isWorkDone: body.progress >= 100,
          },
        });
      }

      if (diary.isSyncedToAI && body.description) {
        try {
          const { createProjectNote } = await import("@/lib/workspace-api/project-detail");
          await createProjectNote(orgId, userId, projectId, `[יומן עבודה — עדכון] ${body.description}`);
        } catch {
          /* non-blocking */
        }
      }

      return NextResponse.json(diary);
    } catch (error) {
      return apiErrorResponse(error, "Work diary PATCH");
    }
  },
  { schema: patchSchema },
);

export const DELETE = withWorkspacesAuthDynamic<{ id: string; diaryId: string }>(
  async (_req, { orgId }, segment) => {
    const { id: projectId, diaryId } = await segment.params;
    try {
      const gate = await requireProjectForOrg(projectId, orgId);
      if (!gate.ok) return gate.response;

      const existing = await prisma.workDiary.findFirst({
        where: { id: diaryId, projectId, organizationId: orgId },
      });
      if (!existing) return jsonNotFound("רשומת יומן לא נמצאה");

      await prisma.workDiary.delete({ where: { id: diaryId } });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return apiErrorResponse(error, "Work diary DELETE");
    }
  },
);
