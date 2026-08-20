import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import {
  boardPriorityToDb,
  boardStatusFromDb,
  boardStatusToDb,
} from "@/lib/tasks/board-mapping";
import {
  buildTaskKanbanMetadataJson,
  mapPrismaTaskToBoardRow,
  mergeTaskKanbanMetadata,
} from "@/lib/tasks/kanban-task-mapper";
import { syncTaskToGoogleCalendarIfEligible } from "@/lib/google-calendar-sync";
import { createLogger } from "@/lib/logger";

const log = createLogger("projects-update");

const taskInclude = {
  project: {
    include: {
      contacts: { take: 1, orderBy: { createdAt: "asc" as const } },
    },
  },
} as const;

export const GET = withWorkspacesAuth(async (request, { orgId }) => {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || undefined;
    const tasks = await prisma.task.findMany({
      where: {
        organizationId: orgId,
        ...(projectId ? { projectId } : {}),
      },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
    });

    const mappedTasks = tasks.map(mapPrismaTaskToBoardRow);

    return NextResponse.json(mappedTasks);
  } catch (error: unknown) {
    return apiErrorResponse(error, "Fetch Tasks Error");
  }
});

export const POST = withWorkspacesAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const {
      id,
      status,
      budget,
      title,
      description,
      project,
      projectName,
      projectId: bodyProjectId,
      clientName,
      contactId,
      priority,
      dueDate,
    } = body as {
      id?: string;
      status?: string;
      budget?: number;
      title?: string;
      description?: string;
      project?: string;
      projectName?: string;
      projectId?: string;
      clientName?: string;
      contactId?: string;
      priority?: string;
      dueDate?: string;
    };

    const scopedProjectId =
      typeof bodyProjectId === "string" && bodyProjectId.trim() ? bodyProjectId.trim() : undefined;
    const resolvedProjectName = (projectName ?? project ?? "").trim();
    const isExistingTask = Boolean(id && typeof id === "string" && !/^\d+$/.test(id));
    const dbStatus = status ? boardStatusToDb(status) : undefined;
    const dbPriority = priority ? boardPriorityToDb(priority) : undefined;

    if (isExistingTask) {
      const existing = await prisma.task.findFirst({
        where: { id, organizationId: orgId },
        include: { project: true },
      });
      if (!existing) {
        return NextResponse.json({ success: false, error: "משימה לא נמצאה" }, { status: 404 });
      }

      let projectId = existing.projectId;
      if (resolvedProjectName && resolvedProjectName !== existing.project.name) {
        let projectRecord = await prisma.project.findFirst({
          where: { name: resolvedProjectName, organizationId: orgId },
        });
        if (!projectRecord) {
          projectRecord = await prisma.project.create({
            data: {
              name: resolvedProjectName,
              organizationId: orgId,
              budget: typeof budget === "number" ? budget : 0,
              ...(contactId ? { primaryContactId: contactId } : {}),
            },
          });
        }
        projectId = projectRecord.id;
      } else if (typeof budget === "number") {
        await prisma.project.update({
          where: { id: existing.projectId },
          data: { budget },
        });
      }

      if (contactId) {
        await prisma.contact.updateMany({
          where: { id: contactId, organizationId: orgId },
          data: { projectId },
        });
        await prisma.project.update({
          where: { id: projectId },
          data: { primaryContactId: contactId },
        });
      }

      const resolvedClient =
        clientName ||
        (contactId
          ? (
              await prisma.contact.findFirst({
                where: { id: contactId, organizationId: orgId },
                select: { name: true },
              })
            )?.name
          : undefined);

      const metadataPatch = mergeTaskKanbanMetadata(existing.metadata, {
        clientName: resolvedClient,
        contactId: contactId ?? undefined,
        budget: typeof budget === "number" ? budget : undefined,
      });

      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: dbStatus,
          priority: dbPriority,
          dueDate: dueDate === "" ? null : dueDate ? new Date(dueDate) : undefined,
          title: title || undefined,
          projectId,
          description: description !== undefined ? description : undefined,
          metadata: metadataPatch,
        },
      });

      if (status && id) {
        await captureServerEvent(userId, "task_status_changed", {
          taskId: id,
          status: boardStatusFromDb(dbStatus ?? existing.status),
          organizationId: orgId,
        });
      }

      try {
        await syncTaskToGoogleCalendarIfEligible(userId, orgId, updatedTask);
      } catch (err: unknown) {
        log.warn("calendar sync after task update failed", {
          taskId: updatedTask.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      return NextResponse.json({ success: true, task: updatedTask });
    }

    if (!title) {
      return NextResponse.json({ success: false, error: "חסרה כותרת משימה" }, { status: 400 });
    }

    let projectRecord = scopedProjectId
      ? await prisma.project.findFirst({
          where: { id: scopedProjectId, organizationId: orgId },
        })
      : null;

    if (!projectRecord && resolvedProjectName) {
      projectRecord = await prisma.project.findFirst({
        where: { name: resolvedProjectName, organizationId: orgId },
      });
    }

    if (!projectRecord && !resolvedProjectName && !scopedProjectId) {
      return NextResponse.json({ success: false, error: "חסרים כותרת או פרויקט" }, { status: 400 });
    }

    if (!projectRecord) {
      projectRecord = await prisma.project.create({
        data: {
          name: resolvedProjectName || "פרויקט חדש",
          organizationId: orgId,
          budget: typeof budget === "number" ? budget : 0,
          ...(contactId ? { primaryContactId: contactId } : {}),
        },
      });
    } else if (typeof budget === "number") {
      projectRecord = await prisma.project.update({
        where: { id: projectRecord.id },
        data: { budget },
      });
    }

    if (contactId) {
      await prisma.contact.updateMany({
        where: { id: contactId, organizationId: orgId },
        data: { projectId: projectRecord.id },
      });
      await prisma.project.update({
        where: { id: projectRecord.id },
        data: { primaryContactId: contactId },
      });
    }

    const newTask = await prisma.task.create({
      data: {
        title,
        status: dbStatus ?? "TODO",
        priority: dbPriority ?? "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: projectRecord.id,
        organizationId: orgId,
        description: description?.trim() || null,
        metadata: buildTaskKanbanMetadataJson({
          clientName,
          contactId,
          budget: typeof budget === "number" ? budget : undefined,
        }),
      },
    });

    await captureServerEvent(userId, "task_created", {
      taskId: newTask.id,
      organizationId: orgId,
    });

    try {
      await syncTaskToGoogleCalendarIfEligible(userId, orgId, newTask);
    } catch (err: unknown) {
      log.warn("calendar sync after task create failed", {
        taskId: newTask.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ success: true, task: newTask });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Project/Task Update Error");
  }
});

export const DELETE = withWorkspacesAuth(async (request, { orgId, userId }) => {
  try {
    const url = new URL(request.url);
    let id = url.searchParams.get("id");
    if (!id) {
      const body = (await request.json().catch(() => ({}))) as { id?: string };
      id = body.id ?? null;
    }
    if (!id) {
      return NextResponse.json({ success: false, error: "חסר מזהה משימה" }, { status: 400 });
    }

    const existing = await prisma.task.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "משימה לא נמצאה" }, { status: 404 });
    }

    await prisma.task.deleteMany({
      where: { id, organizationId: orgId },
    });

    try {
      await syncTaskToGoogleCalendarIfEligible(userId, orgId, {
        ...existing,
        dueDate: null,
        endDate: null,
        startDate: null,
      });
    } catch (err: unknown) {
      log.warn("calendar sync after task delete failed", {
        taskId: id,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    await captureServerEvent(userId, "task_deleted", {
      taskId: id,
      organizationId: orgId,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Task Delete Error");
  }
});
