import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { captureServerEvent } from "@/lib/analytics/posthog-server";

function parseBudgetFromDescription(description: string | null | undefined): number {
  if (!description) return 0;
  const m = description.match(/Budget:\s*([\d.]+)/i);
  return m ? Number(m[1]) || 0 : 0;
}

export const GET = withWorkspacesAuth(async (_request, { orgId }) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { organizationId: orgId },
      include: {
        project: {
          include: {
            contacts: { take: 1, orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const mappedTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project.name,
      projectName: t.project.name,
      clientName: t.project.contacts[0]?.name ?? "",
      budget: t.project.budget > 0 ? t.project.budget : parseBudgetFromDescription(t.description),
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      dueDate: t.dueDate ? t.dueDate.toISOString().split("T")[0] : "",
    }));

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
      project,
      projectName,
      clientName,
      contactId,
      priority,
      dueDate,
    } = body as {
      id?: string;
      status?: string;
      budget?: number;
      title?: string;
      project?: string;
      projectName?: string;
      clientName?: string;
      contactId?: string;
      priority?: string;
      dueDate?: string;
    };

    const resolvedProjectName = (projectName ?? project ?? "").trim();
    const isExistingTask = Boolean(id && typeof id === "string" && !/^\d+$/.test(id));

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
        let project = await prisma.project.findFirst({
          where: { name: resolvedProjectName, organizationId: orgId },
        });
        if (!project) {
          project = await prisma.project.create({
            data: {
              name: resolvedProjectName,
              organizationId: orgId,
              budget: typeof budget === "number" ? budget : 0,
            },
          });
        }
        projectId = project.id;
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
      }

      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: status ? status.toUpperCase() : undefined,
          priority: priority ? priority.toUpperCase() : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          title: title || undefined,
          projectId,
          description:
            clientName && !contactId
              ? `Client: ${clientName}${typeof budget === "number" ? ` | Budget: ${budget}` : ""}`
              : typeof budget === "number"
                ? `Budget: ${budget}`
                : undefined,
        },
      });

      if (status && id) {
        await captureServerEvent(userId, "task_status_changed", {
          taskId: id,
          status: status.toLowerCase(),
          organizationId: orgId,
        });
      }

      return NextResponse.json({ success: true, task: updatedTask });
    }

    if (!title || !resolvedProjectName) {
      return NextResponse.json({ success: false, error: "חסרים כותרת או שם פרויקט" }, { status: 400 });
    }

    let projectRecord = await prisma.project.findFirst({
      where: { name: resolvedProjectName, organizationId: orgId },
    });

    if (!projectRecord) {
      projectRecord = await prisma.project.create({
        data: {
          name: resolvedProjectName,
          organizationId: orgId,
          budget: typeof budget === "number" ? budget : 0,
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
    }

    const newTask = await prisma.task.create({
      data: {
        title,
        status: status ? status.toUpperCase() : "TODO",
        priority: priority ? priority.toUpperCase() : "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: projectRecord.id,
        organizationId: orgId,
        description: clientName ? `Client: ${clientName}` : null,
      },
    });

    await captureServerEvent(userId, "task_created", {
      taskId: newTask.id,
      organizationId: orgId,
    });

    return NextResponse.json({ success: true, task: newTask });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Project/Task Update Error");
  }
});
