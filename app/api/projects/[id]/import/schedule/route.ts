import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import {
  parseMsProjectXml,
  parseScheduleCsv,
  type ImportedScheduleTask,
} from "@/lib/imports/ms-project-schedule";
import { convertMppToXml, isMppConvertConfigured, MppConvertError } from "@/lib/mpp/convert-client";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import {
  getApiErrorMessage,
  getMppApiErrorMessage,
  resolveApiLocaleFromRequest,
} from "@/lib/i18n/api-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function importTasks(
  projectId: string,
  organizationId: string,
  tasks: ImportedScheduleTask[],
  replace: boolean,
) {
  if (replace) {
    await prisma.task.deleteMany({ where: { projectId, organizationId } });
  }

  const idByExternal = new Map<string, string>();

  for (const t of tasks) {
    const parentTaskId = t.parentExternalId ? idByExternal.get(t.parentExternalId) : undefined;
    const created = await prisma.task.create({
      data: {
        projectId,
        organizationId,
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
        progress: t.progress,
        parentTaskId,
        externalTaskId: t.externalTaskId,
        status: t.progress >= 100 ? "DONE" : "TODO",
      },
    });
    idByExternal.set(t.externalTaskId, created.id);
  }
}

export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  const apiLocale = resolveApiLocaleFromRequest(req);
  try {
    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const form = await req.formData();
    const file = form.get("file");
    const confirm = form.get("confirm") === "true";
    const replace = form.get("replace") !== "false";

    if (!file || !(file instanceof File)) {
      return jsonBadRequest(
        getApiErrorMessage("schedule_missing_file", apiLocale),
        "missing_file",
      );
    }

    const name = file.name.toLowerCase();
    let text: string;
    let tasks: ImportedScheduleTask[] = [];

    if (name.endsWith(".mpp")) {
      if (!isMppConvertConfigured()) {
        return jsonBadRequest(
          getApiErrorMessage("schedule_mpp_not_configured", apiLocale),
          "mpp_converter_not_configured",
        );
      }
      try {
        const converted = await convertMppToXml(file, file.name);
        text = converted.xml;
      } catch (err: unknown) {
        if (err instanceof MppConvertError) {
          return jsonBadRequest(getMppApiErrorMessage(err.code, apiLocale), err.code);
        }
        throw err;
      }
    } else {
      text = await file.text();
    }

    if (name.endsWith(".xml") || name.endsWith(".mpp") || text.trimStart().startsWith("<?xml")) {
      tasks = parseMsProjectXml(text);
    } else if (name.endsWith(".csv")) {
      tasks = parseScheduleCsv(text);
    } else {
      return jsonBadRequest(
        getApiErrorMessage("schedule_unsupported_format", apiLocale),
        "unsupported_format",
      );
    }

    if (!confirm) {
      return NextResponse.json({
        preview: true,
        taskCount: tasks.length,
        sample: tasks.slice(0, 20),
      });
    }

    await importTasks(projectId, orgId, tasks, replace);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        lastScheduleImportAt: new Date(),
        scheduleSourceFile: file.name,
      },
    });

    return NextResponse.json({ ok: true, imported: tasks.length });
  } catch (error) {
    return apiErrorResponse(error, "import/schedule");
  }
});
