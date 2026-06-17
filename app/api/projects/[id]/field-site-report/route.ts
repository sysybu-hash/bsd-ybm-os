import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { applySiteDiaryReport } from "@/lib/field-copilot/apply-site-diary-report";
import { analyzeSiteDiaryPhoto } from "@/lib/field-copilot/site-diary-analyze";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { createLogger } from "@/lib/logger";
import { normalizeLocale } from "@/lib/i18n/config";
import { isFieldCopilotEnabled } from "@/lib/platform-settings";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { fieldSiteReportSchema } from "@/lib/validation/schemas/site-diary-report";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const log = createLogger("field-site-report");

function localeLang(locale: string): string {
  const loc = normalizeLocale(locale);
  if (loc === "en") return "English";
  if (loc === "ru") return "Russian";
  return "Hebrew";
}

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof fieldSiteReportSchema>(
  async (req, { orgId, userId }, segment, body) => {
    const limited = await applyRateLimit(req, "field-site-report", 12, 60_000);
    if (limited) return limited;

    const blocked = await guardConstructionOnlyApi(orgId);
    if (blocked) return blocked;

    if (!(await isFieldCopilotEnabled())) {
      return NextResponse.json({ error: "קופיילוט שטח מושבת" }, { status: 403 });
    }

    const { id: projectId } = await segment.params;
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    let taskTitle: string | null = null;
    if (body.taskId) {
      const task = await prisma.task.findFirst({
        where: { id: body.taskId, projectId, organizationId: orgId },
        select: { title: true },
      });
      if (!task) return jsonBadRequest("המשימה לא נמצאה", "task_not_found");
      taskTitle = task.title;
    }

    try {
      const analysis = await analyzeSiteDiaryPhoto({
        localeLang: localeLang(body.locale ?? "he"),
        projectName: gate.project.name,
        taskTitle,
        notes: body.notes?.trim() || null,
        image: { base64: body.imageBase64, mimeType: body.mimeType },
      });

      const applied = await applySiteDiaryReport({
        orgId,
        userId,
        projectId,
        taskId: body.taskId,
        analysis,
        mimeType: body.mimeType,
        applyTaskStatus: body.applyTaskStatus,
      });

      return NextResponse.json({
        analysis,
        diaryId: applied.diaryId,
        taskStatusUpdated: applied.taskStatusUpdated,
        newTaskStatus: applied.newTaskStatus,
      });
    } catch (err: unknown) {
      log.error("field site report failed", {
        error: err instanceof Error ? err.message : String(err),
        orgId,
        projectId,
      });
      return apiErrorResponse(err, "field-site-report");
    }
  },
  { schema: fieldSiteReportSchema },
);
