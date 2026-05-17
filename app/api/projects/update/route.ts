import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";

export const GET = withWorkspacesAuth(async (_request, { orgId }) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { organizationId: orgId },
      include: {
        project: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const mappedTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project.name,
      clientName: "לקוח מ-DB",
      budget: 0,
      status: t.status.toLowerCase(),
      priority: t.priority.toLowerCase(),
      dueDate: t.dueDate ? t.dueDate.toISOString().split("T")[0] : "",
    }));

    return NextResponse.json(mappedTasks);
  } catch (error: unknown) {
    return apiErrorResponse(error, "Fetch Tasks Error");
  }
});

export const POST = withWorkspacesAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { id, status, budget, title, projectName, priority, dueDate } = body;

    const isExistingTask = id && !/^\d+$/.test(id);

    if (isExistingTask) {
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          status: status ? status.toUpperCase() : undefined,
          priority: priority ? priority.toUpperCase() : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          title: title || undefined,
          description: budget ? `Budget: ${budget}` : undefined,
        },
      });
      return NextResponse.json({ success: true, task: updatedTask });
    }

    let project = await prisma.project.findFirst({
      where: { name: projectName, organizationId: orgId },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          name: projectName,
          organizationId: orgId,
        },
      });
    }

    const newTask = await prisma.task.create({
      data: {
        title: title,
        status: status ? status.toUpperCase() : "TODO",
        priority: priority ? priority.toUpperCase() : "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId: project.id,
        organizationId: orgId,
        description: budget ? `Budget: ${budget}` : null,
      },
    });

    return NextResponse.json({ success: true, task: newTask });
  } catch (error: unknown) {
    return apiErrorResponse(error, "Project/Task Update Error");
  }
});
