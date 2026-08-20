import type { Prisma } from "@prisma/client";
import { boardStatusToDb } from "@/lib/tasks/board-mapping";
import { prisma } from "@/lib/prisma";
import type { SiteDiaryAnalysis } from "@/lib/validation/schemas/site-diary-report";

export type ApplySiteDiaryReportInput = {
  orgId: string;
  userId: string;
  projectId: string;
  taskId?: string | null;
  analysis: SiteDiaryAnalysis;
  mimeType: string;
  applyTaskStatus?: boolean;
};

export type ApplySiteDiaryReportResult = {
  diaryId: string;
  taskStatusUpdated: boolean;
  newTaskStatus: string | null;
};

function buildDiaryDescription(analysis: SiteDiaryAnalysis): string {
  const lines = [analysis.summary.trim()];
  if (analysis.materialsDetected.length > 0) {
    lines.push(`חומרים שזוהו: ${analysis.materialsDetected.join(", ")}`);
  }
  if (analysis.issues.length > 0) {
    lines.push(`הערות / בעיות: ${analysis.issues.join("; ")}`);
  }
  return lines.join("\n");
}

export async function applySiteDiaryReport(
  input: ApplySiteDiaryReportInput,
): Promise<ApplySiteDiaryReportResult> {
  const photosJson: Prisma.InputJsonValue = [
    {
      source: "field_site_report",
      mimeType: input.mimeType,
      analyzedAt: new Date().toISOString(),
    },
  ];

  const diary = await prisma.workDiary.create({
    data: {
      projectId: input.projectId,
      organizationId: input.orgId,
      description: buildDiaryDescription(input.analysis),
      workersCount: 1,
      progress: input.analysis.progressPercent ?? 0,
      isSyncedToAI: true,
      createdByUserId: input.userId,
      weather: input.analysis.weather ?? undefined,
      photosJson,
      linkedTaskId: input.taskId ?? undefined,
    },
  });

  try {
    const { createProjectNote } = await import("@/lib/workspace-api/project-detail");
    await createProjectNote(
      input.orgId,
      input.userId,
      input.projectId,
      `[יומן שטח AI] ${input.analysis.summary}`,
    );
  } catch {
    /* non-blocking */
  }

  let taskStatusUpdated = false;
  let newTaskStatus: string | null = null;

  const shouldApplyTask =
    input.applyTaskStatus !== false &&
    input.taskId &&
    input.analysis.suggestedTaskStatus;

  if (shouldApplyTask && input.taskId && input.analysis.suggestedTaskStatus) {
    const dbStatus = boardStatusToDb(input.analysis.suggestedTaskStatus);
    if (dbStatus) {
      const task = await prisma.task.findFirst({
        where: {
          id: input.taskId,
          projectId: input.projectId,
          organizationId: input.orgId,
        },
      });
      if (task && task.status !== dbStatus) {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: dbStatus },
        });
        taskStatusUpdated = true;
        newTaskStatus = input.analysis.suggestedTaskStatus;
      }
    }
  }

  return {
    diaryId: diary.id,
    taskStatusUpdated,
    newTaskStatus,
  };
}
